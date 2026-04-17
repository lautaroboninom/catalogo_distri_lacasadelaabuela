#!/usr/bin/env python3
"""
Sync product images end-to-end:
- Reads products from Firestore.
- Resolves brand images from local overrides -> Open Food Facts -> Wikimedia -> Bing.
- Generates generic images with OpenAI Images API when brand resolution is not possible.
- Normalizes image to 800x800 JPEG.
- Uploads files to Firebase Storage at products/{sku}.jpg.
- Updates Firestore product docs with image metadata.
- Produces backup, report, and checkpoint artifacts.

Rollback mode:
- Restores previous image fields from a backup file.
"""

from __future__ import annotations

import argparse
import base64
import csv
import dataclasses
import datetime as dt
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import uuid
from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

import requests
from PIL import Image, ImageOps

try:
    import firebase_admin
    from firebase_admin import credentials, firestore, storage
except ImportError:  # pragma: no cover - import guard
    firebase_admin = None
    credentials = None
    firestore = None
    storage = None


OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
WIKIMEDIA_API_URL = "https://commons.wikimedia.org/w/api.php"
BING_IMAGES_URL = "https://www.bing.com/images/search"
OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations"

HTTP_TIMEOUT = 25
HTTP_MAX_RETRIES = 3
HTTP_RETRY_BACKOFF = 1.5
IMAGE_TARGET_SIZE = 800

PLACEHOLDER_HOSTS = {
    "ui-avatars.com",
    "picsum.photos",
}

BRAND_ALIASES: Dict[str, str] = {
    "quilmes": "quilmes",
    "brahma": "brahma",
    "budweiser": "budweiser",
    "palermo": "palermo",
    "heineken": "heineken",
    "stella artois": "stella artois",
    "stella": "stella artois",
    "miller": "miller",
    "imperial": "imperial",
    "amstel": "amstel",
    "schneider": "schneider",
    "warsteiner": "warsteiner",
    "wasteiner": "warsteiner",
    "isenbeck": "isenbeck",
    "coca cola": "coca cola",
    "coca": "coca cola",
    "fanta": "fanta",
    "sprite": "sprite",
    "pepsi": "pepsi",
    "seven up": "seven up",
    "7up": "seven up",
    "cunnington": "cunnington",
    "manaos": "manaos",
    "torasso": "torasso",
    "aquarius": "aquarius",
    "levite": "levite",
    "fresh": "fresh",
    "brio": "brio",
    "placer": "placer",
    "baggio": "baggio",
    "bggio": "baggio",
    "gatorade": "gatorade",
    "cepita": "cepita",
    "villavicencio": "villavicencio",
    "cellier": "cellier",
    "gancia": "gancia",
    "aperol": "aperol",
    "dr lemon": "dr lemon",
    "drlemon": "dr lemon",
    "cinzano": "cinzano",
    "smirnoff": "smirnoff",
    "sernova": "sernova",
    "skyy": "skyy",
    "fernet branca": "fernet branca",
    "branca": "fernet branca",
    "1882": "fernet 1882",
    "campari": "campari",
    "red label": "johnnie walker red label",
    "johnnie walker": "johnnie walker red label",
    "speed": "speed",
    "monster": "monster",
    "uvita": "uvita",
    "termidor": "termidor",
    "rutini": "rutini",
    "guaymallen": "guaymallen",
    "jorgito": "jorgito",
    "oreo": "oreo",
    "pepitos": "pepitos",
    "chocolinas": "chocolinas",
    "taragui": "taragui",
    "playadito": "playadito",
    "cbse": "cbse",
    "rosamonte": "rosamonte",
    "hellmann": "hellmanns",
    "hellmans": "hellmanns",
    "natura": "natura",
    "canuelas": "canuelas",
    "cañuelas": "canuelas",
    "knorr": "knorr",
    "lucchetti": "lucchetti",
    "luchetti": "lucchetti",
    "pureza": "pureza",
    "ledesma": "ledesma",
    "raid": "raid",
    "off": "off",
    "marlboro": "marlboro",
    "lucky strike": "lucky strike",
    "philip morris": "philip morris",
    "chesterfield": "chesterfield",
    "chesterfiled": "chesterfield",
    "hall": "hall",
    "halls": "hall",
    "actron": "actron",
    "tafirol": "tafirol",
    "geniol": "geniol",
    "ibupirac": "ibupirac",
}

GENERIC_HINT_TOKENS = {
    "pan",
    "caramelo",
    "gomitas",
    "papas",
    "palitos",
    "chisitos",
    "chupetin",
    "alfajor",
    "fideos",
    "azucar",
    "harina",
    "sal",
    "moneda",
    "media",
    "mini",
}

STOPWORDS = {
    "x",
    "de",
    "con",
    "sin",
    "para",
    "un",
    "una",
    "ml",
    "cc",
    "l",
    "lt",
    "litro",
    "litros",
    "kg",
    "gr",
    "g",
    "u",
    "ud",
    "uds",
    "unidad",
    "unidades",
    "botella",
    "lata",
    "pack",
    "cajon",
    "caja",
}

TRUSTED_DOMAIN_BONUS = {
    "images.openfoodfacts.org": 0.2,
    "openfoodfacts.org": 0.15,
    "upload.wikimedia.org": 0.15,
    "commons.wikimedia.org": 0.1,
    "vtexassets.com": 0.08,
    "jumboargentina.vtexassets.com": 0.1,
    "masonlineprod.vtexassets.com": 0.1,
}


@dataclasses.dataclass
class ProductRecord:
    doc_id: str
    name: str
    sku: str
    description: str
    category: str
    raw: Dict[str, Any]


@dataclasses.dataclass
class CandidateImage:
    url: str
    source: str
    score: float
    label: str
    brand: Optional[str] = None


class PipelineError(RuntimeError):
    pass


class ImageSyncPipeline:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.repo_root = Path(__file__).resolve().parents[1]
        self.timestamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        self.artifacts_dir = (self.repo_root / args.artifacts_dir).resolve()
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.backup_path = Path(args.backup_path).resolve() if args.backup_path else self.artifacts_dir / f"images-backup-{self.timestamp}.json"
        self.report_path = Path(args.report_path).resolve() if args.report_path else self.artifacts_dir / f"images-report-{self.timestamp}.csv"
        self.checkpoint_path = Path(args.checkpoint_path).resolve() if args.checkpoint_path else self.artifacts_dir / "images-checkpoint.json"
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": "catalog-image-sync/1.0 (+python-requests)"})
        self.off_cache: Dict[str, List[CandidateImage]] = {}
        self.wikimedia_cache: Dict[str, List[CandidateImage]] = {}
        self.bing_cache: Dict[str, List[CandidateImage]] = {}
        self.image_bytes_cache: Dict[str, bytes] = {}
        self.generated_cache: Dict[str, bytes] = {}
        self.brand_memory: Dict[str, List[CandidateImage]] = defaultdict(list)
        self.checkpoint: Dict[str, Any] = {}
        self.processed_ids: Set[str] = set()
        self.db = None
        self.bucket = None
        self.config = self._load_firebase_config()
        self.openai_api_key = args.openai_api_key or os.getenv("OPENAI_API_KEY", "")
        self._bootstrap_local_overrides()

    def _load_firebase_config(self) -> Dict[str, Any]:
        config_path = self.repo_root / "firebase-applet-config.json"
        if not config_path.exists():
            raise PipelineError(f"Firebase config not found: {config_path}")
        with config_path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _bootstrap_local_overrides(self) -> None:
        seed_path = self.repo_root / "public" / "products.json"
        if not seed_path.exists():
            return
        try:
            data = json.loads(seed_path.read_text(encoding="utf-8"))
        except Exception:
            return
        for prod in data:
            name = str(prod.get("name", "")).strip()
            url = str(prod.get("imageUrl", "")).strip()
            if not name or not self._is_valid_external_image_url(url):
                continue
            norm = normalize_text(name)
            brand = detect_brand(norm)
            score = 1.0
            candidate = CandidateImage(
                url=url,
                source="local_override_seed",
                score=score,
                label=name,
                brand=brand,
            )
            if brand:
                self.brand_memory[brand].append(candidate)

        manual_override_path = self.repo_root / "scripts" / "image_overrides.json"
        if manual_override_path.exists():
            try:
                rows = json.loads(manual_override_path.read_text(encoding="utf-8"))
            except Exception:
                rows = []
            if isinstance(rows, list):
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    url = str(row.get("url", "")).strip()
                    label = str(row.get("match", "")).strip()
                    if not url or not label or not self._is_valid_external_image_url(url):
                        continue
                    brand = detect_brand(normalize_text(str(row.get("brand", label))))
                    candidate = CandidateImage(
                        url=url,
                        source="local_override_manual",
                        score=2.0,
                        label=label,
                        brand=brand,
                    )
                    if brand:
                        self.brand_memory[brand].append(candidate)

    def _init_firebase(self) -> None:
        if firebase_admin is None or credentials is None or firestore is None or storage is None:
            raise PipelineError(
                "Missing dependency 'firebase-admin'. Install with:\n"
                "  python -m pip install -r scripts/requirements-image-sync.txt"
            )
        svc_path = self.args.service_account or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        if not svc_path:
            raise PipelineError("Missing service account path. Use --service-account or GOOGLE_APPLICATION_CREDENTIALS.")
        svc = Path(svc_path).expanduser().resolve()
        if not svc.exists():
            raise PipelineError(f"Service account file not found: {svc}")

        project_id = self.args.project_id or self.config.get("projectId")
        database_id = self.args.database_id or self.config.get("firestoreDatabaseId")
        bucket_name = self.args.bucket or self.config.get("storageBucket")
        if not bucket_name:
            raise PipelineError("Missing storage bucket. Use --bucket or set storageBucket in firebase-applet-config.json.")

        cred = credentials.Certificate(str(svc))
        options: Dict[str, Any] = {"projectId": project_id, "storageBucket": bucket_name}

        if not firebase_admin._apps:
            firebase_admin.initialize_app(cred, options=options)

        try:
            self.db = firestore.client(database_id=database_id)
        except TypeError:
            self.db = firestore.client()
            print("Warning: installed firebase-admin does not support custom database_id; using default Firestore database.", file=sys.stderr)

        self.bucket = storage.bucket(bucket_name)

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        last_error: Optional[Exception] = None
        for attempt in range(1, HTTP_MAX_RETRIES + 1):
            try:
                resp = self.http.request(method, url, timeout=HTTP_TIMEOUT, **kwargs)
                if resp.status_code in {429, 500, 502, 503, 504} and attempt < HTTP_MAX_RETRIES:
                    time.sleep(HTTP_RETRY_BACKOFF * attempt)
                    continue
                return resp
            except requests.RequestException as exc:
                last_error = exc
                if attempt < HTTP_MAX_RETRIES:
                    time.sleep(HTTP_RETRY_BACKOFF * attempt)
                    continue
                raise
        raise PipelineError(f"HTTP request failed for {url}: {last_error}")

    def _is_valid_external_image_url(self, url: str) -> bool:
        if not url:
            return False
        try:
            parsed = urllib.parse.urlparse(url)
        except ValueError:
            return False
        if parsed.scheme not in {"http", "https"}:
            return False
        host = (parsed.netloc or "").lower()
        if host in PLACEHOLDER_HOSTS:
            return False
        if "ui-avatars.com" in host or "picsum.photos" in host:
            return False
        return True

    def _fetch_products(self) -> List[ProductRecord]:
        if not self.db:
            raise PipelineError("Firestore client not initialized.")
        docs = self.db.collection("products").stream()
        out: List[ProductRecord] = []
        for doc in docs:
            raw = doc.to_dict() or {}
            name = str(raw.get("name", "")).strip()
            sku = str(raw.get("sku", "")).strip() or doc.id
            out.append(
                ProductRecord(
                    doc_id=doc.id,
                    name=name or doc.id,
                    sku=sku,
                    description=str(raw.get("description", "")),
                    category=str(raw.get("category", "")),
                    raw=raw,
                )
            )
        out.sort(key=lambda p: (p.sku.lower(), p.name.lower()))
        if self.args.pilot_limit:
            out = out[: self.args.pilot_limit]
        elif self.args.limit:
            out = out[: self.args.limit]
        return out

    def _create_backup(self, products: Sequence[ProductRecord]) -> None:
        payload = {
            "createdAt": utc_now_iso(),
            "count": len(products),
            "items": [],
        }
        for p in products:
            raw = p.raw
            field_presence = {
                "imageUrl": "imageUrl" in raw,
                "imageSourceType": "imageSourceType" in raw,
                "imageSourceUrl": "imageSourceUrl" in raw,
                "imageUpdatedAt": "imageUpdatedAt" in raw,
            }
            payload["items"].append(
                {
                    "docId": p.doc_id,
                    "sku": p.sku,
                    "name": p.name,
                    "fieldPresence": field_presence,
                    "previous": {
                        "imageUrl": raw.get("imageUrl"),
                        "imageSourceType": raw.get("imageSourceType"),
                        "imageSourceUrl": raw.get("imageSourceUrl"),
                        "imageUpdatedAt": raw.get("imageUpdatedAt"),
                    },
                }
            )
        self.backup_path.parent.mkdir(parents=True, exist_ok=True)
        self.backup_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def _init_report(self) -> None:
        self.report_path.parent.mkdir(parents=True, exist_ok=True)
        if self.report_path.exists() and self.args.resume:
            return
        with self.report_path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "timestamp",
                    "doc_id",
                    "sku",
                    "name",
                    "classification",
                    "source_type",
                    "source_detail",
                    "storage_path",
                    "download_url",
                    "status",
                    "error",
                ]
            )

    def _append_report(
        self,
        product: ProductRecord,
        classification: str,
        source_type: str,
        source_detail: str,
        storage_path: str,
        download_url: str,
        status: str,
        error: str = "",
    ) -> None:
        with self.report_path.open("a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    utc_now_iso(),
                    product.doc_id,
                    product.sku,
                    product.name,
                    classification,
                    source_type,
                    source_detail,
                    storage_path,
                    download_url,
                    status,
                    error,
                ]
            )

    def _load_checkpoint(self) -> None:
        if self.args.resume and self.checkpoint_path.exists():
            try:
                data = json.loads(self.checkpoint_path.read_text(encoding="utf-8"))
                self.checkpoint = data
                self.processed_ids = set(data.get("processedDocIds", []))
                return
            except Exception:
                pass
        self.checkpoint = {
            "createdAt": utc_now_iso(),
            "updatedAt": utc_now_iso(),
            "processedDocIds": [],
            "backupPath": str(self.backup_path),
            "reportPath": str(self.report_path),
            "mode": "sync",
        }
        self.processed_ids = set()

    def _save_checkpoint(self) -> None:
        self.checkpoint["updatedAt"] = utc_now_iso()
        self.checkpoint["processedDocIds"] = sorted(self.processed_ids)
        self.checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
        self.checkpoint_path.write_text(json.dumps(self.checkpoint, ensure_ascii=False, indent=2), encoding="utf-8")

    def _resolve_local_candidates(self, product: ProductRecord, brand: Optional[str]) -> List[CandidateImage]:
        if not brand:
            return []
        candidates = list(self.brand_memory.get(brand, []))
        if not candidates:
            return []
        product_tokens = set(tokenize(product.name))
        ranked: List[CandidateImage] = []
        for c in candidates:
            score = score_text_similarity(product_tokens, set(tokenize(c.label)))
            ranked.append(dataclasses.replace(c, source="local_override", score=score + 0.3))
        ranked.sort(key=lambda c: c.score, reverse=True)
        return ranked[:8]

    def _resolve_openfoodfacts_candidates(self, product: ProductRecord, brand: Optional[str]) -> List[CandidateImage]:
        query = f"{product.name} {product.category}".strip()
        key = normalize_text(query)
        if key in self.off_cache:
            return self.off_cache[key]

        params = {
            "search_terms": query,
            "search_simple": 1,
            "action": "process",
            "json": 1,
            "page_size": 20,
        }
        resp = self._request("GET", OFF_SEARCH_URL, params=params)
        out: List[CandidateImage] = []
        if resp.ok:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            products = payload.get("products") or []
            src_tokens = set(tokenize(product.name))
            for row in products:
                if not isinstance(row, dict):
                    continue
                url = row.get("image_front_url") or row.get("image_url") or ""
                if not self._is_valid_external_image_url(str(url)):
                    continue
                product_name = str(row.get("product_name", ""))
                brands = str(row.get("brands", ""))
                label = f"{product_name} {brands}".strip()
                score = score_text_similarity(src_tokens, set(tokenize(label)))
                if brand and brand in normalize_text(brands):
                    score += 0.35
                score += domain_bonus(url)
                out.append(
                    CandidateImage(
                        url=str(url),
                        source="openfoodfacts",
                        score=score,
                        label=label or str(url),
                        brand=brand,
                    )
                )
        out.sort(key=lambda c: c.score, reverse=True)
        self.off_cache[key] = out[:12]
        return self.off_cache[key]

    def _resolve_wikimedia_candidates(self, product: ProductRecord, brand: Optional[str]) -> List[CandidateImage]:
        query = f"{product.name} product package"
        key = normalize_text(query)
        if key in self.wikimedia_cache:
            return self.wikimedia_cache[key]

        params = {
            "action": "query",
            "format": "json",
            "generator": "search",
            "gsrsearch": f'filetype:bitmap "{product.name}"',
            "gsrnamespace": 6,
            "gsrlimit": 15,
            "prop": "imageinfo",
            "iiprop": "url",
        }
        resp = self._request("GET", WIKIMEDIA_API_URL, params=params)
        out: List[CandidateImage] = []
        if resp.ok:
            try:
                payload = resp.json()
            except Exception:
                payload = {}
            pages = (payload.get("query") or {}).get("pages") or {}
            src_tokens = set(tokenize(product.name))
            for page in pages.values():
                if not isinstance(page, dict):
                    continue
                title = str(page.get("title", ""))
                infos = page.get("imageinfo") or []
                if not infos:
                    continue
                url = str(infos[0].get("url", ""))
                if not self._is_valid_external_image_url(url):
                    continue
                score = score_text_similarity(src_tokens, set(tokenize(title)))
                if brand and brand in normalize_text(title):
                    score += 0.25
                score += domain_bonus(url)
                out.append(CandidateImage(url=url, source="wikimedia", score=score, label=title, brand=brand))
        out.sort(key=lambda c: c.score, reverse=True)
        self.wikimedia_cache[key] = out[:12]
        return self.wikimedia_cache[key]

    def _resolve_bing_candidates(self, product: ProductRecord, brand: Optional[str]) -> List[CandidateImage]:
        query = f"{product.name} producto"
        key = normalize_text(query)
        if key in self.bing_cache:
            return self.bing_cache[key]

        resp = self._request(
            "GET",
            BING_IMAGES_URL,
            params={"q": query, "form": "HDRSC2"},
            headers={"User-Agent": "Mozilla/5.0"},
        )
        out: List[CandidateImage] = []
        if resp.ok:
            html_text = resp.text
            urls = re.findall(r'murl&quot;:&quot;(.*?)&quot;,&quot;turl', html_text)
            seen: Set[str] = set()
            src_tokens = set(tokenize(product.name))
            for raw_url in urls:
                url = html.unescape(raw_url)
                if url in seen:
                    continue
                seen.add(url)
                if not self._is_valid_external_image_url(url):
                    continue
                url_tokens = set(tokenize(url))
                score = score_text_similarity(src_tokens, url_tokens) + domain_bonus(url)
                if brand and brand in normalize_text(url):
                    score += 0.25
                out.append(CandidateImage(url=url, source="bing", score=score, label=url, brand=brand))
        out.sort(key=lambda c: c.score, reverse=True)
        self.bing_cache[key] = out[:20]
        return self.bing_cache[key]

    def _download_candidate_bytes(self, url: str) -> bytes:
        if url in self.image_bytes_cache:
            return self.image_bytes_cache[url]
        resp = self._request("GET", url, stream=False)
        if not resp.ok:
            raise PipelineError(f"Image download failed ({resp.status_code}): {url}")
        content_type = (resp.headers.get("Content-Type") or "").lower()
        if "image" not in content_type:
            raise PipelineError(f"URL is not an image ({content_type}): {url}")
        blob = resp.content
        if len(blob) < 2048:
            raise PipelineError(f"Image payload too small ({len(blob)} bytes): {url}")
        self.image_bytes_cache[url] = blob
        return blob

    def _process_image_bytes(self, blob: bytes) -> bytes:
        with Image.open(io.BytesIO(blob)) as img:
            img = ImageOps.exif_transpose(img)
            if img.mode not in ("RGB", "L"):
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode in ("RGBA", "LA"):
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img = background
            elif img.mode == "L":
                img = img.convert("RGB")

            img.thumbnail((IMAGE_TARGET_SIZE, IMAGE_TARGET_SIZE), Image.Resampling.LANCZOS)
            canvas = Image.new("RGB", (IMAGE_TARGET_SIZE, IMAGE_TARGET_SIZE), (255, 255, 255))
            x = (IMAGE_TARGET_SIZE - img.width) // 2
            y = (IMAGE_TARGET_SIZE - img.height) // 2
            canvas.paste(img, (x, y))

            out = io.BytesIO()
            canvas.save(out, format="JPEG", quality=90, optimize=True, progressive=True)
            return out.getvalue()

    def _upload_to_storage(self, sku: str, jpeg_bytes: bytes) -> Tuple[str, str]:
        if not self.bucket:
            raise PipelineError("Storage bucket not initialized.")
        safe = sanitize_for_path(sku)
        storage_path = f"products/{safe}.jpg"
        blob = self.bucket.blob(storage_path)
        token = str(uuid.uuid4())
        blob.cache_control = "public,max-age=86400"
        blob.metadata = {"firebaseStorageDownloadTokens": token}
        blob.upload_from_string(jpeg_bytes, content_type="image/jpeg")
        blob.patch()
        encoded = urllib.parse.quote(storage_path, safe="")
        download_url = f"https://firebasestorage.googleapis.com/v0/b/{self.bucket.name}/o/{encoded}?alt=media&token={token}"
        return storage_path, download_url

    def _update_firestore_image_fields(
        self,
        product: ProductRecord,
        download_url: str,
        source_type: str,
        source_detail: str,
    ) -> None:
        if not self.db:
            raise PipelineError("Firestore client not initialized.")
        payload = {
            "imageUrl": download_url,
            "imageSourceType": source_type,
            "imageSourceUrl": source_detail,
            "imageUpdatedAt": utc_now_iso(),
        }
        self.db.collection("products").document(product.doc_id).update(payload)

    def _restore_fields(self, backup_item: Dict[str, Any]) -> None:
        if not self.db:
            raise PipelineError("Firestore client not initialized.")
        doc_id = str(backup_item.get("docId", "")).strip()
        if not doc_id:
            return
        previous = backup_item.get("previous") or {}
        field_presence = backup_item.get("fieldPresence") or {}
        payload: Dict[str, Any] = {}
        for key in ("imageUrl", "imageSourceType", "imageSourceUrl", "imageUpdatedAt"):
            if field_presence.get(key):
                payload[key] = previous.get(key)
            else:
                payload[key] = firestore.DELETE_FIELD
        self.db.collection("products").document(doc_id).update(payload)

    def _detect_classification(self, product: ProductRecord) -> Tuple[str, Optional[str]]:
        norm = normalize_text(product.name)
        brand = detect_brand(norm)
        if brand:
            return "brand", brand
        tokens = set(tokenize(product.name))
        if tokens & GENERIC_HINT_TOKENS:
            return "generic", None
        return "generic", None

    def _generate_generic_image(self, product: ProductRecord) -> bytes:
        if not self.openai_api_key:
            raise PipelineError("OPENAI_API_KEY is required for generic image generation.")
        key = normalize_text(product.name)
        if key in self.generated_cache:
            return self.generated_cache[key]

        prompt = (
            "Packshot studio photo of a generic grocery product. "
            f"Product description: {product.name}. "
            "Neutral white background, centered item, realistic packaging style, "
            "no brand logos, no fictional brand text, no watermark."
        )
        payload = {
            "model": self.args.openai_image_model,
            "prompt": prompt,
            "size": "1024x1024",
            "response_format": "b64_json",
        }
        headers = {
            "Authorization": f"Bearer {self.openai_api_key}",
            "Content-Type": "application/json",
        }
        resp = self._request("POST", OPENAI_IMAGES_URL, headers=headers, json=payload)
        if not resp.ok:
            raise PipelineError(f"OpenAI image generation failed ({resp.status_code}): {resp.text[:300]}")
        data = resp.json()
        rows = data.get("data") or []
        if not rows:
            raise PipelineError("OpenAI image response did not contain data.")
        row = rows[0]
        raw_bytes: Optional[bytes] = None
        if isinstance(row, dict):
            b64 = row.get("b64_json")
            url = row.get("url")
            if b64:
                raw_bytes = base64.b64decode(b64)
            elif url:
                raw_bytes = self._download_candidate_bytes(str(url))
        if not raw_bytes:
            raise PipelineError("OpenAI image response did not include a usable image.")
        processed = self._process_image_bytes(raw_bytes)
        self.generated_cache[key] = processed
        return processed

    def _resolve_brand_image(self, product: ProductRecord, brand: str) -> Tuple[bytes, str]:
        providers = [
            ("local_override", self._resolve_local_candidates),
            ("openfoodfacts", self._resolve_openfoodfacts_candidates),
            ("wikimedia", self._resolve_wikimedia_candidates),
            ("bing", self._resolve_bing_candidates),
        ]
        for provider_name, provider in providers:
            candidates = provider(product, brand)
            if self.args.debug:
                print(f"[debug] {product.sku} {provider_name}: {len(candidates)} candidate(s)")
            for candidate in candidates:
                try:
                    raw = self._download_candidate_bytes(candidate.url)
                    processed = self._process_image_bytes(raw)
                    self.brand_memory[brand].append(candidate)
                    return processed, candidate.url
                except Exception:
                    continue

        memory_candidates = self.brand_memory.get(brand, [])
        for candidate in sorted(memory_candidates, key=lambda c: c.score, reverse=True):
            try:
                raw = self._download_candidate_bytes(candidate.url)
                processed = self._process_image_bytes(raw)
                return processed, candidate.url
            except Exception:
                continue
        raise PipelineError(f"No brand candidate could be resolved for {product.sku} ({product.name})")

    def run_sync(self) -> None:
        self._init_firebase()
        self._load_checkpoint()
        products = self._fetch_products()
        if not products:
            print("No products found in Firestore.")
            return

        if not self.args.resume:
            self._create_backup(products)
            self.checkpoint["backupPath"] = str(self.backup_path)
        self._init_report()

        total = len(products)
        print(f"Starting image sync for {total} products.")
        for idx, product in enumerate(products, start=1):
            if product.doc_id in self.processed_ids:
                continue

            classification, brand = self._detect_classification(product)
            source_type = "brand_web"
            source_detail = ""
            storage_path = ""
            download_url = ""
            status = "updated"
            err_text = ""

            try:
                if classification == "brand" and brand:
                    try:
                        jpeg_bytes, source_detail = self._resolve_brand_image(product, brand)
                    except Exception:
                        source_type = "generated"
                        source_detail = f"openai:{self.args.openai_image_model}:fallback_for_brand:{brand}"
                        jpeg_bytes = self._generate_generic_image(product)
                else:
                    source_type = "generated"
                    source_detail = f"openai:{self.args.openai_image_model}"
                    jpeg_bytes = self._generate_generic_image(product)

                storage_path, download_url = self._upload_to_storage(product.sku, jpeg_bytes)
                if not self.args.dry_run:
                    self._update_firestore_image_fields(product, download_url, source_type, source_detail)
            except Exception as exc:
                status = "error"
                err_text = str(exc)

            self._append_report(
                product=product,
                classification=classification,
                source_type=source_type,
                source_detail=source_detail,
                storage_path=storage_path,
                download_url=download_url,
                status=status,
                error=err_text,
            )
            if status == "updated":
                self.processed_ids.add(product.doc_id)
            self._save_checkpoint()

            if self.args.debug or status == "error":
                print(f"[{idx}/{total}] {product.sku} - {status} {err_text}")
            else:
                print(f"[{idx}/{total}] {product.sku} - {status}")

        print("Sync finished.")
        print(f"Backup: {self.backup_path}")
        print(f"Report: {self.report_path}")
        print(f"Checkpoint: {self.checkpoint_path}")

    def run_rollback(self) -> None:
        self._init_firebase()
        rollback_path = Path(self.args.rollback).expanduser().resolve()
        if not rollback_path.exists():
            raise PipelineError(f"Rollback file does not exist: {rollback_path}")
        payload = json.loads(rollback_path.read_text(encoding="utf-8"))
        items = payload.get("items") or []
        if not isinstance(items, list):
            raise PipelineError("Invalid rollback file format: 'items' must be a list.")
        print(f"Starting rollback for {len(items)} products from {rollback_path}")
        errors = 0
        for i, item in enumerate(items, start=1):
            try:
                self._restore_fields(item)
                print(f"[{i}/{len(items)}] restored {item.get('docId')}")
            except Exception as exc:
                errors += 1
                print(f"[{i}/{len(items)}] error {item.get('docId')}: {exc}", file=sys.stderr)
        print(f"Rollback finished with {errors} error(s).")


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    value = value.lower()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return value.strip()


def tokenize(text: str) -> List[str]:
    out: List[str] = []
    for tok in normalize_text(text).split():
        if tok in STOPWORDS:
            continue
        out.append(tok)
    return out


def detect_brand(normalized_name: str) -> Optional[str]:
    if not normalized_name:
        return None
    # Longest aliases first to prefer multi-word brand matches.
    aliases = sorted(BRAND_ALIASES.items(), key=lambda item: len(item[0]), reverse=True)
    for alias, canonical in aliases:
        if alias in normalized_name:
            return canonical
    return None


def score_text_similarity(a_tokens: Set[str], b_tokens: Set[str]) -> float:
    if not a_tokens or not b_tokens:
        return 0.0
    jaccard = len(a_tokens & b_tokens) / max(1, len(a_tokens | b_tokens))
    a_join = " ".join(sorted(a_tokens))
    b_join = " ".join(sorted(b_tokens))
    seq = SequenceMatcher(None, a_join, b_join).ratio()
    return (jaccard * 0.65) + (seq * 0.35)


def domain_bonus(url: str) -> float:
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return 0.0
    bonus = 0.0
    for domain, value in TRUSTED_DOMAIN_BONUS.items():
        if host.endswith(domain):
            bonus = max(bonus, value)
    return bonus


def sanitize_for_path(value: str) -> str:
    safe = normalize_text(value).replace(" ", "-")
    safe = re.sub(r"[^a-z0-9\-]+", "", safe).strip("-")
    return safe or f"item-{uuid.uuid4().hex[:8]}"


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync product images to Firebase Storage + Firestore.")
    parser.add_argument("--service-account", default="", help="Path to Firebase service account JSON file.")
    parser.add_argument("--project-id", default="", help="Firebase project ID override.")
    parser.add_argument("--database-id", default="", help="Firestore database ID override.")
    parser.add_argument("--bucket", default="", help="Firebase Storage bucket override.")
    parser.add_argument("--openai-api-key", default="", help="OpenAI API key override (defaults to OPENAI_API_KEY).")
    parser.add_argument("--openai-image-model", default="gpt-image-1", help="OpenAI image model for generic items.")
    parser.add_argument("--pilot-limit", type=int, default=0, help="Process only first N products (pilot).")
    parser.add_argument("--limit", type=int, default=0, help="Process only first N products.")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint file.")
    parser.add_argument("--dry-run", action="store_true", help="Resolve/upload/report but skip Firestore updates.")
    parser.add_argument("--rollback", default="", help="Rollback from backup JSON file.")
    parser.add_argument("--artifacts-dir", default="artifacts", help="Artifacts directory (backup/report/checkpoint).")
    parser.add_argument("--backup-path", default="", help="Custom backup JSON output path.")
    parser.add_argument("--report-path", default="", help="Custom CSV report output path.")
    parser.add_argument("--checkpoint-path", default="", help="Custom checkpoint JSON output path.")
    parser.add_argument("--debug", action="store_true", help="Verbose debug logging.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    pipeline = ImageSyncPipeline(args)
    try:
        if args.rollback:
            pipeline.run_rollback()
        else:
            pipeline.run_sync()
    except KeyboardInterrupt:
        print("Interrupted by user.", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"Fatal error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
