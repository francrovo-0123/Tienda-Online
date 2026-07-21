/**
 * Cache-busting unificado (B3).
 *
 * Fuente de verdad: data/asset-version.json → { "version": "15.2" }
 * También respeta ASSET_VERSION en el entorno (prioridad sobre el JSON).
 *
 * Qué hace:
 *  1. Lee la versión de build.
 *  2. En todos los HTML de /public, reemplaza:
 *       ?v=__ASSET_VERSION__  →  ?v=15.2
 *       ?v=<cualquier-cosa> en href/src locales de css|js  →  ?v=15.2
 *     (no toca CDNs externos ni /store-env.js).
 *
 * Uso:
 *   node scripts/apply-asset-version.js
 *   node scripts/apply-asset-version.js --dry-run
 *   ASSET_VERSION=16.0 node scripts/apply-asset-version.js
 *   npm run assets:version
 *
 * Convención en HTML (preferida):
 *   <script src="js/app.js?v=__ASSET_VERSION__"></script>
 *   <link rel="stylesheet" href="css/global.css?v=__ASSET_VERSION__">
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const VERSION_FILE = path.join(ROOT, 'data', 'asset-version.json');
const PLACEHOLDER = '__ASSET_VERSION__';
const dryRun = process.argv.includes('--dry-run');

function leerVersion() {
  const desdeEnv = String(process.env.ASSET_VERSION || '').trim();
  if (desdeEnv) return desdeEnv;

  try {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
    const v = String(data.version || '').trim();
    if (v) return v;
  } catch (error) {
    console.warn('No se pudo leer data/asset-version.json:', error.message);
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    return String(pkg.version || '1.0.0');
  } catch {
    return '1.0.0';
  }
}

function listarHtml(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listarHtml(full));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Reescribe ?v= en assets locales (css/js relativos o absolutos del sitio).
 */
function aplicarVersionEnHtml(html, version) {
  let next = html;

  // Placeholder explícito
  next = next.split(`?v=${PLACEHOLDER}`).join(`?v=${version}`);

  // link href="…css…?v=…"
  next = next.replace(
    /(<link\b[^>]*\bhref=["'](?!https?:\/\/|\/\/)[^"']+\.css)\?v=[^"']*(["'])/gi,
    `$1?v=${version}$2`
  );

  // script src="…js…?v=…" (excluye store-env y CDNs)
  next = next.replace(
    /(<script\b[^>]*\bsrc=["'](?!https?:\/\/|\/\/|\/store-env\.js)[^"']+\.js)\?v=[^"']*(["'])/gi,
    `$1?v=${version}$2`
  );

  // Scripts/links locales sin query → agregar ?v=
  next = next.replace(
    /(<link\b[^>]*\bhref=["'](?!https?:\/\/|\/\/)[^"']+\.css)(["'])/gi,
    (match, pre, quote) => (match.includes('?v=') ? match : `${pre}?v=${version}${quote}`)
  );
  next = next.replace(
    /(<script\b[^>]*\bsrc=["'](?!https?:\/\/|\/\/|\/store-env\.js)[^"']+\.js)(["'])/gi,
    (match, pre, quote) => (match.includes('?v=') ? match : `${pre}?v=${version}${quote}`)
  );

  return next;
}

function main() {
  const version = leerVersion();
  const archivos = listarHtml(PUBLIC_DIR);
  let cambiados = 0;

  for (const archivo of archivos) {
    const original = fs.readFileSync(archivo, 'utf8');
    const actualizado = aplicarVersionEnHtml(original, version);
    if (actualizado === original) continue;

    cambiados += 1;
    const rel = path.relative(ROOT, archivo);
    if (dryRun) {
      console.log(`[dry-run] ${rel}`);
    } else {
      fs.writeFileSync(archivo, actualizado, 'utf8');
      console.log(`updated ${rel}`);
    }
  }

  console.log(
    dryRun
      ? `Asset version ${version}: ${cambiados} archivo(s) se actualizarían.`
      : `Asset version ${version}: ${cambiados} archivo(s) actualizado(s).`
  );
}

main();
