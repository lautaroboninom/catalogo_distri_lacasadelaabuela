#!/usr/bin/env python3
"""
Reclassify product categories across local seed files and Firestore.

Supports:
- dry-run and apply modes
- local JSON updates (src/data/products.json and public/products.json)
- Firestore products category updates
- Firestore promotions migration for targetType=category:
  * direct 1:1 mapping is auto-updated
  * mixed/ambiguous categories are only reported

Artifacts:
- JSON backup with detected changes
- CSV report for product category transitions
- CSV report for promotion transitions
- CSV report for promotion pending/manual review
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import re
import sys
import unicodedata
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    import firebase_admin
    from firebase_admin import credentials, firestore
except ImportError:  # pragma: no cover - optional dependency
    firebase_admin = None
    credentials = None
    firestore = None


CAT_ALMACEN = "Almac\u00e9n"
CAT_AZUCAR = "Az\u00facar"
CAT_ANALGESICOS = "Analg\u00e9sicos"

CANONICAL_CATEGORIES: List[str] = [
    "Todas",
    "Cervezas",
    "Gaseosas",
    CAT_ALMACEN,
    "Aguas",
    "Aperitivos",
    "Vinos",
    "Petacas",
    "Fideos",
    "Arroz",
    "Pure",
    CAT_AZUCAR,
    "Alfajores",
    "Turrones",
    "Galletitas",
    "Yerbas",
    "Golosinas",
    "Snack",
    "Cigarrillos",
    CAT_ANALGESICOS,
    "Panificados",
]

CANONICAL_BY_KEY: Dict[str, str] = {
    "cervezas": "Cervezas",
    "gaseosas": "Gaseosas",
    "almacen": CAT_ALMACEN,
    "aguas": "Aguas",
    "aperitivos": "Aperitivos",
    "vinos": "Vinos",
    "petacas": "Petacas",
    "fideos": "Fideos",
    "arroz": "Arroz",
    "pure": "Pure",
    "azucar": CAT_AZUCAR,
    "alfajores": "Alfajores",
    "turrones": "Turrones",
    "galletitas": "Galletitas",
    "yerbas": "Yerbas",
    "golosinas": "Golosinas",
    "snack": "Snack",
    "cigarrillos": "Cigarrillos",
    "analgesicos": CAT_ANALGESICOS,
    "panificados": "Panificados",
}

BEER_KEYWORDS = (
    "quilmes",
    "brahma",
    "budweiser",
    "palermo",
    "1890",
    "heineken",
    "stella",
    "miller",
    "imperial",
    "amstel",
    "isenbeck",
    "schneider",
    "warsteiner",
    "wasteiner",
    "laton",
    "lata 361",
    "361 descartable",
)

SODA_WATER_KEYWORDS = ("cimes", "manaosx", "manaos x", "torasso")
SODA_APERITIVO_KEYWORDS = (
    "gancia",
    "aperol",
    "pronto",
    "dr lemon",
    "cinzano",
    "smirnoff",
    "sernova",
    "new style",
    "skyy",
    "fernet",
    "licor",
    "tia maria",
    "granadina",
    "gin ",
    "campari",
    "red label",
    "legui",
    "ombu",
    "bayles",
    "amarula",
    "mariposa",
    "champaing",
    "fernando",
    "speed",
    "monster",
    "baly",
)

TOBACCO_KEYWORDS = (
    "lucky",
    "marlboro",
    "philip",
    "chester",
    "red point",
    "melbourne",
    "dolchester",
    "master",
    "milenio",
)

ALFAJOR_KEYWORDS = ("alfajor", "alfajorcito", "guaymallen", "jorgito", "rasta", "fulbito")
SNACK_TO_GOLOSINAS_KEYWORDS = ("naranju", "mielcitas")
GOLOSINAS_TO_SNACK_KEYWORDS = ("saladix", "pipas", "mani", "papas", "chisit", "3d", "palitos")
PURE_CORE_KEYWORDS = ("molto", "noel", "pure")

MIXED_PROMOTION_KEYS = {"soda", "pure", "lucky", "galletitas", "golosinas", "snack"}
DIRECT_PROMOTION_MAP: Dict[str, str] = {
    "latas": "Cervezas",
    "gaseosas": "Gaseosas",
    "manaos": "Gaseosas",
    "seven": "Gaseosas",
    "aguas": "Aguas",
    "baggio": "Aguas",
    "corazon": "Aguas",
    "sidra": "Vinos",
    "vinos": "Vinos",
    "pan": "Panificados",
    "pandolchito": "Panificados",
    "analgesicos": CAT_ANALGESICOS,
    "confituras": "Golosinas",
    "guaymallen": "Alfajores",
    "repelente": CAT_ALMACEN,
    "fideos": "Fideos",
    "arroz": "Arroz",
    "petacas": "Petacas",
    "yerbas": "Yerbas",
    "turrones": "Turrones",
    "alfajores": "Alfajores",
    "cigarrillos": "Cigarrillos",
    "cervezas": "Cervezas",
    "azucar": CAT_AZUCAR,
    "almacen": "Cervezas",
    "analgsicos": CAT_ANALGESICOS,
}


@dataclass
class ProductChange:
    scope: str
    identifier: str
    sku: str
    name: str
    old_category: str
    new_category: str
    rule: str
    changed: bool


@dataclass
class PromotionDecision:
    promo_id: str
    name: str
    old_target: str
    new_target: str
    status: str
    note: str


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    normalized = normalized.lower()
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def category_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value))


def contains_any(text: str, patterns: Sequence[str]) -> bool:
    return any(pattern in text for pattern in patterns)


def classify_product(category_raw: str, name_raw: str) -> Tuple[str, str]:
    name_norm = normalize_text(name_raw)
    cat_key = category_key(category_raw)

    # Rule 1
    if cat_key == "latas":
        return "Cervezas", "rule_01_latas_to_cervezas"
    if cat_key.startswith("almac"):
        if contains_any(name_norm, BEER_KEYWORDS):
            return "Cervezas", "rule_01_almacen_beer_to_cervezas"
        return CAT_ALMACEN, "rule_01_almacen_non_beer"

    # Rule 2
    if cat_key in {"gaseosas", "manaos", "seven"}:
        return "Gaseosas", "rule_02_soft_drinks_to_gaseosas"

    # Rule 3
    if cat_key in {"aguas", "baggio", "corazon"}:
        return "Aguas", "rule_03_waters_to_aguas"

    # Rule 4
    if cat_key == "soda":
        if contains_any(name_norm, SODA_WATER_KEYWORDS):
            return "Aguas", "rule_04_soda_water_to_aguas"
        if contains_any(name_norm, SODA_APERITIVO_KEYWORDS):
            return "Aperitivos", "rule_04_soda_alcohol_to_aperitivos"
        return "Aperitivos", "rule_04_soda_default_to_aperitivos"

    # Rule 5
    if cat_key in {"sidra", "vinos"}:
        return "Vinos", "rule_05_sidra_vinos_to_vinos"

    # Rule 6
    if cat_key in {"pan", "pandolchito"}:
        return "Panificados", "rule_06_pan_to_panificados"

    # Rule 7
    if cat_key.startswith("analg") or cat_key == "analgesicos":
        return CAT_ANALGESICOS, "rule_07_analgesicos_normalized"

    # Rule 8
    if cat_key == "lucky":
        if contains_any(name_norm, TOBACCO_KEYWORDS):
            return "Cigarrillos", "rule_08_lucky_tobacco_to_cigarrillos"
        return CAT_ALMACEN, "rule_08_lucky_non_tobacco_to_almacen"

    # Rule 9
    if cat_key == "guaymallen":
        return "Alfajores", "rule_09_guaymallen_to_alfajores"
    if cat_key == "galletitas" and contains_any(name_norm, ALFAJOR_KEYWORDS):
        return "Alfajores", "rule_09_galletitas_alfajor_to_alfajores"

    # Rule 10
    if cat_key == "confituras":
        return "Golosinas", "rule_10_confituras_to_golosinas"

    # Rule 11
    if cat_key == "snack":
        if contains_any(name_norm, SNACK_TO_GOLOSINAS_KEYWORDS):
            return "Golosinas", "rule_11_snack_to_golosinas"
        return "Snack", "rule_11_snack_stays_snack"

    # Rule 12
    if cat_key == "golosinas":
        if contains_any(name_norm, GOLOSINAS_TO_SNACK_KEYWORDS):
            return "Snack", "rule_12_golosinas_to_snack"
        return "Golosinas", "rule_12_golosinas_stays_golosinas"

    # Rule 13
    if cat_key == "pure":
        if contains_any(name_norm, PURE_CORE_KEYWORDS):
            return "Pure", "rule_13_pure_core_to_pure"
        if "azucar" in name_norm:
            return CAT_AZUCAR, "rule_13_pure_azucar_to_azucar"
        return CAT_ALMACEN, "rule_13_pure_other_to_almacen"

    # Rule 14
    if cat_key == "repelente":
        return CAT_ALMACEN, "rule_14_repelente_to_almacen"

    # Canonical pass-through and stable categories
    if cat_key in CANONICAL_BY_KEY:
        return CANONICAL_BY_KEY[cat_key], "rule_15_canonical_passthrough"

    stable = {
        "fideos": "Fideos",
        "arroz": "Arroz",
        "petacas": "Petacas",
        "yerbas": "Yerbas",
        "turrones": "Turrones",
        "alfajores": "Alfajores",
        "cigarrillos": "Cigarrillos",
    }
    if cat_key in stable:
        return stable[cat_key], "rule_16_stable_passthrough"

    return CAT_ALMACEN, "rule_99_fallback_to_almacen"


def migrate_promo_target(target: str) -> Tuple[str, str, str]:
    key = category_key(target)
    if not key:
        return "pending", "", "empty_target"

    if key in MIXED_PROMOTION_KEYS:
        return "pending", "", "mixed_category"

    if key in DIRECT_PROMOTION_MAP:
        return "mapped", DIRECT_PROMOTION_MAP[key], "direct_map"

    if key in CANONICAL_BY_KEY:
        return "mapped", CANONICAL_BY_KEY[key], "canonical_passthrough"

    return "pending", "", "unmapped_category"


def utc_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def migrate_product_rows(scope: str, rows: Sequence[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[ProductChange], Counter]:
    updated_rows: List[Dict[str, Any]] = []
    changes: List[ProductChange] = []
    counts: Counter = Counter()

    for idx, row in enumerate(rows):
        sku = str(row.get("sku", "")).strip() or f"row-{idx}"
        name = str(row.get("name", "")).strip()
        old_category = str(row.get("category", "")).strip()
        new_category, rule = classify_product(old_category, name)
        changed = old_category != new_category

        updated = dict(row)
        updated["category"] = new_category
        updated_rows.append(updated)
        counts[new_category] += 1
        changes.append(
            ProductChange(
                scope=scope,
                identifier=sku,
                sku=sku,
                name=name,
                old_category=old_category,
                new_category=new_category,
                rule=rule,
                changed=changed,
            )
        )

    return updated_rows, changes, counts


def load_firebase_config(repo_root: Path, config_name: str) -> Dict[str, Any]:
    config_path = Path(config_name)
    if not config_path.is_absolute():
        config_path = repo_root / config_name
    if not config_path.exists():
        return {}
    return json.loads(config_path.read_text(encoding="utf-8"))


def init_firestore_client(args: argparse.Namespace, repo_root: Path):
    if firebase_admin is None or credentials is None or firestore is None:
        raise RuntimeError(
            "Missing dependency firebase-admin. Install with:\n"
            "  python -m pip install -r scripts/requirements-image-sync.txt"
        )

    config = load_firebase_config(repo_root, args.firebase_config)

    default_service = repo_root / "catalogo-distri-firebase-adminsdk-fbsvc-6fba809590.json"
    service_account = (
        args.service_account
        or os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        or (str(default_service) if default_service.exists() else "")
    )
    if not service_account:
        raise RuntimeError("Missing service account. Use --service-account or GOOGLE_APPLICATION_CREDENTIALS.")
    service_path = Path(service_account).expanduser().resolve()
    if not service_path.exists():
        raise RuntimeError(f"Service account file does not exist: {service_path}")

    project_id = args.project_id or os.getenv("FIREBASE_PROJECT_ID", "") or config.get("projectId")
    database_id = args.database_id or os.getenv("FIREBASE_DATABASE_ID", "") or config.get("firestoreDatabaseId")
    if not project_id:
        raise RuntimeError("Missing Firebase project ID.")
    if not database_id:
        raise RuntimeError("Missing Firestore database ID.")

    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(str(service_path)), options={"projectId": project_id})

    try:
        client = firestore.client(database_id=database_id)
    except TypeError:
        client = firestore.client()
        print(
            "Warning: installed firebase-admin does not support custom database_id; using default database.",
            file=sys.stderr,
        )
    return client, project_id, database_id


def write_product_report(path: Path, rows: Iterable[ProductChange]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(
            [
                "scope",
                "identifier",
                "sku",
                "name",
                "old_category",
                "new_category",
                "changed",
                "rule",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.scope,
                    row.identifier,
                    row.sku,
                    row.name,
                    row.old_category,
                    row.new_category,
                    "yes" if row.changed else "no",
                    row.rule,
                ]
            )


def write_promo_report(path: Path, rows: Iterable[PromotionDecision]) -> None:
    with path.open("w", encoding="utf-8", newline="") as fp:
        writer = csv.writer(fp)
        writer.writerow(["promo_id", "name", "old_target", "new_target", "status", "note"])
        for row in rows:
            writer.writerow([row.promo_id, row.name, row.old_target, row.new_target, row.status, row.note])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync product categories for local JSON and Firestore.")
    parser.add_argument("--mode", choices=["dry-run", "apply"], default="dry-run")
    parser.add_argument("--target", choices=["local", "firestore", "both"], default="both")
    parser.add_argument("--repo-root", default="", help="Override repository root (defaults to script parent).")
    parser.add_argument("--firebase-config", default="firebase-applet-config.json")
    parser.add_argument("--service-account", default="")
    parser.add_argument("--project-id", default="")
    parser.add_argument("--database-id", default="")
    parser.add_argument("--artifacts-dir", default="artifacts")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve() if args.repo_root else Path(__file__).resolve().parents[1]
    artifacts_dir = (repo_root / args.artifacts_dir).resolve()
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    stamp = utc_stamp()

    product_report_path = artifacts_dir / f"category-sync-products-{stamp}.csv"
    promo_report_path = artifacts_dir / f"category-sync-promotions-{stamp}.csv"
    promo_pending_path = artifacts_dir / f"category-sync-promotions-pending-{stamp}.csv"
    backup_path = artifacts_dir / f"category-sync-backup-{stamp}.json"

    do_local = args.target in {"local", "both"}
    do_firestore = args.target in {"firestore", "both"}
    apply_mode = args.mode == "apply"

    backup_payload: Dict[str, Any] = {
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": args.mode,
        "target": args.target,
        "canonicalCategories": CANONICAL_CATEGORIES,
        "local": {},
        "firestore": {},
    }

    all_product_changes: List[ProductChange] = []
    promo_decisions: List[PromotionDecision] = []
    promo_pending: List[PromotionDecision] = []

    if do_local:
        local_files = [
            repo_root / "src" / "data" / "products.json",
            repo_root / "public" / "products.json",
        ]
        local_backup_rows: Dict[str, Any] = {}

        for path in local_files:
            if not path.exists():
                raise RuntimeError(f"Missing local products file: {path}")
            original_rows = load_json(path)
            updated_rows, changes, counts = migrate_product_rows(f"local:{path.name}", original_rows)
            all_product_changes.extend(changes)

            local_backup_rows[str(path)] = {
                "countsAfter": dict(sorted(counts.items())),
                "changedRows": [
                    {
                        "sku": c.sku,
                        "name": c.name,
                        "oldCategory": c.old_category,
                        "newCategory": c.new_category,
                        "rule": c.rule,
                    }
                    for c in changes
                    if c.changed
                ],
            }

            if apply_mode:
                write_json(path, updated_rows)
                print(f"Updated local file: {path}")
            else:
                changed_count = sum(1 for c in changes if c.changed)
                print(f"[dry-run] Local {path.name}: {changed_count} products would change.")

        backup_payload["local"] = local_backup_rows

    if do_firestore:
        client, project_id, database_id = init_firestore_client(args, repo_root)
        print(f"Firestore target => project={project_id} database={database_id}")

        product_docs = list(client.collection("products").stream())
        firestore_changes_payload: List[Dict[str, Any]] = []

        for doc in product_docs:
            row = doc.to_dict() or {}
            sku = str(row.get("sku", "")).strip() or doc.id
            name = str(row.get("name", "")).strip()
            old_category = str(row.get("category", "")).strip()
            new_category, rule = classify_product(old_category, name)
            changed = old_category != new_category

            all_product_changes.append(
                ProductChange(
                    scope="firestore:products",
                    identifier=doc.id,
                    sku=sku,
                    name=name,
                    old_category=old_category,
                    new_category=new_category,
                    rule=rule,
                    changed=changed,
                )
            )

            if changed:
                firestore_changes_payload.append(
                    {
                        "docId": doc.id,
                        "sku": sku,
                        "name": name,
                        "oldCategory": old_category,
                        "newCategory": new_category,
                        "rule": rule,
                    }
                )
                if apply_mode:
                    client.collection("products").document(doc.id).update({"category": new_category})

        promotions_docs = list(client.collection("promotions").stream())
        for promo_doc in promotions_docs:
            data = promo_doc.to_dict() or {}
            if str(data.get("targetType", "")).strip() != "category":
                continue
            old_target = str(data.get("targetId", "")).strip()
            status, new_target, note = migrate_promo_target(old_target)
            decision = PromotionDecision(
                promo_id=promo_doc.id,
                name=str(data.get("name", "")).strip(),
                old_target=old_target,
                new_target=new_target,
                status=status,
                note=note,
            )
            if status == "mapped":
                promo_decisions.append(decision)
                if apply_mode and old_target != new_target:
                    client.collection("promotions").document(promo_doc.id).update({"targetId": new_target})
            else:
                promo_pending.append(decision)

        backup_payload["firestore"] = {
            "productChanges": firestore_changes_payload,
            "promoMapped": [d.__dict__ for d in promo_decisions],
            "promoPending": [d.__dict__ for d in promo_pending],
        }
        if apply_mode:
            print(
                f"Updated Firestore products: {len(firestore_changes_payload)} candidate changes "
                f"(mapped promotions updated where direct)."
            )
        else:
            print(
                f"[dry-run] Firestore products: {len(firestore_changes_payload)} products would change; "
                f"mapped promos={len(promo_decisions)}, pending promos={len(promo_pending)}."
            )

    write_product_report(product_report_path, all_product_changes)
    write_promo_report(promo_report_path, promo_decisions)
    write_promo_report(promo_pending_path, promo_pending)
    backup_path.write_text(json.dumps(backup_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Product report: {product_report_path}")
    print(f"Promo report: {promo_report_path}")
    print(f"Promo pending: {promo_pending_path}")
    print(f"Backup: {backup_path}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted by user.", file=sys.stderr)
        raise SystemExit(130)
    except Exception as exc:
        print(f"Fatal error: {exc}", file=sys.stderr)
        raise SystemExit(1)
