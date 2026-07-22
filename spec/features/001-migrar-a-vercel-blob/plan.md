# Plan de implementación — 001 Migrar a Vercel Blob

Plan técnico alineado a `spec.md` y a las convenciones de `AGENTS.md` (monolito Express, JS vanilla, español de dominio, sin modularizar ni introducir bundler).

## Fase 0 — Preparación de infraestructura (manual / ops)

1. En el dashboard de Vercel del proyecto: **Storage → Create → Blob**.
2. Access del store: **Public**.
3. Conectar el store al proyecto (prod/preview) para que Vercel inyecte credenciales.
4. Copiar `BLOB_READ_WRITE_TOKEN` a:
   - `server/.env` (desarrollo local)
   - Variables de entorno del proyecto en Vercel (si no quedó auto-inyectada)
5. Verificar con `vercel env pull` o pegando el token a mano.
6. **No** borrar aún el store/cuenta Cloudinary hasta pasar la checklist de §Verificación.

## Fase 1 — Dependencias

Ubicación: `server/` (deps de runtime viven ahí).

```bash
npm --prefix server uninstall cloudinary
npm --prefix server install @vercel/blob
```

Confirmar:

- `server/package.json`: sale `cloudinary`, entra `@vercel/blob`.
- `server/package-lock.json` actualizado.
- CommonJS: `const { put, del } = require('@vercel/blob');` (sin ESM).

## Fase 2 — Backend (`server/server.js`)

Orden sugerido de edits en el monolito (mismo archivo, sin crear `routes/` ni servicios nuevos salvo helpers locales mínimos).

### 2.1 Quitar Cloudinary

- Eliminar `require('cloudinary')`.
- Eliminar constantes `CLOUDINARY_*` y comentarios asociados.
- Eliminar bloque `cloudinary.config(...)`.
- Quitar `CLOUDINARY_*` de `validarVariablesEntornoCriticas()` / avisos de producción.
- Eliminar ruta `POST /api/admin/cloudinary-firma`.

### 2.2 Agregar Blob

- Leer `BLOB_READ_WRITE_TOKEN = String(process.env.BLOB_READ_WRITE_TOKEN || '').trim()`.
- En validación de arranque: tratarla como **crítica** (misma severidad que tenía Cloudinary para subidas admin).
- En producción sin token (y sin OIDC usable en local): log de error claro.

### 2.3 Multer en memoria para productos/escudos

Reutilizar el patrón de validación MIME de banners (`MIME_IMAGENES_PERMITIDAS`, etc.) con **memoryStorage** (no disco):

```js
const uploadImagenBlob = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: /* ≤ 4.5 * 1024 * 1024 recomendado en Vercel */ },
  fileFilter: /* JPEG/PNG/WebP/GIF */,
});
```

Banners **siguen** con `diskStorage` — no mezclar.

### 2.4 Nueva ruta `POST /api/admin/blob-subir`

Middlewares sugeridos (ajustar al orden real del archivo):

1. `verificarAdminJWT`
2. `verificarOrigenMutacion` (si el resto de mutaciones admin con cookie lo usan)
3. `uploadImagenBlob.single('file')` (aceptar también alias `imagen` si el front lo envía)

Handler:

1. Validar `req.file`.
2. Si falta token → `503` con mensaje en español.
3. Construir `pathname` p. ej. `productos/${Date.now()}-${nombreSeguro}` o con `addRandomSuffix: true`.
4. `const blob = await put(pathname, req.file.buffer, { access: 'public', contentType: req.file.mimetype, addRandomSuffix: true });`
5. `res.json({ ok: true, url: blob.url, pathname: blob.pathname });`
6. `catch` → `logError('BLOB_SUBIR', error)` + `500`.

### 2.5 Borrado opcional (`del`)

Si se incluye en el MVP:

- Helper `esUrlBlobPropia(url)` (host `blob.vercel-storage.com`).
- Helper `eliminarBlobSiAplica(url)` → `await del(url)` en try/catch silencioso.
- Invocar al reemplazar imágenes en update de producto/sección **solo si** se conoce la URL anterior y es Blob (requiere leer doc previo antes del save).

Si se posterga: dejar TODO en `tasks.md` y no bloquear la migración de subida.

### 2.6 CSP (Helmet)

En `connectSrc`, **eliminar** `'https://api.cloudinary.com'`.

No agregar hosts de Blob al `connectSrc` si la subida es solo server-side.

### 2.7 Límites de body Express

Hoy `express.json` / `urlencoded` están en `1mb`. La subida multipart la maneja Multer; confirmar que no haya middleware global que recorte el buffer antes. En Vercel, el límite duro de la Function (~4.5 MB) manda: alinear `limits.fileSize` de Multer a ese techo.

## Fase 3 — Frontend (`public/js/app.js` + `public/index.html`)

### 3.1 Reemplazar función de subida

Renombrar/reescribir `subirImagenACloudinary` → p. ej. `subirImagenABlob`:

1. Guard sesión admin (igual que hoy).
2. `FormData` + `append('file', archivo)`.
3. `POST` a `/api/admin/blob-subir` con credenciales (mismo mecanismo que `apiFetch` usa para JWT/cookies).  
   **Importante:** si `apiFetch` fuerza `Content-Type: application/json`, **no** usarlo a ciegas para multipart; usar `fetch` con `credentials: 'include'` y headers de auth equivalentes, sin setear `Content-Type` manual (boundary del browser).
4. Parsear JSON; exigir `datos.url`; devolver ese string.
5. Actualizar los 4 call sites (frente, espalda, escudo modal, escudo detalle).

### 3.2 Optimización de URLs

- Eliminar dependencia de `CLOUDINARY_CLOUD_NAME` global.
- `optimizarUrlImagenProducto` / `optimizarUrlEscudo`:
  - Opción A (recomendada MVP): si detectan Cloudinary, devolver URL limpia sin transforms; si no, passthrough.
  - Opción B: eliminar helpers de parseo Cloudinary y siempre devolver la URL original (más simple; las URLs Cloudinary legacy siguen funcionando en `<img>`).

### 3.3 Copy UI

- Actualizar hint del formulario de producto en `index.html` (quitar “Cloudinary”).
- Mensajes de error al usuario: español rioplatense (“No se pudo subir la imagen.”).

### 3.4 Assets

```bash
# bump data/asset-version.json y
npm run assets:version
```

## Fase 4 — Documentación y limpieza

| Archivo | Cambio |
|---------|--------|
| `AGENTS.md` | Tech stack: “Vercel Blob (productos/escudos); Multer local para banners”. Regla 5 y lista de env. |
| `README.md` | Incluir `BLOB_READ_WRITE_TOKEN` en el ejemplo de `.env`; quitar cualquier mención Cloudinary si existiera. |
| `scripts/clean-demo-db.js` | Actualizar comentario que cita Cloudinary. |
| Vercel dashboard | Quitar env `CLOUDINARY_*` tras validar prod. |
| `server/.env` local | Quitar Cloudinary; agregar Blob. |

## Fase 5 — Verificación (checklist operativa)

Ver sección dedicada abajo y `tasks.md` (ítems de QA).

Orden de prueba sugerido: local con token → preview Vercel → producción.

---

## Checklist de verificación (flujo completo)

Usar esta lista al cerrar la feature. Marcar cada ítem en `tasks.md` al ejecutarlo.

### Entorno

- [ ] `BLOB_READ_WRITE_TOKEN` definido en `server/.env` y el servidor arranca sin marcarla como faltante.
- [ ] Variables `CLOUDINARY_*` ausentes del `.env` local y del proyecto Vercel (tras el cutover).
- [ ] `npm --prefix server ls cloudinary` no encuentra el paquete; `@vercel/blob` está instalado.

### Subida (admin)

- [ ] Login admin OK.
- [ ] Crear producto nuevo: subir **frente** → preview muestra la imagen; al guardar, `imagenFrente` en DB es URL `*.blob.vercel-storage.com` (o host Blob del store).
- [ ] Editar mismo producto: subir **espalda** → hover/detalle muestra frente y espalda correctos.
- [ ] Rechazo de archivo no imagen (p. ej. `.txt`) con mensaje claro.
- [ ] Archivo > límite configurado: error controlado (no 500 opaco).
- [ ] Sin token (probar quitándolo temporalmente): `503` con mensaje en español; UI muestra error usable.

### Escudos

- [ ] Subir escudo desde modal de sección → aparece en listado/carrusel.
- [ ] Subir/cambiar escudo desde detalle de sección → se persiste y renderiza.

### Renderizado tienda (cliente no admin)

- [ ] Home / grilla: imagen de producto visible.
- [ ] Detalle de producto: frente (y espalda si aplica).
- [ ] Escudos de secciones visibles donde correspondan.
- [ ] Producto con URL **Cloudinary legacy** (si hay datos viejos): sigue mostrando imagen (no rompe el catálogo).
- [ ] Banner home (Multer local): sin regresión.

### Borrado (solo si se implementó `del`)

- [ ] Reemplazar imagen de producto: la URL nueva funciona; el blob anterior desaparece del store (dashboard Blob o `vercel blob`).
- [ ] Fallo simulado de delete no impide guardar el producto.

### Seguridad / red

- [ ] Network tab: no hay requests a `api.cloudinary.com`.
- [ ] Subida va a `/api/admin/blob-subir` (same-origin).
- [ ] Token Blob **no** aparece en respuestas JSON ni en JS del cliente.
- [ ] CSP no bloquea la carga de `<img>` desde el host Blob.

### Docs

- [ ] `AGENTS.md` y `README.md` describen Blob y `BLOB_READ_WRITE_TOKEN`.
- [ ] Asset version bumpeada tras cambios de `app.js` / HTML.

### Deploy

- [ ] Preview/producción en Vercel: misma checklist de subida + render.
- [ ] Tras OK en prod: desactivar/eliminar integración Cloudinary y secretos asociados.

---

## Orden de merges / riesgo

1. PR único preferible (cambio cohesivo de dependencia + API + front + docs).
2. Alternativa: primero backend + flag/ruta nueva conviviendo con Cloudinary un día; luego flip del front y delete de Cloudinary — **solo** si se necesita rollback rápido; aumenta deuda. El plan default es **corte limpio** en una sola entrega.
