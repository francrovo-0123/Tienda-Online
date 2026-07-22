# Feature 001 — Migrar almacenamiento de imágenes a Vercel Blob

| Campo | Valor |
|-------|--------|
| **ID** | `001-migrar-a-vercel-blob` |
| **Estado** | Implementación lista — pendiente ops (token Blob) + QA |
| **Ámbito** | Productos (`imagenFrente`, `imagenEspalda`) y escudos de secciones (`escudo`) |
| **Fuera de alcance** | Banners de home (siguen en disco local con Multer → `public/images/banners/`) |
| **Stack** | Express monolito (`server/server.js`) + JS vanilla (`public/js/app.js`) + deploy Vercel |

## 1. Resumen

Hoy las imágenes de productos y escudos se suben desde el navegador a **Cloudinary** con firma server-side (`POST /api/admin/cloudinary-firma` + `POST` a `api.cloudinary.com`). Se debe **eliminar por completo** esa integración y reemplazarla por **Vercel Blob** (`@vercel/blob`), guardando en MongoDB la URL pública del blob.

Los banners **no** forman parte de esta migración: ya usan Multer en disco local y deben permanecer así salvo un cambio futuro explícito.

## 2. Motivación

- Unificar el almacenamiento de medios con el proveedor de hosting (Vercel).
- Reducir dependencias y secretos externos (`CLOUDINARY_*`).
- Mantener el flujo admin (subir archivo → obtener URL → persistir en producto/sección) sin migrar a React/bundler.

## 3. Estado actual (inventario)

### 3.1 Backend (`server/server.js`)

| Elemento | Detalle |
|----------|---------|
| Dependencia | `cloudinary` (`require('cloudinary')`, `v2`) |
| Env | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_UPLOAD_PRESET` (legacy) |
| Validación arranque | Las tres primeras se tratan como críticas en `validarVariablesEntornoCriticas()` |
| Config | `cloudinary.config({ cloud_name, api_key, api_secret, secure: true })` |
| Ruta | `POST /api/admin/cloudinary-firma` + `verificarAdminJWT` → `{ ok, cloudName, apiKey, timestamp, folder, signature }` |
| CSP | `connectSrc` incluye `https://api.cloudinary.com` |
| Carpeta firmada | `jerseys-store/productos` |

### 3.2 Frontend (`public/js/app.js`)

| Elemento | Detalle |
|----------|---------|
| Subida | `subirImagenACloudinary(archivo)` → firma + `FormData` a Cloudinary → `secure_url` |
| Call sites | Productos (frente/espalda), escudo modal sección, escudo detalle sección |
| Optimización | `extraerRutaAssetCloudinary`, `extraerCloudNameCloudinary`, `optimizarUrlEscudo`, `optimizarUrlImagenProducto` (transforms CDN de Cloudinary) |
| Estado | `CLOUDINARY_CLOUD_NAME` en memoria tras la primera firma |

### 3.3 UI / docs

- Hint en `public/index.html` (formulario producto): menciona Cloudinary.
- `AGENTS.md`, comentarios en `scripts/clean-demo-db.js`, posible mención en README.

### 3.4 Modelo de datos (sin cambio de schema)

Se siguen guardando strings URL en:

- `Producto.imagenFrente` / `Producto.imagenEspalda`
- `Seccion.escudo`

No hace falta migración de schema Mongoose. Las URLs históricas de Cloudinary pueden seguir renderizándose (ver §6).

### 3.5 Lo que NO usa Cloudinary hoy

- Banners: `multer.diskStorage` → `/images/banners/...`
- Placeholders `placehold.co` en seeds
- URLs pegadas manualmente en el formulario admin

## 4. Objetivo (comportamiento deseado)

1. El admin autenticado elige un archivo de imagen en el panel.
2. El archivo se almacena en un **Blob store público** de Vercel.
3. El cliente recibe una **URL https** del blob y la persiste como hoy (crear/editar producto o sección).
4. La tienda muestra esa URL en catálogo, detalle, hover frente/espalda y escudos.
5. No queda código, dependencia ni variable de entorno de Cloudinary en el repo operativo.
6. Local y producción usan `BLOB_READ_WRITE_TOKEN` (u OIDC en Vercel cuando aplique).

## 5. Decisión de arquitectura

### 5.1 Enfoque recomendado: subida server-side con `put()`

Dado que el frontend es **vanilla sin bundler**, no conviene depender de `@vercel/blob/client` (`upload()`) en el browser (módulo ESM/npm).

**Flujo propuesto:**

```
Browser (admin)                  Express (server.js)              Vercel Blob
     |                                 |                              |
     |  POST /api/admin/blob-subir     |                              |
     |  multipart/form-data (file)     |                              |
     |-------------------------------->|                              |
     |                                 |  put(pathname, body, ...)    |
     |                                 |----------------------------->|
     |                                 |  { url, pathname, ... }      |
     |                                 |<-----------------------------|
     |  { ok: true, url }              |                              |
     |<--------------------------------|                              |
     |  guarda url en producto/sección (rutas existentes)             |
```

- SDK: `const { put, del } = require('@vercel/blob');` (CommonJS, alineado al monolito).
- Auth de la ruta: `verificarAdminJWT` + `verificarOrigenMutacion` (mismo patrón CSRF que otras mutaciones admin).
- Credencial: `process.env.BLOB_READ_WRITE_TOKEN` (obligatoria en local; en Vercel puede coexistir con OIDC/`BLOB_STORE_ID`).

### 5.2 Alternativa documentada (no preferida ahora): `upload()` + `handleUpload`

Solo si en el futuro se necesita eludir el límite de ~4.5 MB del body de Vercel Functions: token client-side vía `handleUpload` y `upload()` desde el browser. Requiere estrategia de carga del cliente SDK sin bundler (CDN/import map) y queda **fuera del MVP** de esta feature, salvo que las pruebas demuestren que las fotos de camisetas superan el límite de forma habitual.

### 5.3 Acceso del store

- Store **público** (`access: 'public'`) para que `<img src="...">` funcione sin proxy.
- Prefijo de pathname sugerido: `productos/` y `escudos/` (o `jerseys-store/productos/...` para continuidad semántica).
- Usar `addRandomSuffix: true` (o pathname con timestamp/uuid) para evitar colisiones.

### 5.4 Borrado (`del`)

Hoy Cloudinary **no** borra el asset al reemplazar imagen. Decisión:

| Caso | Comportamiento MVP |
|------|--------------------|
| Reemplazo de imagen de producto/escudo | **Opcional pero recomendado**: si la URL anterior es de este Blob store, llamar `del(urlAnterior)` best-effort (no fallar el guardado si el delete falla). |
| Borrado de producto | Best-effort `del` de frente/espalda si son URLs del store. |
| URLs Cloudinary legacy | No intentar borrar en Cloudinary (cuenta a desconectar). |

Si el costo de implementación es alto, el MVP puede omitir `del` y dejarlo como tarea follow-up; la checklist de verificación debe reflejar explícitamente si aplica o no.

## 6. Compatibilidad con URLs existentes

- Las URLs ya guardadas de Cloudinary deben **seguir mostrándose** (campo string crudo en `<img>`).
- Las funciones `optimizarUrlImagenProducto` / `optimizarUrlEscudo`:
  - Si la URL es Cloudinary → pueden devolver la URL original **sin** transforms (simplificación al retirar Cloudinary), o conservar transforms solo para legacy hasta limpieza de datos.
  - Si la URL es Blob (`*.blob.vercel-storage.com`) → devolver la URL tal cual (Blob no replica el pipeline de transforms de Cloudinary).
  - Cualquier otra https → passthrough.
- No se exige un script de re-subida masiva de assets legacy en esta feature; puede documentarse como trabajo posterior opcional.

## 7. Contrato de API

### 7.1 Eliminar

- `POST /api/admin/cloudinary-firma`

### 7.2 Agregar

**`POST /api/admin/blob-subir`**

| Aspecto | Valor |
|---------|--------|
| Auth | Admin JWT (cookie o Bearer) |
| CSRF | `verificarOrigenMutacion` |
| Body | `multipart/form-data`, campo `file` (o `imagen`) |
| Límites | MIME: JPEG, PNG, WebP, GIF; tamaño máximo alineado a práctica actual de banners (p. ej. 5 MB) y al límite de Functions (~4.5 MB en Vercel) — documentar el menor de ambos |
| Respuesta 200 | `{ ok: true, url: string, pathname?: string }` |
| Errores | `401/403` auth; `400` archivo inválido; `503` sin `BLOB_READ_WRITE_TOKEN`; `500` fallo Blob |

El frontend debe usar **`datos.url`** (equivalente semántico a `secure_url` de Cloudinary).

### 7.3 Sin cambios de contrato

Rutas de productos/secciones que ya reciben `imagenFrente`, `imagenEspalda`, `escudo` como string URL.

## 8. Cambios de frontend

| Antes | Después |
|-------|---------|
| `subirImagenACloudinary` | `subirImagenABlob` (o nombre en español equivalente) |
| Firma + fetch a `api.cloudinary.com` | `FormData` + `apiFetch`/`fetch` a `/api/admin/blob-subir` (misma origen → cookies JWT) |
| Retorno `secure_url` | Retorno `url` del JSON propio |
| Helpers Cloudinary de transform | Passthrough / legacy-safe; sin dependencia de `CLOUDINARY_CLOUD_NAME` |
| Texto UI “Cloudinary” | “almacenamiento de la tienda” / “Vercel Blob” según tono de producto (rioplatense, sin jerga innecesaria al usuario final) |

Bump de `data/asset-version.json` + `npm run assets:version` tras tocar `app.js` / HTML.

## 9. Variables de entorno

### Eliminar (código, docs, Vercel project, `server/.env` local)

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_UPLOAD_PRESET`

### Agregar / configurar

| Variable | Uso |
|----------|-----|
| `BLOB_READ_WRITE_TOKEN` | Token read-write del Blob store. **Obligatoria** para desarrollo local y para `put`/`del`/`handleUpload` fuera de OIDC. Se obtiene al crear el store en Vercel → Storage → Blob, o con `vercel env pull`. |

Opcionales en deploy Vercel con store conectado al proyecto: `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN` (la plataforma las inyecta). La app debe seguir documentando `BLOB_READ_WRITE_TOKEN` como la variable que el operador configura de forma explícita.

Actualizar: validación de arranque, `AGENTS.md`, `README.md` (ejemplo de `.env`).

## 10. Seguridad y CSP

- Remover `https://api.cloudinary.com` de `connectSrc` en Helmet.
- La subida pasa por `'self'` → no hace falta permitir el host de Blob en `connectSrc` si se usa solo `put()` server-side.
- `imgSrc` ya permite `https:` → las URLs de Blob cargan sin cambio.
- Nunca exponer `BLOB_READ_WRITE_TOKEN` al cliente.
- Validar MIME/tamaño en servidor antes de `put()`.

## 11. Criterios de aceptación

1. `cloudinary` no aparece en `server/package.json` ni en `require`s.
2. No existen rutas ni strings operativos `cloudinary-firma` / `api.cloudinary.com` / `res.cloudinary.com` en lógica de subida nueva (legacy helpers solo si se mantienen para URLs viejas).
3. Admin puede subir frente, espalda y escudo; las URLs resultantes son del dominio Blob y se ven en tienda y admin.
4. Sin token configurado, la API responde error claro en español (503) y el arranque advierte la variable faltante.
5. Banners siguen funcionando con Multer local.
6. Docs (`AGENTS.md`, README) reflejan Blob y no Cloudinary.

## 12. Riesgos

| Riesgo | Mitigación |
|--------|------------|
| Límite ~4.5 MB en Vercel Functions | Validar tamaño; comprimir en admin o mensaje claro; evaluar client upload después |
| Pérdida de transforms CDN (trim/resize) | Aceptar imagen original o optimizar client-side leve en follow-up |
| Orphans al reemplazar | `del` best-effort |
| Assets Cloudinary legacy rotos si se cierra la cuenta | Mantener cuenta o re-subir antes de cancelar |

## 13. Referencias de código actuales

- Firma: `server/server.js` (~líneas Cloudinary config + `/api/admin/cloudinary-firma`)
- Subida cliente: `public/js/app.js` → `subirImagenACloudinary` y call sites de producto/sección
- Optimización: `optimizarUrlImagenProducto`, `optimizarUrlEscudo`
- Banners (no migrar): `uploadBanner` + `/api/admin/banners/...`
