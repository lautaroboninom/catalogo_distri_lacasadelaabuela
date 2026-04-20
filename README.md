# EnCombo Distribuidora Mayorista - Web App

## 📦 Características Principales

Esta es una aplicación eCommerce moderna, rápida y "Mobile-First" construida con:
- **React.js** y **Vite** para máxima velocidad.
- **Tailwind CSS** para la interfaz estética, minimalista y responsiva.
- **Firebase Firestore** para base de datos y modelo de datos en tiempo real.
- **Autenticación con Google** para usuarios y administradores.
- **Integración con WhatsApp** para que los clientes puedan enviar órdenes de pedidos directas.

## 🚀 Despliegue en Vercel

Esta aplicación ya está configurada para ser desplegada en Vercel en cualquier momento, usando la configuración predeterminada para Single Page Applications (SPA).

**Pasos de despliegue:**
1. Sube este código a un repositorio propio (GitHub, GitLab o Bitbucket).
2. Ingresa a [Vercel](https://vercel.com/) y haz clic en **"Add New..." > "Project"**.
3. Selecciona tu repositorio.
4. En **Framework Preset**, Vercel detectará automáticamente **Vite**.
5. Las configuraciones de ruteo (`vercel.json`) ya se encuentran incorporadas, garantizando que el enrutamiento funcione sin errores "404".
6. Haz clic en **Deploy**. ¡Tu app estará viva en minutos!

*(Nota: este proyecto ahora prioriza variables de entorno `VITE_FIREBASE_*` para permitir separación de proyecto Firebase por app. Si no están definidas, usa fallback `firebase-applet-config.json`.)*

## 🛠️ Panel de Administración (`/admin`)

- **Acceso:** Tu correo `lautaroboninom@gmail.com` ha sido configurado internamente como Administrador Global en el sistema, nadie más puede acceder a esta sección.
- **Inventario:** Permite importar tu catálogo semilla, modificar los costos, precios y stock activo.
- **Reglas de Promociones:** Puedes configurar descuentos porcentuales (ej. 15% OFF) y descuentos por volumen (Llevá 3, Pagá 2). El modelo dinámico aplicará los descuentos automáticamente en el Carrito de todos los usuarios y añadirá tarjetas especiales (Badges) a los productos.
- **Módulo de Inflación:** Realiza un ajuste porcentual general que actualiza automáticamente todos los precios del catálogo en un clic.

¡Éxito con tu distribuidora!

## Firebase separado por app

Para evitar impacto cruzado con otras apps (por ejemplo turnos), configura este catálogo con un proyecto Firebase propio.

### Variables frontend (Vercel / local)

Definir en Vercel para este proyecto:
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_MEASUREMENT_ID` (opcional)

Puedes usar `.env.example` como plantilla local.

## Image Sync Pipeline (Firestore + Storage)

This repo includes `scripts/sync_product_images.py` to resolve, generate, upload, and publish product images.

### 1) Install Python dependencies

```bash
python -m pip install -r scripts/requirements-image-sync.txt
```

### 2) Required credentials

- Firebase service account JSON with Firestore + Storage permissions
- `GEMINI_API_KEY` environment variable (used for generic products and brand fallbacks)
- Target Firebase environment for this catalog:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_DATABASE_ID`
  - `FIREBASE_STORAGE_BUCKET`
- Optional: `--image-backend openai` (requires `OPENAI_API_KEY`) or `--image-backend local` (no model API calls)

### 3) Pilot run (20 products)

```bash
python scripts/sync_product_images.py --service-account C:\path\service-account.json --image-backend gemini --project-id YOUR_FIREBASE_PROJECT_ID --database-id YOUR_FIREBASE_DATABASE_ID --bucket YOUR_FIREBASE_STORAGE_BUCKET --pilot-limit 20
```

### 4) Full run

```bash
python scripts/sync_product_images.py --service-account C:\path\service-account.json --image-backend gemini --project-id YOUR_FIREBASE_PROJECT_ID --database-id YOUR_FIREBASE_DATABASE_ID --bucket YOUR_FIREBASE_STORAGE_BUCKET
```

Artifacts are written under `artifacts/`:
- `images-backup-YYYYMMDD-HHMMSS.json`
- `images-report-YYYYMMDD-HHMMSS.csv`
- `images-checkpoint.json`

### 5) Resume an interrupted run

```bash
python scripts/sync_product_images.py --service-account C:\path\service-account.json --image-backend gemini --project-id YOUR_FIREBASE_PROJECT_ID --database-id YOUR_FIREBASE_DATABASE_ID --bucket YOUR_FIREBASE_STORAGE_BUCKET --resume
```

### 6) Rollback from backup

```bash
python scripts/sync_product_images.py --service-account C:\path\service-account.json --rollback C:\path\images-backup-YYYYMMDD-HHMMSS.json
```
