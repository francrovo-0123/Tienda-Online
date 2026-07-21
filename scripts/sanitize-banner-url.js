/**
 * Sanitiza URLs de banners (imagenUrl / enlace).
 *
 * Reglas:
 *  - Protocolo relativo (`//cdn.example/img.jpg`) → `https://cdn.example/img.jpg`
 *  - `http://` remoto → se fuerza a `https://` (salvo localhost)
 *  - Rutas locales (`/images/banners/...`, `/productos?...`) se conservan
 *  - `javascript:`, `data:` y esquemas raros → string vacío
 *
 * Uso:
 *   const { sanitizarUrlBanner } = require('./sanitize-banner-url');
 *   sanitizarUrlBanner('//images.unsplash.com/photo'); // https://images.unsplash.com/photo
 *
 * CLI (opcional):
 *   node scripts/sanitize-banner-url.js "//example.com/a.jpg"
 */

'use strict';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function esHostLocal(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
}

/**
 * @param {string} valor
 * @param {{ baseUrl?: string, forzarHttps?: boolean }} [opciones]
 * @returns {string} URL segura o string vacío si no es usable
 */
function sanitizarUrlBanner(valor, opciones = {}) {
  const crudo = String(valor || '').trim();
  if (!crudo) return '';

  const forzarHttps = opciones.forzarHttps !== false;
  const baseUrl = String(opciones.baseUrl || 'https://localhost').trim() || 'https://localhost';

  // Esquemas peligrosos / no http(s)
  if (/^(javascript|data|vbscript|file):/i.test(crudo)) return '';

  let candidato = crudo;

  // Protocolo relativo → https explícito (B2)
  if (candidato.startsWith('//')) {
    candidato = `https:${candidato}`;
  }

  // Ruta relativa de la tienda: conservar tal cual
  if (candidato.startsWith('/') && !candidato.startsWith('//')) {
    return candidato;
  }

  try {
    const parsed = new URL(candidato, baseUrl);

    if (parsed.protocol === 'https:') {
      return parsed.href;
    }

    if (parsed.protocol === 'http:') {
      if (esHostLocal(parsed.hostname)) {
        return parsed.href;
      }
      if (forzarHttps) {
        parsed.protocol = 'https:';
        return parsed.href;
      }
      return '';
    }

    return '';
  } catch {
    return '';
  }
}

/**
 * Normaliza un objeto banner completo (imagen + enlace).
 * @param {object} banner
 * @param {{ baseUrl?: string }} [opciones]
 */
function sanitizarBanner(banner, opciones = {}) {
  const datos = banner && typeof banner === 'object' ? banner : {};
  return {
    ...datos,
    imagenUrl: sanitizarUrlBanner(datos.imagenUrl || datos.imagen_url || datos.imagen || '', opciones),
    enlace: sanitizarUrlBanner(datos.enlace || datos.link || '', opciones),
  };
}

module.exports = {
  sanitizarUrlBanner,
  sanitizarBanner,
  esHostLocal,
};

if (require.main === module) {
  const input = process.argv[2] || '';
  const out = sanitizarUrlBanner(input);
  process.stdout.write(`${out}\n`);
  process.exit(out ? 0 : 1);
}
