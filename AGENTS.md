# AGENTS.md — Jersey Store

Guía para cualquier agente o IA que modifique este repositorio. Seguí estas convenciones; no inventes una arquitectura distinta.

## Qué es este proyecto

Tienda online de camisetas de fútbol (**Jersey Store**): catálogo, carrito, checkout (WhatsApp / MercadoPago), cuenta de cliente y panel de administración.

## Tech stack

| Capa | Tecnología |
|------|------------|
| Frontend | HTML5, CSS3, JavaScript **vanilla** (sin bundler, sin TypeScript, sin React/Vue) |
| Backend | Node.js **24.x**, Express **5**, CommonJS |
| DB | MongoDB + Mongoose |
| Auth | JWT (cookies httpOnly + Bearer), bcrypt |
| Pagos | MercadoPago SDK + checkout por transferencia (WhatsApp) |
| Email | Nodemailer (Brevo SMTP o Gmail) |
| Imágenes | Vercel Blob (productos, escudos y banners, `put` server-side) |
| Deploy | Vercel (`vercel.json`: `@vercel/node` + `@vercel/static`) |

Dependencias del backend viven en `server/package.json`. El `package.json` de la raíz solo orquesta scripts (`npm start`, versionado de assets, etc.).

## Estructura de carpetas

```
├── public/                 # Frontend estático servido por Express / Vercel
│   ├── index.html          # Tienda + panel admin embebido (#admin-view)
│   ├── checkout.html, cuenta.html, info.html, pago-resultado.html
│   ├── css/                # Un archivo por página/feature + global.css
│   ├── js/                 # app.js (núcleo), checkout.js, pago-retorno.js
│   └── images/banners/     # Legacy local (banners nuevos van a Vercel Blob)
├── server/
│   ├── server.js           # Backend monolítico (~toda la API, modelos, middleware)
│   ├── mailService.js      # Emails (Nodemailer)
│   └── scripts/            # resetDb.js, limpiar-usuarios-prueba.js
├── scripts/                # Utilidades de raíz (assets, demo DB, sanitize)
├── data/
│   ├── asset-version.json  # Fuente de verdad del ?v= cache-busting
│   └── banners.json        # Fallback de banners
├── admin/                  # VACÍA — no usarla; el admin está en public/index.html
├── vercel.json
└── package.json            # Scripts de raíz (sin deps de runtime)
```

### Archivos críticos

- `server/server.js` — config, schemas Mongoose, middleware de seguridad, todas las rutas.
- `public/js/app.js` — lógica de tienda, carrito, auth UI y admin (funciones globales).
- `public/index.html` — markup de tienda y admin (hash: `#admin`, `#admin/pedidos`, etc.).
- `data/asset-version.json` + `scripts/apply-asset-version.js` — versionado de CSS/JS.
- `GET /store-env.js` — JS dinámico con `window.__STORE_ENV__` (nombre, WhatsApp, AFIP, asset version).

## Idioma y dominio

- **Español en todo el código de dominio**: nombres de variables, funciones, rutas, campos de DB, mensajes de error y UI.
- Términos a conservar (no traducir ni renombrar): `productos`, `pedidos`, `secciones`, `cupones`, `banners`, `talles`, `stockTalles`, `cliente` / `admin`, `numeroPedido`, `estado`.
- Mensajes al usuario: español rioplatense informal (“vos”), frase completa con punto final.

## Convenciones de código

### JavaScript (cliente y servidor)

- Comillas **simples**, **punto y coma** siempre.
- `async`/`await` (evitar cadenas `.then()` nuevas).
- Variables/funciones: `camelCase` en español (`verificarAdminJWT`, `formatearPrecio`).
- Constantes: `UPPER_SNAKE_CASE`.
- Modelos Mongoose: PascalCase singular (`Producto`, `Pedido`, `Seccion`).
- Validación defensiva habitual: `String(x || '').trim()` sobre body/query/env.
- Errores API: `res.status(code).json({ error: 'Mensaje en español.' })`.
- Handlers: `async (req, res) => { try { ... } catch (error) { ... } }`.
- Comentarios JSDoc/`// ── Sección ──` en español, explicando el *porqué* cuando hace falta.

### Frontend (`public/`)

- **Sin** `import`/`export` ni módulos ES: scripts por `<script src="...">`.
- `app.js` expone funciones globales; `checkout.js` y `pago-retorno.js` usan IIFE y dependen de esas globals (guards tipo `typeof mostrarToast === 'function'`).
- CSS: kebab-case / BEM (`admin-sidebar__link--active`), variables en `:root` de `global.css` (`--color-*`, `--space-*`).
- Tipografía del diseño: Oswald + DM Sans (ya en `global.css`); no sustituir por Inter/Roboto/system por defecto.
- Páginas legacy solo redirigen (`pago-exitoso.html`, `pedidos.html`, etc.): editar las canónicas (`pago-resultado.html`, `cuenta.html`).

### Backend (`server/`)

- Monolito en `server.js`: **no** crear carpetas `routes/`, `models/`, `controllers/` salvo pedido explícito de refactor.
- Rutas planas: `app.METHOD('/api/...', [middlewares], handler)` — sin `express.Router()` salvo que se pida.
- Recursos REST en español plural: `/api/productos`, `/api/pedidos`, `/api/secciones`, `/api/cupones`, `/api/banners`, `/api/auth/*`, `/api/admin/*`.
- Mutaciones de productos/pedidos/secciones pueden estar en `/api/resource` con `verificarAdminJWT`; otras admin bajo `/api/admin/*`. Ambos patrones coexisten: seguí el del recurso cercano.
- Enums de dominio: declarar `const` arriba (`ESTADOS_PEDIDO`, etc.) y reutilizar en schema + rutas.
- Auth: cookies `js_admin_token` / `js_cliente_token` o header `Authorization: Bearer`. Roles `cliente` | `admin`.
- Rate limiters ya existentes (`limitadorAuth`, `limitadorCheckout`, etc.): reutilizalos en rutas nuevas.
- Respetá `verificarOrigenMutacion` (CSRF por Origin/Referer) en mutaciones con cookie.

### Archivos y scripts

- Scripts de utilidad: `kebab-case.js` en `scripts/` o `server/scripts/`.
- CSS/JS de página: nombre corto alineado a la página (`checkout.css`, `cuenta.js`).
- Instalar deps del backend **dentro de `server/`** (`npm --prefix server install <pkg>`).

## Reglas operativas para agentes

1. **No modularices el monolito** ni migres a React/TypeScript/bundler sin pedido explícito.
2. **No uses la carpeta `admin/`** ni crees `public/admin/`; el panel está en `index.html` + `app.js`.
3. Tras editar CSS/JS públicos: bump de versión en `data/asset-version.json` y `npm run assets:version` (o `npm start`, que lo corre).
4. Dos checkouts distintos — no los mezcles:
   - **MercadoPago** → `POST /api/pagar`; la verdad del pago es el **webhook** `/api/webhooks/mercadopago`.
   - **Transferencia** → `POST /api/pedidos` + link WhatsApp (descuento 10% server-side).
5. Productos/escudos/banners → Vercel Blob (`BLOB_READ_WRITE_TOKEN`). Productos/escudos: `POST /api/admin/blob-subir`. Banners: `POST /api/admin/banners` (Multer en memoria + `put`).
6. Secretos solo en `server/.env` (gitignored). Datos de tienda (nombre, WhatsApp, AFIP) salen del env vía `/store-env.js`, no de un panel editable.
7. No hay suite de tests en el repo; no asumas `npm test`.
8. Cambios mínimos y del estilo existente; no reformatees archivos enteros ni agregues docs no pedidas.
9. Commits solo si el usuario lo pide.

## Comandos útiles

```bash
npm run install:server          # deps del backend
npm start                       # versiona assets + arranca server
npm run assets:version          # aplica ?v= desde data/asset-version.json
npm run assets:version:dry      # dry-run del versionado
npm run reset-db                # wipe DB (cuidado; confirma en prod)
npm run clean-demo              # prepara DB demo (no es lo mismo que reset-db)
```

Servidor local: [http://localhost:3000](http://localhost:3000).

## Variables de entorno relevantes

`MONGO_URI`, `JWT_SECRET` (≥32 chars), `ADMIN_INICIAL_EMAIL`, `ADMIN_INICIAL_PASS`, `STORE_NAME`, `WHATSAPP_NUMBER`, `AFIP_URL`, SMTP (`SMTP_*`), Vercel Blob (`BLOB_READ_WRITE_TOKEN`), MercadoPago (`MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_SANDBOX`), `APP_BASE_URL`, `ALLOWED_ORIGINS`, `CRON_SECRET`, `ASSET_VERSION` (opcional).

Detalle de setup: ver `README.md`.
