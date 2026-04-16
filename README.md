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

*(Nota: Las variables de entorno de Firebase en este proyecto se proveen explícitamente en el archivo de configuración `firebase-applet-config.json` en tiempo de compilación y es seguro para una SPA en el cliente de acuerdo a las políticas de Firebase, ya que los accesos seguros están definidos en las Reglas de Seguridad de Firestore `firestore.rules`).*

## 🛠️ Panel de Administración (`/admin`)

- **Acceso:** Tu correo `lautaroboninom@gmail.com` ha sido configurado internamente como Administrador Global en el sistema, nadie más puede acceder a esta sección.
- **Inventario:** Permite importar tu catálogo semilla, modificar los costos, precios y stock activo.
- **Reglas de Promociones:** Puedes configurar descuentos porcentuales (ej. 15% OFF) y descuentos por volumen (Llevá 3, Pagá 2). El modelo dinámico aplicará los descuentos automáticamente en el Carrito de todos los usuarios y añadirá tarjetas especiales (Badges) a los productos.
- **Módulo de Inflación:** Realiza un ajuste porcentual general que actualiza automáticamente todos los precios del catálogo en un clic.

¡Éxito con tu distribuidora!
