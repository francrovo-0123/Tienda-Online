# Tasks — 001 Migrar a Vercel Blob

Checklist ejecutable. Convención: `- [ ]` pendiente, `- [x]` hecho.  
Referencias: `spec.md` (qué), `plan.md` (cómo).

---

## 0. Ops / Blob store

> Manual en el dashboard de Vercel / `.env` local. El código ya espera `BLOB_READ_WRITE_TOKEN`.

- [x] Crear Blob store **público** en Vercel (Storage).
- [x] Conectar el store al proyecto (prod/preview según corresponda).
- [x] Obtener y guardar `BLOB_READ_WRITE_TOKEN` en `server/.env`.
- [ ] Confirmar la variable en el dashboard de env de Vercel (o vía `vercel env pull`).
- [x] Dejar Cloudinary activo hasta completar la checklist de QA (no borrar la cuenta aún).

---

## 1. Dependencias

- [x] Desinstalar SDK Cloudinary: `npm --prefix server uninstall cloudinary`.
- [x] Instalar Vercel Blob: `npm --prefix server install @vercel/blob`.
- [x] Verificar `server/package.json` y `package-lock.json` (sin `cloudinary`, con `@vercel/blob`).

---

## 2. Backend — limpieza Cloudinary

Archivo principal: `server/server.js`.

- [x] Quitar `require('cloudinary')` / `const { v2: cloudinary }`.
- [x] Eliminar lectura y uso de `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET`.
- [x] Eliminar `cloudinary.config(...)` y logs asociados.
- [x] Quitar esas variables de `validarVariablesEntornoCriticas()` y avisos de producción.
- [x] Eliminar ruta `POST /api/admin/cloudinary-firma`.
- [x] Quitar `https://api.cloudinary.com` de `connectSrc` (Helmet CSP).

---

## 3. Backend — integración Blob (`put` / `del`)

- [x] Leer `BLOB_READ_WRITE_TOKEN` desde env; validarla en arranque como crítica.
- [x] `require('@vercel/blob')` → `put` (y `del` si aplica).
- [x] Configurar Multer `memoryStorage` + límites MIME/tamaño para imágenes de producto/escudo (sin tocar el Multer de banners en disco).
- [x] Implementar `POST /api/admin/blob-subir` con `verificarAdminJWT` (+ `verificarOrigenMutacion` si corresponde).
- [x] Handler: validar archivo → `put(pathname, buffer, { access: 'public', contentType, addRandomSuffix: true })` → `{ ok: true, url }`.
- [x] Respuestas de error en español (`400` / `503` / `500`) vía `res.status(...).json({ error: '...' })`.
- [x] (Opcional MVP) Helper `eliminarBlobSiAplica` con `del()` y enganche al reemplazo de imagen / borrado de producto.
- [x] Confirmar que banners (`/api/admin/banners/...` + diskStorage) no se modifican en comportamiento.

---

## 4. Frontend — subida y consumo de URL

Archivos: `public/js/app.js`, `public/index.html`.

- [x] Reemplazar `subirImagenACloudinary` por función tipo `subirImagenABlob` que POSTea multipart a `/api/admin/blob-subir`.
- [x] Asegurar auth/cookies en el `fetch` multipart (no forzar `Content-Type: application/json`).
- [x] Adaptar parseo de respuesta: usar `url` (ya no `secure_url` de Cloudinary).
- [x] Actualizar call sites:
  - [x] Imagen frente de producto
  - [x] Imagen espalda de producto
  - [x] Escudo (modal sección)
  - [x] Escudo (detalle sección)
- [x] Eliminar variable/cache `CLOUDINARY_CLOUD_NAME` y fetches a `api.cloudinary.com`.
- [x] Ajustar `optimizarUrlImagenProducto` / `optimizarUrlEscudo` (y helpers `extraer*Cloudinary`) a passthrough / legacy-safe.
- [x] Actualizar hint del formulario de producto en `index.html` (sin mencionar Cloudinary).
- [x] Bump `data/asset-version.json` + `npm run assets:version`.

---

## 5. Documentación y secretos

- [x] Actualizar `AGENTS.md` (stack de imágenes, regla productos→Blob, lista de env).
- [x] Actualizar `README.md` con `BLOB_READ_WRITE_TOKEN` en el ejemplo de `.env`.
- [x] Actualizar comentario en `scripts/clean-demo-db.js` si cita Cloudinary.
- [x] Quitar `CLOUDINARY_*` de `server/.env` local tras QA.
- [ ] Quitar `CLOUDINARY_*` del proyecto Vercel tras QA en producción.
- [x] Indicar al operador: configurar **`BLOB_READ_WRITE_TOKEN`** (crear store → copiar token → local + Vercel).

---

## 6. Identificación de superficies tocadas (referencia rápida)

Usar como checklist de “no olvidé un call site”.

| Capa | Ubicación | Acción |
|------|-----------|--------|
| Dep | `server/package.json` | −cloudinary +@vercel/blob |
| API firma | `POST /api/admin/cloudinary-firma` | Eliminar |
| API subida | `POST /api/admin/blob-subir` | Crear (`put`) |
| Env validation | `validarVariablesEntornoCriticas` | Cloudinary→Blob |
| CSP | Helmet `connectSrc` | Quitar Cloudinary |
| Cliente subida | `subirImagenACloudinary` | Reescribir |
| Productos admin | guardado frente/espalda ~`app.js` | Nuevo uploader |
| Secciones admin | escudo modal + detalle | Nuevo uploader |
| Render | `optimizarUrl*` | Sin transforms Blob |
| UI copy | `index.html` hint | Renombrar |
| Docs | `AGENTS.md`, `README.md` | Blob |
| Banners | Multer local | **No migrar** |

---

## 7. QA — checklist de verificación

Copiada/operativa desde `plan.md`. Ejecutar en local y en preview/prod.

### Entorno

- [x] Arranque OK con `BLOB_READ_WRITE_TOKEN`.
- [ ] Sin token: warning/error de arranque + `503` en subida.
- [x] Paquete `cloudinary` ausente; `@vercel/blob` presente.

### Subida

- [ ] Subir frente de producto → URL Blob guardada y visible.
- [ ] Subir espalda → render frente/espalda OK.
- [x] Tipo de archivo inválido → error claro.
- [ ] Archivo oversized → error controlado.

### Escudos

- [ ] Escudo desde modal → OK.
- [ ] Escudo desde detalle → OK.

### Renderizado

- [ ] Catálogo / detalle / escudos en vista pública.
- [ ] URL Cloudinary legacy (si existe) sigue mostrando imagen.
- [x] Banners home sin regresión.

### Borrado (si se implementó)

- [ ] Reemplazo de imagen elimina (o intenta eliminar) el blob anterior.
- [ ] Fallo de `del` no bloquea el guardado.

### Seguridad

- [x] Cero traffic a `api.cloudinary.com` en Network.
- [x] Token Blob no filtrado al cliente.
- [x] `<img>` Blob no bloqueado por CSP.

### Cierre

- [x] Docs actualizadas.
- [x] Asset version aplicada.
- [ ] QA en Vercel preview/producción OK.
- [ ] Secretos e integración Cloudinary retirados del proyecto.

---

## 8. Fuera de alcance (no hacer en esta feature)

- [x] ~~Migrar banners a Vercel Blob~~ (explícitamente excluido).
- [x] ~~Introducir bundler / React / TypeScript para usar `@vercel/blob/client`~~.
- [x] ~~Script masivo de re-upload de assets Cloudinary legacy~~ (follow-up opcional).
- [x] ~~Modularizar `server.js` en `routes/` / `services/`~~.
