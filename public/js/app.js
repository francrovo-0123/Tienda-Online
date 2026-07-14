function formatearPrecio(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '$ 0';
  }

  const formateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numero);

  return formateado.replace(/^\$\s?/, '$ ');
}

function tieneOfertaValida(producto) {
  const oferta = Number(producto.precioOferta);
  const precio = Number(producto.precio);
  return Number.isFinite(oferta) && oferta > 0 && oferta < precio;
}

function obtenerPrecioEfectivo(producto) {
  return tieneOfertaValida(producto) ? Number(producto.precioOferta) : Number(producto.precio);
}

function calcularDescuentoPorcentaje(precio, precioOferta) {
  return Math.round(((precio - precioOferta) / precio) * 100);
}

function normalizarPrecioOfertaFormulario(valor, precioBase) {
  if (valor === '' || valor === null || valor === undefined) return null;

  const oferta = Number(valor);
  const base = Number(precioBase);

  if (!Number.isFinite(oferta) || oferta <= 0) return null;
  if (!Number.isFinite(base) || oferta >= base) return null;

  return Math.round(oferta);
}

function obtenerDescuentoOfertaFormulario(producto) {
  if (!tieneOfertaValida(producto)) return '';
  return String(producto.precioOferta);
}

function actualizarControlesPreciosMasivo() {
  const selectTipo = document.getElementById('precios-masivo-tipo');
  const wrapPorcentaje = document.getElementById('precios-masivo-porcentaje-wrap');
  const btn = document.getElementById('btn-aplicar-precios-masivo');
  const quitarOfertas = selectTipo?.value === 'quitar-ofertas';

  wrapPorcentaje?.classList.toggle('hidden', quitarOfertas);
  if (btn) {
    btn.textContent = quitarOfertas ? 'Quitar descuentos' : 'Aplicar actualización';
  }
}

function actualizarBotonQuitarDescuentoProducto() {
  const btn = document.getElementById('btn-quitar-descuento-producto');
  const input = document.getElementById('producto-precio-oferta');
  const switchOferta = document.getElementById('producto-en-oferta');
  if (!btn) return;

  const producto =
    editandoProductoId !== null ? productos.find((p) => p.id === editandoProductoId) : null;
  const tieneDescuentoGuardado = Boolean(producto && tieneOfertaValida(producto));
  const tieneValorEnInput = Boolean(input?.value?.trim());
  const ofertaActiva = Boolean(switchOferta?.checked);

  btn.classList.toggle('hidden', !(ofertaActiva && (tieneDescuentoGuardado || tieneValorEnInput)));
}

function actualizarControlesOfertaFormulario() {
  const switchOferta = document.getElementById('producto-en-oferta');
  const wrap = document.getElementById('producto-precio-oferta-wrap');
  const input = document.getElementById('producto-precio-oferta');
  const optional = document.getElementById('producto-precio-oferta-optional');
  const activo = Boolean(switchOferta?.checked);

  wrap?.classList.toggle('is-disabled', !activo);

  if (input) {
    input.disabled = !activo;
    input.required = activo;
    if (!activo) {
      input.value = '';
    }
  }

  if (optional) {
    optional.textContent = activo ? '(obligatorio)' : '(activá «En Oferta»)';
  }

  actualizarBotonQuitarDescuentoProducto();
}

async function quitarDescuentoProducto() {
  const switchOferta = document.getElementById('producto-en-oferta');
  const input = document.getElementById('producto-precio-oferta');
  if (switchOferta) switchOferta.checked = false;
  if (input) input.value = '';
  actualizarControlesOfertaFormulario();

  if (editandoProductoId === null) {
    mostrarToast('Oferta quitada del formulario.');
    return;
  }

  const producto = productos.find((p) => p.id === editandoProductoId);
  if (!producto) return;

  if (!tieneOfertaValida(producto) && !(producto.enOferta || producto.en_oferta)) {
    return;
  }

  const btn = document.getElementById('btn-quitar-descuento-producto');
  btn?.setAttribute('disabled', 'true');

  try {
    // Fix: antes solo limpiaba precioOferta y dejaba enOferta=true (oferta huérfana en portada).
    const actualizado = await apiFetch(`/api/productos/${producto.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: producto.nombre,
        precio: producto.precio,
        precioOferta: null,
        enOferta: false,
        categoria: producto.categoria,
        genero: producto.genero || 'hombre',
        stock: producto.stock ?? 0,
        stockTalles: producto.stockTalles,
        descripcion: producto.descripcion || '',
        imagenFrente: obtenerImagenFrente(producto),
        imagenEspalda: obtenerImagenEspalda(producto),
        talles: producto.talles,
      }),
    });

    const indice = productos.findIndex((p) => p.id === producto.id);
    if (indice !== -1) productos[indice] = actualizado;

    actualizarControlesOfertaFormulario();
    actualizarVistaCatalogoAdmin();
    renderizarGestionPortada();
    await refrescarCatalogoTrasCambioAdmin();
    mostrarToast(`Oferta quitada de «${actualizado.nombre}».`);
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo quitar el descuento.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

function obtenerImagenFrente(producto) {
  if (!producto) return '';

  const directa = String(producto.imagenFrente || '').trim();
  if (directa) return directa;

  const { imagen } = producto;
  if (Array.isArray(imagen)) {
    const url = imagen.find((item) => String(item || '').trim().startsWith('http'));
    if (url) return String(url).trim();
  }

  const texto = String(imagen || '').trim();
  if (!texto) return '';

  if (texto.includes(',http')) {
    return texto.split(/,(?=https?:\/\/)/).map((url) => url.trim()).find(Boolean) || '';
  }

  return texto.startsWith('http') ? texto : '';
}

function obtenerImagenEspalda(producto) {
  if (!producto) return '';

  const espalda = String(producto.imagenEspalda || '').trim();
  if (espalda) return espalda;

  const { imagen } = producto;
  if (Array.isArray(imagen)) {
    const urls = imagen
      .map((item) => String(item || '').trim())
      .filter((url) => url.startsWith('http'));
    if (urls[1]) return urls[1];
  }

  return obtenerImagenFrente(producto);
}

function obtenerImagenesProducto(producto) {
  if (!producto) return [];

  const frente = obtenerImagenFrente(producto);
  const espalda = obtenerImagenEspalda(producto);

  if (!frente) return [];
  if (espalda && espalda !== frente) return [frente, espalda];
  return [frente];
}

function obtenerImagenPrincipal(producto) {
  return obtenerImagenFrente(producto);
}

const API_BASE = window.location.origin;
let NOMBRE_TIENDA = 'Jersey Store';
let WHATSAPP_NUMERO = '';
let CLOUDINARY_CLOUD_NAME = '';
let CLOUDINARY_UPLOAD_PRESET = '';
const SESSION_USER_KEY = 'sesion_usuario';
const ADMIN_TOKEN_KEY = 'admin_jwt_token';
const CLIENTE_TOKEN_KEY = 'cliente_jwt_token';
const CARRITO_LEGACY_KEY = 'carrito';
const CARRITO_USUARIO_PREFIX = 'carrito_usuario_';
const CHECKOUT_PERFIL_KEY = 'jerseys_checkout_perfiles';
const SEARCH_STATS_KEY = 'jerseys_busquedas_stats';
/**
 * Cupón validado en checkout.
 * @type {{
 *   codigo: string,
 *   descuentoPorcentaje: number,
 *   idsElegibles: Array<string|number>|null,
 *   montoAplicable: number|null
 * } | null}
 */
let cuponAplicado = null;
const ESTADOS_PEDIDO = ['pendiente_pago', 'listo_empaquetar', 'despachado', 'entregado'];
const ETIQUETAS_ESTADO_PEDIDO = {
  pendiente_pago: 'Pendiente de pago',
  listo_empaquetar: 'Listo para empaquetar',
  despachado: 'Despachado',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};
const ESTADOS_PEDIDO_LEGACY = {
  'Pendiente de pago': 'pendiente_pago',
  Pendiente: 'pendiente_pago',
  Aprobado: 'listo_empaquetar',
  'Preparación de pedido': 'listo_empaquetar',
  'En Preparación': 'listo_empaquetar',
  Enviado: 'despachado',
  Entregado: 'entregado',
  Listo: 'entregado',
  pagado: 'listo_empaquetar',
  confirmado: 'listo_empaquetar',
  Rechazado: 'cancelado',
};
const CLUB_NAV_ESCUDO_MAX = 68;
const TALLES_ROPA_DISPONIBLES = ['S', 'M', 'L', 'XL', 'XXL'];
const TALLES_CALZADO_DISPONIBLES = [
  '35', '35.5', '36', '36.5', '37', '37.5', '38', '38.5',
  '39', '39.5', '40', '40.5', '41', '41.5', '42', '42.5',
  '43', '43.5', '44', '44.5', '45',
];
/** @deprecated Usar obtenerTallesDisponiblesPorTipo(); se mantiene para compatibilidad interna. */
const TALLES_DISPONIBLES = TALLES_ROPA_DISPONIBLES;

const seccionesEjemplo = [
  { id: 1, nombre: 'Remeras', escudo: '', grupo: 'general', esFija: false, padreId: null },
  { id: 2, nombre: 'Camperas', escudo: '', grupo: 'general', esFija: false, padreId: null },
  { id: 3, nombre: 'Pantalones', escudo: '', grupo: 'general', esFija: false, padreId: null },
  { id: 100, nombre: 'Calzado', escudo: '', grupo: 'calzado', esFija: true, padreId: null },
];

const NOMBRE_SECCION_CALZADO = 'Calzado';

let generoFiltroActivo = 'todos';
let productos = [];
let secciones = [];
let categoriaFiltroActiva = 'todos';
let ligaFiltroActiva = '';
let filtroSoloOfertas = false;
let criterioOrdenActivo = 'predeterminado';
let busquedaActiva = '';
let editandoProductoId = null;
let seccionActivaId = null;
let imagenFrenteFormulario = '';
let imagenEspaldaFormulario = '';
let archivoPendienteFrente = null;
let archivoPendienteEspalda = null;
let previewPendienteFrente = null;
let previewPendienteEspalda = null;
let busquedaPredictivaTimer = null;
let busquedaRenderTimer = null;
let renderProductosToken = 0;
let archivoEscudoPendiente = null;
let previewEscudoPendiente = null;
let archivoEscudoDetallePendiente = null;
let previewEscudoDetallePendiente = null;

let carrito = [];
let tallesSeleccionados = {};
let pedidos = [];
let datosRegistroTemporal = {};
let modalDetalleSeccionSuspendido = false;
let estadisticasAdmin = null;
let metricasDashboard = null;

async function cargarConfiguracionTienda() {
  try {
    const respuesta = await fetch(`${API_BASE}/api/config`);
    if (!respuesta.ok) {
      throw new Error('No se pudo cargar la configuración de la tienda.');
    }

    const config = await respuesta.json();
    NOMBRE_TIENDA = String(config.nombreTienda || 'Jersey Store').trim() || 'Jersey Store';
    WHATSAPP_NUMERO = String(config.whatsappNumero || '').trim();
    CLOUDINARY_CLOUD_NAME = String(config.cloudinaryCloudName || '').trim();
    CLOUDINARY_UPLOAD_PRESET = String(config.cloudinaryUploadPreset || '').trim();
    aplicarMarcaTienda();
    actualizarEnlaceWhatsappFab();
    actualizarEnlaceAfipDataFiscal(config.afipLink);
  } catch (error) {
    console.error('Error al cargar configuración de la tienda:', error);
  }
}

function dividirNombreTienda(nombre) {
  const partes = String(nombre || 'Jersey Store').trim().split(/\s+/);
  if (partes.length <= 1) {
    return { marca: partes[0] || 'Jersey', sufijo: 'Store' };
  }

  return {
    marca: partes.slice(0, -1).join(' '),
    sufijo: partes[partes.length - 1],
  };
}

function aplicarMarcaTienda() {
  const nombre = NOMBRE_TIENDA || 'Jersey Store';
  const { marca, sufijo } = dividirNombreTienda(nombre);
  const enAdmin = document.body.classList.contains('admin-active');

  document.title = enAdmin ? `${nombre} - Panel de Administración` : nombre;

  document.querySelectorAll('.logo-text__brand').forEach((el) => {
    el.textContent = marca;
  });
  document.querySelectorAll('.logo-text__store').forEach((el) => {
    el.textContent = sufijo;
  });
  document.querySelectorAll('.logo-img[alt], .footer-logo-img[alt], .admin-sidebar__logo-img[alt]').forEach((el) => {
    el.setAttribute('alt', nombre);
  });
  document.querySelectorAll('.footer-logo').forEach((el) => {
    el.textContent = nombre;
  });
  document.querySelectorAll('.footer-copyright__company').forEach((el) => {
    el.textContent = nombre;
  });
  document.querySelectorAll('.admin-sidebar__logo').forEach((el) => {
    el.textContent = nombre;
  });
  document.querySelectorAll('.logo[aria-label]').forEach((el) => {
    el.setAttribute('aria-label', `${nombre} — Inicio`);
  });
  document.querySelector('meta[name="description"]')?.setAttribute(
    'content',
    `${nombre} — camisetas de fútbol oficiales y de colección.`
  );
}

function formatearNumeroWhatsApp(numero) {
  const limpio = String(numero || '').replace(/\D/g, '');
  if (!limpio) return '';

  if (limpio.startsWith('54') && limpio.length >= 12) {
    const resto = limpio.slice(2);
    const area = resto.slice(0, 3);
    const bloque1 = resto.slice(3, 6);
    const bloque2 = resto.slice(6);
    return `+54 ${area} ${bloque1}-${bloque2}`;
  }

  return `+${limpio}`;
}

function actualizarEnlaceWhatsappFab() {
  const fab = document.getElementById('whatsapp-fab');
  const footerWa = document.getElementById('footer-whatsapp');

  if (!WHATSAPP_NUMERO) return;

  const href = `https://wa.me/${WHATSAPP_NUMERO}`;
  const display = formatearNumeroWhatsApp(WHATSAPP_NUMERO);

  if (fab) fab.href = href;
  if (footerWa) {
    footerWa.href = href;
    if (display) footerWa.textContent = display;
  }
}

function actualizarEnlaceAfipDataFiscal(afipLink) {
  const enlace = document.getElementById('afip-data-fiscal-link');
  if (!enlace) return;

  const url = String(afipLink || '').trim();
  if (url) {
    enlace.href = url;
    enlace.style.display = 'block';
  } else {
    enlace.href = '#';
    enlace.style.display = 'none';
  }
}

async function subirImagenACloudinary(archivo) {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('La subida de imágenes no está configurada en el servidor.');
  }
  const formData = new FormData();
  formData.append('file', archivo);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const respuesta = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    { method: 'POST', body: formData }
  );

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok || !datos.secure_url) {
    throw new Error(datos.error?.message || 'No se pudo subir la imagen a Cloudinary.');
  }

  return datos.secure_url;
}

function extraerMensajeErrorApi(datos, status) {
  if (typeof datos?.error === 'string' && datos.error.trim()) return datos.error.trim();
  if (typeof datos?.message === 'string' && datos.message.trim()) return datos.message.trim();
  if (typeof datos?.error?.message === 'string' && datos.error.message.trim()) {
    return datos.error.message.trim();
  }
  if (status === 502 || status === 504) {
    return 'El servidor tardó demasiado en responder. Intentá de nuevo en unos segundos.';
  }
  if (status === 503) {
    return 'Servicio temporalmente no disponible. Intentá de nuevo.';
  }
  return `Error en la petición al servidor (${status}).`;
}

async function apiFetch(ruta, opciones = {}) {
  const esFormData = opciones.body instanceof FormData;
  const headers = { ...opciones.headers };

  if (!esFormData) {
    headers['Content-Type'] = 'application/json';
  }

  // ngrok free muestra un interstitial HTML que rompe el JSON de /api/*
  if (/\.ngrok(-free)?\.(app|dev|io)$/i.test(window.location.hostname)) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(CLIENTE_TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let respuesta;
  try {
    respuesta = await fetch(`${API_BASE}${ruta}`, {
      ...opciones,
      headers,
    });
  } catch (error) {
    throw new Error(
      error?.message?.includes('Failed to fetch')
        ? 'No se pudo conectar con el servidor. Revisá tu conexión e intentá de nuevo.'
        : (error?.message || 'No se pudo completar la petición.')
    );
  }

  const texto = await respuesta.text();
  let datos = {};
  if (texto) {
    try {
      datos = JSON.parse(texto);
    } catch {
      if (!respuesta.ok) {
        throw new Error(extraerMensajeErrorApi({}, respuesta.status));
      }
      throw new Error('El servidor devolvió una respuesta inválida. Intentá de nuevo.');
    }
  }

  if (!respuesta.ok) {
    const mensaje = String(
      (typeof datos.error === 'string' && datos.error) || datos.message || ''
    );
    const sesionExpirada =
      respuesta.status === 401
      && (
        mensaje.toLowerCase().includes('expir')
        || mensaje.toLowerCase().includes('autentic')
      );

    if (sesionExpirada || (respuesta.status === 403 && mensaje.toLowerCase().includes('token'))) {
      const habiaSesion = Boolean(
        localStorage.getItem(ADMIN_TOKEN_KEY)
        || localStorage.getItem(CLIENTE_TOKEN_KEY)
        || sessionStorage.getItem(SESSION_USER_KEY)
        || localStorage.getItem(SESSION_USER_KEY)
      );

      if (habiaSesion && !ruta.startsWith('/api/auth/')) {
        limpiarSesionLocal();
        mostrarVistaTienda();
        actualizarUIUsuario();
        abrirAuthModal();
        throw new Error('Tu sesión expiró. Iniciá sesión de nuevo.');
      }
    }

    if (respuesta.status === 404 && !datos.error) {
      throw new Error('El servidor no reconoce esta acción. Reiniciá el servidor e intentá de nuevo.');
    }
    throw new Error(extraerMensajeErrorApi(datos, respuesta.status));
  }

  return datos;
}

function formatearFecha(isoString) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

function formatearFechaCorta(isoString) {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString));
}

const TOAST_DURACION_MS = 4000;

const TOAST_ICONOS = {
  success: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>`,
  error: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"/></svg>`,
};

function inicializarToastContainer() {
  if (document.getElementById('toast-container')) return;

  const contenedor = document.createElement('div');
  contenedor.id = 'toast-container';
  contenedor.className = 'toast-container';
  contenedor.setAttribute('aria-live', 'polite');
  contenedor.setAttribute('aria-atomic', 'false');
  document.body.appendChild(contenedor);
}

function mostrarToast(mensaje, tipo = 'success', opciones = {}) {
  const contenedor = document.getElementById('toast-container');
  if (!contenedor) return;

  const titulo = opciones.titulo || '';
  const tipoToast = TOAST_ICONOS[tipo] ? tipo : 'info';
  const icono = TOAST_ICONOS[tipoToast];

  const toast = document.createElement('div');
  toast.className = `toast ${tipoToast}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icono}</span>
    <div class="toast__content">
      ${titulo ? `<span class="toast__title">${escaparAtributoHtml(titulo)}</span>` : ''}
      <span class="toast__message">${escaparAtributoHtml(mensaje)}</span>
    </div>
  `;
  contenedor.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  const cerrar = () => {
    if (!toast.isConnected) return;

    toast.classList.remove('show');
    toast.classList.add('hiding');

    const eliminar = () => toast.remove();
    toast.addEventListener('transitionend', eliminar, { once: true });
    setTimeout(eliminar, 500);
  };

  const timeoutId = setTimeout(cerrar, TOAST_DURACION_MS);
  toast.addEventListener('click', () => {
    clearTimeout(timeoutId);
    cerrar();
  });
}

function crearHtmlSkeletonTarjeta() {
  return `
    <div class="skeleton-card" aria-hidden="true">
      <div class="skeleton-card__image"></div>
      <div class="skeleton-card__body">
        <div class="skeleton-card__line skeleton-card__line--title"></div>
        <div class="skeleton-card__line skeleton-card__line--price"></div>
      </div>
    </div>
  `;
}

function obtenerCantidadSkeletons() {
  return window.matchMedia('(min-width: 768px)').matches ? 6 : 4;
}

function obtenerContenedorTienda() {
  return document.getElementById('store-sections-container');
}

function debeMostrarSkeletonTienda() {
  const container = obtenerContenedorTienda();
  const storeView = document.getElementById('store-view');
  return Boolean(container && (!storeView || storeView.style.display !== 'none'));
}

function renderizarSkeletonProductos(container) {
  const destino = container || obtenerContenedorTienda();
  if (!destino) return;

  const cantidad = obtenerCantidadSkeletons();
  const skeletons = Array.from({ length: cantidad }, () => crearHtmlSkeletonTarjeta()).join('');

  destino.innerHTML = `
    <div class="products-grid products-grid--loading" aria-busy="true" aria-label="Cargando productos">
      ${skeletons}
    </div>
  `;
}

function solicitarRenderizadoProductos(opciones = {}) {
  const { delay = 0, skeleton = true } = opciones;
  const token = ++renderProductosToken;

  if (skeleton && debeMostrarSkeletonTienda()) {
    renderizarSkeletonProductos();
  }

  const ejecutar = () => {
    if (token !== renderProductosToken) return;
    renderizarStadiumCarousel();
    renderizarProductos();
  };

  if (delay > 0) {
    clearTimeout(busquedaRenderTimer);
    busquedaRenderTimer = setTimeout(ejecutar, delay);
    return;
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(ejecutar);
  });
}

function obtenerScrollY() {
  return Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
}

function animarEntradaProductos(container) {
  const tarjetas = container.querySelectorAll('.product-card');
  if (!tarjetas.length) return;

  const esMobile = window.matchMedia('(max-width: 768px)').matches;
  const limiteAnimacion = esMobile ? 12 : 24;

  tarjetas.forEach((tarjeta, indice) => {
    if (indice >= limiteAnimacion) {
      tarjeta.style.opacity = '1';
      return;
    }

    tarjeta.classList.add('product-card--fade-in');
    tarjeta.style.animationDelay = `${Math.min(indice * 55, 440)}ms`;
  });

  container.querySelectorAll('.products-grid').forEach((grid) => {
    grid.classList.add('products-grid--loaded');
  });
}

function normalizarTelefono(telefono) {
  return telefono.replace(/\D/g, '');
}

async function cargarPedidos() {
  try {
    pedidos = await apiFetch('/api/pedidos');
  } catch {
    pedidos = [];
  }
}

function obtenerClaseEstado(estado) {
  const estadoNormalizado = normalizarEstadoPedidoCliente(estado);
  const mapa = {
    pendiente_pago: 'pendiente',
    listo_empaquetar: 'preparacion',
    despachado: 'enviado',
    entregado: 'entregado',
    cancelado: 'rechazado',
  };
  return mapa[estadoNormalizado] || 'pendiente';
}

/** Clases de color para badges del panel de pedidos admin. */
function obtenerClaseBadgeEstado(estado) {
  const estadoNormalizado = normalizarEstadoPedidoCliente(estado);
  const mapa = {
    pendiente_pago: 'badge-amarillo',
    listo_empaquetar: 'badge-naranja',
    despachado: 'badge-azul',
    entregado: 'badge-verde',
  };
  return mapa[estadoNormalizado] || 'badge-amarillo';
}

function escaparTextoHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function crearBadgeEstadoPedido(estado) {
  const clase = obtenerClaseBadgeEstado(estado);
  const etiqueta = obtenerEtiquetaEstado(estado);
  return `<span class="pedido-badge ${clase}">${escaparTextoHtml(etiqueta)}</span>`;
}

function crearBotonNotificarDespacho(pedidoId, estado) {
  const puedeNotificar = normalizarEstadoPedidoCliente(estado) === 'listo_empaquetar';
  const idSeguro = escaparAtributoHtml(pedidoId);
  return `
    <button
      type="button"
      class="btn-notificar-despacho"
      data-order-id="${idSeguro}"
      title="Notificar despacho por email"
      aria-label="Notificar despacho del pedido ${idSeguro}"
      ${puedeNotificar ? '' : 'disabled'}
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/>
      </svg>
      <span class="btn-notificar-despacho__texto">Notificar</span>
    </button>
  `;
}

function crearBotonEtiquetaEnvio(pedidoId) {
  const idSeguro = escaparAtributoHtml(pedidoId);
  return `
    <button
      type="button"
      class="btn-etiqueta-envio"
      data-order-id="${idSeguro}"
      title="Imprimir etiqueta de envío"
      aria-label="Imprimir etiqueta de envío del pedido ${idSeguro}"
    >
      <span aria-hidden="true">🖨️</span>
      <span class="btn-etiqueta-envio__texto">Etiqueta</span>
    </button>
  `;
}

/**
 * Abre la etiqueta de envío en una pestaña nueva (HTML listo para Ctrl+P).
 * El JWT va en query porque window.open no puede enviar Authorization.
 */
function abrirEtiquetaEnvio(pedidoId) {
  if (!pedidoId) return;

  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (!token || !tokenJwtVigente(token)) {
    mostrarToast('Sesión de administrador requerida para imprimir la etiqueta.', 'error');
    return;
  }

  const url = `/api/admin/pedidos/${encodeURIComponent(pedidoId)}/etiqueta-envio?token=${encodeURIComponent(token)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function obtenerEtiquetaEstado(estado) {
  const normalizado = normalizarEstadoPedidoCliente(estado);
  return ETIQUETAS_ESTADO_PEDIDO[normalizado] || normalizado;
}

function normalizarEstadoPedidoCliente(estado) {
  const valor = String(estado || '').trim();
  if (ESTADOS_PEDIDO.includes(valor) || valor === 'cancelado') return valor;
  return ESTADOS_PEDIDO_LEGACY[valor] || 'pendiente_pago';
}

async function cargarSecciones() {
  try {
    secciones = await apiFetch('/api/secciones');
  } catch (error) {
    console.error('Error al cargar secciones:', error);
    secciones = seccionesEjemplo.map((seccion) => ({ ...seccion }));
  }

  actualizarVistaSecciones();
}

function actualizarVistaSecciones() {
  renderizarSeccionesAdmin();
  renderizarSelectCategorias();
  renderizarCarruselSecciones();
  renderizarProductos();
}

function contarProductosPorSeccion(nombreSeccion) {
  return productos.filter((producto) => producto.categoria === nombreSeccion).length;
}

function esSeccionCalzadoRaiz(seccion) {
  if (!seccion) return false;
  return Boolean(seccion.esFija) || (
    String(seccion.nombre || '').toLowerCase() === NOMBRE_SECCION_CALZADO.toLowerCase()
    && seccion.padreId == null
  );
}

function esSubtipoCalzado(seccion) {
  if (!seccion) return false;
  return seccion.grupo === 'calzado' && seccion.padreId != null && !seccion.esFija;
}

function obtenerSeccionCalzadoRaiz() {
  return secciones.find((seccion) => esSeccionCalzadoRaiz(seccion)) || null;
}

function obtenerSubtiposCalzado() {
  const raiz = obtenerSeccionCalzadoRaiz();
  if (!raiz) return [];
  return secciones
    .filter((seccion) => Number(seccion.padreId) === Number(raiz.id))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}

function obtenerSeccionesGenerales() {
  return secciones
    .filter((seccion) => !esSeccionCalzadoRaiz(seccion) && !esSubtipoCalzado(seccion))
    .sort((a, b) => Number(a.id) - Number(b.id));
}

/** Secciones a las que se puede asignar un producto (excluye la raíz fija Calzado). */
function obtenerSeccionesAsignables() {
  return [
    ...obtenerSeccionesGenerales(),
    ...obtenerSubtiposCalzado(),
  ];
}

function obtenerNombresCategoriasCalzado() {
  const raiz = obtenerSeccionCalzadoRaiz();
  const nombres = obtenerSubtiposCalzado().map((s) => s.nombre);
  if (raiz) nombres.push(raiz.nombre);
  return nombres;
}

function productoEsCalzadoPorSeccion(producto) {
  const categoria = String(producto?.categoria || '').trim();
  if (!categoria) return false;
  return obtenerNombresCategoriasCalzado().some(
    (nombre) => nombre.toLowerCase() === categoria.toLowerCase()
  );
}

function seccionEsCalzadoPorNombre(nombre) {
  const valor = String(nombre || '').trim().toLowerCase();
  if (!valor) return false;
  return obtenerNombresCategoriasCalzado().some((n) => n.toLowerCase() === valor);
}

function contarProductosCalzadoGrupo() {
  const nombres = new Set(obtenerNombresCategoriasCalzado().map((n) => n.toLowerCase()));
  return productos.filter((p) => nombres.has(String(p.categoria || '').toLowerCase())).length;
}

function renderizarSelectCategorias() {
  const select = document.getElementById('producto-categoria');
  if (!select) return;

  const valorActual = select.value;
  const generales = obtenerSeccionesGenerales();
  const subtipos = obtenerSubtiposCalzado();

  const opcionesGenerales = generales
    .map((seccion) => `<option value="${escaparAtributoHtml(seccion.nombre)}">${escaparHtmlTexto(seccion.nombre)}</option>`)
    .join('');

  const opcionesCalzado = subtipos.length
    ? `<optgroup label="Calzado">${subtipos
      .map((seccion) => `<option value="${escaparAtributoHtml(seccion.nombre)}">${escaparHtmlTexto(seccion.nombre)}</option>`)
      .join('')}</optgroup>`
    : '';

  select.innerHTML = `
    <option value="" disabled ${valorActual ? '' : 'selected'}>Seleccioná una sección</option>
    ${opcionesGenerales}
    ${opcionesCalzado}
  `;

  if (valorActual && obtenerSeccionesAsignables().some((seccion) => seccion.nombre === valorActual)) {
    select.value = valorActual;
  }

  renderizarSelectCategoriasPreciosMasivo();
}

function renderizarSelectCategoriasPreciosMasivo() {
  const select = document.getElementById('precios-masivo-categoria');
  if (!select) return;

  const valorActual = select.value;
  const asignables = obtenerSeccionesAsignables();
  const opciones = asignables
    .map((seccion) => `<option value="${escaparAtributoHtml(seccion.nombre)}">${escaparHtmlTexto(seccion.nombre)}</option>`)
    .join('');

  select.innerHTML = `<option value="">Todas las categorías</option>${opciones}`;

  if (valorActual && (valorActual === '' || asignables.some((seccion) => seccion.nombre === valorActual))) {
    select.value = valorActual;
  }
}

function crearHtmlFilaSeccionAdmin(seccion, opciones = {}) {
  const { anidada = false } = opciones;
  const total = contarProductosPorSeccion(seccion.nombre);
  const textoProductos = total === 1 ? '1 producto' : `${total} productos`;
  const fija = esSeccionCalzadoRaiz(seccion);
  const clases = [
    'seccion-fila',
    anidada ? 'seccion-fila--hija' : '',
    fija ? 'seccion-fila--fija' : '',
  ].filter(Boolean).join(' ');

  const badgeFija = fija
    ? '<span class="seccion-badge-fija" title="Sección fija del sistema">Fija</span>'
    : '';

  const btnEliminar = fija
    ? ''
    : `
      <button
        type="button"
        class="btn-eliminar-seccion"
        data-id="${seccion.id}"
        title="Eliminar sección"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        Eliminar
      </button>
    `;

  return `
    <div class="${clases}" data-id="${seccion.id}" role="button" tabindex="0" aria-label="Gestionar sección ${escaparAtributoHtml(seccion.nombre)}">
      <div class="seccion-info">
        ${
          obtenerEscudoSeccion(seccion) && esUrlEscudoValida(obtenerEscudoSeccion(seccion))
            ? `<img class="seccion-icono seccion-icono--img" src="${escaparAtributoHtml(optimizarUrlEscudo(obtenerEscudoSeccion(seccion)))}" alt="" width="28" height="28" loading="lazy">`
            : `<span class="seccion-icono">${fija ? '👟' : anidada ? '↳' : '📁'}</span>`
        }
        <strong class="seccion-nombre">${escaparHtmlTexto(seccion.nombre)}</strong>
        ${badgeFija}
        <span class="seccion-badge-contador">${textoProductos}</span>
      </div>
      ${btnEliminar}
    </div>
  `;
}

function renderizarSeccionesAdmin() {
  const lista = document.getElementById('lista-secciones-admin');
  const emptyEl = document.getElementById('admin-sections-empty');
  if (!lista) return;

  const vacio = secciones.length === 0;
  lista.innerHTML = '';
  emptyEl?.classList.toggle('hidden', !vacio);

  if (vacio) return;

  const generales = obtenerSeccionesGenerales();
  const calzadoRaiz = obtenerSeccionCalzadoRaiz();
  const subtipos = obtenerSubtiposCalzado();
  const totalCalzado = contarProductosCalzadoGrupo();

  const htmlGenerales = generales.map((s) => crearHtmlFilaSeccionAdmin(s)).join('');

  let htmlCalzado = '';
  if (calzadoRaiz) {
    const totalTexto = totalCalzado === 1 ? '1 producto' : `${totalCalzado} productos`;
    const hijas = subtipos.map((s) => crearHtmlFilaSeccionAdmin(s, { anidada: true })).join('');

    htmlCalzado = `
      <div class="seccion-grupo seccion-grupo--calzado" data-id="${calzadoRaiz.id}">
        <div class="seccion-fila seccion-fila--fija seccion-fila--grupo" data-id="${calzadoRaiz.id}" role="button" tabindex="0" aria-label="Gestionar sección Calzado">
          <div class="seccion-info">
            ${
              obtenerEscudoSeccion(calzadoRaiz) && esUrlEscudoValida(obtenerEscudoSeccion(calzadoRaiz))
                ? `<img class="seccion-icono seccion-icono--img" src="${escaparAtributoHtml(optimizarUrlEscudo(obtenerEscudoSeccion(calzadoRaiz)))}" alt="" width="28" height="28" loading="lazy">`
                : '<span class="seccion-icono">👟</span>'
            }
            <strong class="seccion-nombre">Calzado</strong>
            <span class="seccion-badge-fija" title="Sección fija del sistema">Fija</span>
            <span class="seccion-badge-contador">${totalTexto}</span>
          </div>
          <button
            type="button"
            class="btn-agregar-subtipo-calzado"
            data-padre-id="${calzadoRaiz.id}"
            title="Agregar tipo de calzado"
          >
            + Tipo
          </button>
        </div>
        <div class="seccion-grupo__hijas">
          ${hijas || '<p class="seccion-grupo__vacio">Todavía no hay tipos de calzado. Usá «+ Tipo» para crear Zapatillas, Botines, etc.</p>'}
        </div>
      </div>
    `;
  }

  lista.innerHTML = htmlGenerales + htmlCalzado;
}

function limpiarPreviewEscudoSeccion() {
  archivoEscudoPendiente = null;
  if (previewEscudoPendiente) {
    URL.revokeObjectURL(previewEscudoPendiente);
    previewEscudoPendiente = null;
  }

  const input = document.getElementById('modal-seccion-escudo');
  const preview = document.getElementById('modal-seccion-escudo-preview');
  const img = document.getElementById('modal-seccion-escudo-img');

  if (input) input.value = '';
  if (img) img.removeAttribute('src');
  preview?.classList.add('hidden');
}

function manejarSeleccionEscudoSeccion(event) {
  const archivo = event.target.files?.[0];
  if (!archivo) {
    limpiarPreviewEscudoSeccion();
    return;
  }

  archivoEscudoPendiente = archivo;
  if (previewEscudoPendiente) URL.revokeObjectURL(previewEscudoPendiente);
  previewEscudoPendiente = URL.createObjectURL(archivo);

  const preview = document.getElementById('modal-seccion-escudo-preview');
  const img = document.getElementById('modal-seccion-escudo-img');
  if (img) img.src = previewEscudoPendiente;
  preview?.classList.remove('hidden');
}

function obtenerMostrarEnCarruselDesdeCheckbox(checkbox) {
  return Boolean(checkbox?.checked);
}

function sincronizarCheckboxMostrarEnCarrusel(checkbox, seccion) {
  if (!checkbox) return;
  // Default true si el campo no existe (secciones antiguas).
  checkbox.checked = seccion?.mostrarEnCarrusel !== false;
}

function abrirModalCrearSeccion(opciones = {}) {
  const modal = document.getElementById('modal-crear-seccion');
  if (!modal) return;

  const { padreId = null } = opciones;
  document.getElementById('modal-crear-seccion-form')?.reset();
  limpiarPreviewEscudoSeccion();

  const padreInput = document.getElementById('modal-seccion-padre-id');
  const contextoWrap = document.getElementById('modal-seccion-contexto-wrap');
  const titulo = document.getElementById('modal-crear-seccion-titulo');
  const label = document.getElementById('modal-seccion-nombre-label');
  const nombreInput = document.getElementById('modal-seccion-nombre');
  const submitBtn = document.getElementById('modal-crear-seccion-submit');
  const mostrarCarruselInput = document.getElementById('modal-seccion-mostrar-carrusel');
  const esSubtipo = padreId != null && Number.isFinite(Number(padreId));

  if (padreInput) padreInput.value = esSubtipo ? String(padreId) : '';
  if (contextoWrap) contextoWrap.hidden = !esSubtipo;
  if (mostrarCarruselInput) mostrarCarruselInput.checked = true;

  if (esSubtipo) {
    if (titulo) titulo.textContent = 'Nuevo tipo de calzado';
    if (label) label.textContent = 'Nombre del tipo';
    if (nombreInput) nombreInput.placeholder = 'Ej: Zapatillas, Botines, Chimpunes...';
    if (submitBtn) submitBtn.textContent = 'Crear tipo';
  } else {
    if (titulo) titulo.textContent = 'Nueva Sección';
    if (label) label.textContent = 'Nombre de la sección';
    if (nombreInput) nombreInput.placeholder = 'Ej: Boca Juniors, River Plate...';
    if (submitBtn) submitBtn.textContent = 'Crear Sección';
  }

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  nombreInput?.focus();
}

function cerrarModalCrearSeccion() {
  const modal = document.getElementById('modal-crear-seccion');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  document.getElementById('modal-crear-seccion-form')?.reset();
  const padreInput = document.getElementById('modal-seccion-padre-id');
  if (padreInput) padreInput.value = '';
  const contextoWrap = document.getElementById('modal-seccion-contexto-wrap');
  if (contextoWrap) contextoWrap.hidden = true;
  limpiarPreviewEscudoSeccion();
}

async function crearSeccionDesdeModal(event) {
  event.preventDefault();

  const input = document.getElementById('modal-seccion-nombre');
  const nombre = input?.value.trim();
  if (!nombre) return;

  const padreRaw = document.getElementById('modal-seccion-padre-id')?.value;
  const padreId = padreRaw !== '' && Number.isFinite(Number(padreRaw))
    ? Number(padreRaw)
    : null;

  const submitBtn = document.querySelector('#modal-crear-seccion-form .seccion-modal-form__submit');
  submitBtn?.setAttribute('disabled', 'true');

  try {
    let escudoUrl = '';
    if (archivoEscudoPendiente) {
      escudoUrl = await subirImagenACloudinary(archivoEscudoPendiente);
    }

    const mostrarEnCarrusel = obtenerMostrarEnCarruselDesdeCheckbox(
      document.getElementById('modal-seccion-mostrar-carrusel')
    );

    const payload = { nombre, escudo: escudoUrl, mostrarEnCarrusel };
    if (padreId != null) payload.padreId = padreId;

    await apiFetch('/api/secciones', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    await cargarSecciones();
    renderizarFiltrosCategorias(productos);
    cerrarModalCrearSeccion();
    mostrarToast(padreId != null
      ? 'Tipo de calzado creado correctamente.'
      : 'Sección creada correctamente.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo crear la sección.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
}

function obtenerSeccionActiva() {
  return secciones.find((seccion) => seccion.id === Number(seccionActivaId)) || null;
}

function obtenerProductosDeSeccion(nombreSeccion) {
  const seccion = secciones.find((s) => s.nombre === nombreSeccion);
  if (seccion && esSeccionCalzadoRaiz(seccion)) {
    const nombres = new Set(obtenerNombresCategoriasCalzado().map((n) => n.toLowerCase()));
    return productos.filter((producto) =>
      nombres.has(String(producto.categoria || '').toLowerCase())
    );
  }
  return productos.filter((producto) => producto.categoria === nombreSeccion);
}

function formatearPrecioAdminProducto(producto) {
  if (tieneOfertaValida(producto)) {
    return `
      <span class="precio-tachado">${formatearPrecio(producto.precio)}</span>
      <span class="seccion-modal-tabla__precio-oferta">${formatearPrecio(producto.precioOferta)}</span>
    `;
  }
  return formatearPrecio(producto.precio);
}

function sincronizarVistaTiendaTrasCambioCatalogo() {
  renderizarFiltrosCategorias(productos);
  renderizarProductos();
  renderizarStadiumCarousel();
}

/**
 * Tras un 200 del API admin: re-pide el catálogo completo y refresca UI
 * para evitar caché local desactualizada (sin hard refresh).
 */
async function refrescarCatalogoTrasCambioAdmin() {
  const ok = await cargarProductos({ todos: true });
  if (!ok) return false;

  actualizarContadorProductosAdmin();
  actualizarVistaCatalogoAdmin();
  renderizarSeccionesAdmin();
  renderizarGestionPortada();
  sincronizarVistaTiendaTrasCambioCatalogo();
  return true;
}

function crearFilaProductoAdminHtml(producto) {
  const stockValor = Number(producto.stock ?? 0);
  const estaActivo = producto.activo !== false;

  return `
    <tr>
      <td>
        <img
          class="admin-table__thumb"
          src="${obtenerImagenPrincipal(producto)}"
          alt="${producto.nombre}"
          width="48"
          height="64"
          loading="lazy"
        >
      </td>
      <td class="seccion-modal-tabla__nombre">
        <span class="seccion-modal-tabla__nombre-texto" title="${producto.nombre}">${producto.nombre}</span>
      </td>
      <td class="admin-table__total seccion-modal-tabla__precio">${formatearPrecioAdminProducto(producto)}</td>
      <td class="seccion-modal-tabla__stock">${renderizarCeldaStockAdmin(stockValor)}</td>
      <td class="seccion-modal-tabla__activo">
        <label class="admin-toggle" title="${estaActivo ? 'Producto visible en tienda' : 'Producto oculto en tienda'}">
          <input
            type="checkbox"
            class="admin-toggle__input admin-toggle-producto"
            data-product-id="${producto.id}"
            ${estaActivo ? 'checked' : ''}
            aria-label="${estaActivo ? 'Desactivar' : 'Activar'} ${producto.nombre}"
          >
          <span class="admin-toggle__track" aria-hidden="true"></span>
        </label>
      </td>
      <td class="admin-table__actions seccion-modal-tabla__acciones">
        <button
          type="button"
          class="btn-editar"
          data-product-id="${producto.id}"
          aria-label="Editar ${producto.nombre}"
          title="Editar"
        >
          ✏️
        </button>
        <button
          type="button"
          class="btn-eliminar"
          data-product-id="${producto.id}"
          aria-label="Eliminar ${producto.nombre}"
          title="Eliminar"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
          </svg>
        </button>
      </td>
    </tr>
  `;
}

function refrescarProductosSeccionActiva() {
  const seccion = obtenerSeccionActiva();
  if (seccion && document.getElementById('modal-detalle-seccion')?.classList.contains('is-open')) {
    renderizarProductosEnSeccion(seccion);
  }
}

function actualizarVistaCatalogoAdmin() {
  actualizarContadorProductosAdmin();
  renderizarSeccionesAdmin();
  refrescarProductosSeccionActiva();
}

function renderizarProductosEnSeccion(seccion) {
  const lista = document.getElementById('lista-productos-seccion-modal');
  if (!lista || !seccion) return;

  const productosSeccion = obtenerProductosDeSeccion(seccion.nombre);

  if (!productosSeccion.length) {
    const mensaje = esSeccionCalzadoRaiz(seccion)
      ? 'No hay productos de calzado todavía. Creá un tipo con «+ Tipo» y agregá productos ahí.'
      : 'No hay productos en esta sección todavía.';
    lista.innerHTML = `<p class="seccion-modal-vacio">${mensaje}</p>`;
    return;
  }

  lista.innerHTML = `
    <div class="seccion-modal-tabla-wrap">
      <table class="admin-table seccion-modal-tabla">
        <colgroup>
          <col class="seccion-modal-tabla__col-img">
          <col class="seccion-modal-tabla__col-nombre">
          <col class="seccion-modal-tabla__col-precio">
          <col class="seccion-modal-tabla__col-stock">
          <col class="seccion-modal-tabla__col-activo">
          <col class="seccion-modal-tabla__col-acciones">
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Imagen</th>
            <th scope="col">Nombre</th>
            <th scope="col">Precio</th>
            <th scope="col">Stock</th>
            <th scope="col">Activo</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${productosSeccion.map((producto) => crearFilaProductoAdminHtml(producto)).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function sincronizarNombreSeccionEnModal(seccion) {
  const input = document.getElementById('seccion-nombre-input');
  const btnGuardar = document.getElementById('btn-guardar-nombre-seccion');
  if (!input || !seccion) return;

  input.value = seccion.nombre;
  const fija = esSeccionCalzadoRaiz(seccion);
  input.readOnly = fija;
  input.classList.toggle('is-readonly', fija);
  if (fija) {
    btnGuardar?.setAttribute('disabled', 'true');
    btnGuardar?.setAttribute('hidden', 'true');
  } else {
    btnGuardar?.removeAttribute('disabled');
    btnGuardar?.removeAttribute('hidden');
  }
}

function sincronizarMostrarEnCarruselEnModal(seccion) {
  sincronizarCheckboxMostrarEnCarrusel(
    document.getElementById('seccion-mostrar-carrusel'),
    seccion
  );
}

async function guardarMostrarEnCarruselSeccion() {
  const seccion = obtenerSeccionActiva();
  const checkbox = document.getElementById('seccion-mostrar-carrusel');
  if (!seccion || !checkbox) return;

  const mostrarEnCarrusel = obtenerMostrarEnCarruselDesdeCheckbox(checkbox);
  const valorAnterior = seccion.mostrarEnCarrusel !== false;

  if (mostrarEnCarrusel === valorAnterior) return;

  checkbox.disabled = true;

  try {
    const actualizada = await apiFetch(`/api/secciones/${seccion.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: seccion.nombre,
        mostrarEnCarrusel,
      }),
    });

    const indice = secciones.findIndex((item) => item.id === seccion.id);
    if (indice !== -1) secciones[indice] = actualizada;

    sincronizarMostrarEnCarruselEnModal(actualizada);
    renderizarStadiumCarousel();
    mostrarToast(
      mostrarEnCarrusel
        ? 'La sección se mostrará en el carrusel de la Home.'
        : 'La sección se ocultó del carrusel de la Home.'
    );
  } catch (error) {
    checkbox.checked = valorAnterior;
    mostrarToast(error?.message || 'No se pudo actualizar la visibilidad en el carrusel.', 'error');
  } finally {
    checkbox.disabled = false;
  }
}

function limpiarEscudoDetallePendiente(opciones = {}) {
  const { conservarVista = false } = opciones;
  archivoEscudoDetallePendiente = null;

  if (previewEscudoDetallePendiente) {
    URL.revokeObjectURL(previewEscudoDetallePendiente);
    previewEscudoDetallePendiente = null;
  }

  const input = document.getElementById('seccion-escudo-input');
  const btnGuardar = document.getElementById('btn-guardar-escudo-seccion');
  const img = document.getElementById('seccion-escudo-img');
  const placeholder = document.getElementById('seccion-escudo-placeholder');

  if (input) input.value = '';
  btnGuardar?.setAttribute('disabled', 'true');

  if (!conservarVista && img && img.getAttribute('src')?.startsWith('blob:')) {
    mostrarPlaceholderEscudo(img, placeholder, obtenerSeccionActiva());
  }
}

function sincronizarEscudoSeccionEnModal(seccion) {
  const img = document.getElementById('seccion-escudo-img');
  const placeholder = document.getElementById('seccion-escudo-placeholder');
  if (!img || !placeholder || !seccion) return;

  const escudo = obtenerEscudoSeccion(seccion);
  limpiarEscudoDetallePendiente({ conservarVista: true });

  if (esUrlEscudoValida(escudo) && mostrarImagenEscudo(img, placeholder, escudo)) {
    return;
  }

  mostrarPlaceholderEscudo(img, placeholder, seccion);
}

function manejarSeleccionEscudoDetalle(event) {
  const archivo = event.target.files?.[0];
  const btnGuardar = document.getElementById('btn-guardar-escudo-seccion');
  const img = document.getElementById('seccion-escudo-img');
  const placeholder = document.getElementById('seccion-escudo-placeholder');

  if (!archivo) {
    const seccion = obtenerSeccionActiva();
    if (seccion) sincronizarEscudoSeccionEnModal(seccion);
    return;
  }

  archivoEscudoDetallePendiente = archivo;
  if (previewEscudoDetallePendiente) URL.revokeObjectURL(previewEscudoDetallePendiente);
  previewEscudoDetallePendiente = URL.createObjectURL(archivo);

  if (img) {
    img.onerror = null;
    img.src = previewEscudoDetallePendiente;
    img.classList.remove('hidden');
  }
  placeholder?.classList.add('hidden');
  btnGuardar?.removeAttribute('disabled');
}

async function guardarEscudoSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion || !archivoEscudoDetallePendiente) return;

  const btnGuardar = document.getElementById('btn-guardar-escudo-seccion');
  btnGuardar?.setAttribute('disabled', 'true');

  try {
    const escudoUrl = await subirImagenACloudinary(archivoEscudoDetallePendiente);
    const actualizada = await apiFetch(`/api/secciones/${seccion.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: seccion.nombre,
        escudo: escudoUrl,
        mostrarEnCarrusel: obtenerMostrarEnCarruselDesdeCheckbox(
          document.getElementById('seccion-mostrar-carrusel')
        ),
      }),
    });

    await cargarSecciones();
    const seccionActualizada = secciones.find((item) => item.id === seccion.id) || actualizada;
    sincronizarEscudoSeccionEnModal(seccionActualizada);
    mostrarToast('Logo actualizado en el carrusel.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo guardar el logo.', 'error');
    btnGuardar?.removeAttribute('disabled');
  }
}

function abrirModalDetalleSeccion(id) {
  const seccion = secciones.find((item) => item.id === Number(id));
  if (!seccion) return;

  seccionActivaId = seccion.id;

  const modal = document.getElementById('modal-detalle-seccion');
  if (!modal) return;

  sincronizarNombreSeccionEnModal(seccion);
  sincronizarEscudoSeccionEnModal(seccion);
  sincronizarMostrarEnCarruselEnModal(seccion);
  renderizarProductosEnSeccion(seccion);

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function ocultarModalDetalleSeccionTemporalmente() {
  const modal = document.getElementById('modal-detalle-seccion');
  if (!modal?.classList.contains('is-open')) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  modalDetalleSeccionSuspendido = true;
}

function restaurarModalDetalleSeccionSiCorresponde() {
  if (!modalDetalleSeccionSuspendido || !seccionActivaId) return;

  const seccion = obtenerSeccionActiva();
  const modal = document.getElementById('modal-detalle-seccion');
  if (!seccion || !modal) return;

  sincronizarNombreSeccionEnModal(seccion);
  sincronizarEscudoSeccionEnModal(seccion);
  sincronizarMostrarEnCarruselEnModal(seccion);
  renderizarProductosEnSeccion(seccion);

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  modalDetalleSeccionSuspendido = false;
}

function cerrarModalDetalleSeccion() {
  const modal = document.getElementById('modal-detalle-seccion');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  modalDetalleSeccionSuspendido = false;
  seccionActivaId = null;
  limpiarEscudoDetallePendiente();
}

function sincronizarCategoriaTipoConSeccion(nombreSeccion) {
  const selectTipo = document.getElementById('producto-categoria-tipo');
  if (!selectTipo) return;

  if (seccionEsCalzadoPorNombre(nombreSeccion)) {
    if (selectTipo.value !== 'calzado') {
      selectTipo.value = 'calzado';
      alCambiarCategoriaTipoProducto();
    }
    return;
  }

  if (selectTipo.value !== 'ropa') {
    selectTipo.value = 'ropa';
    alCambiarCategoriaTipoProducto();
  }
}

function abrirAgregarProductoDesdeSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  if (esSeccionCalzadoRaiz(seccion)) {
    const subtipos = obtenerSubtiposCalzado();
    if (!subtipos.length) {
      mostrarToast('Creá primero un tipo de calzado con «+ Tipo» (Zapatillas, Botines, etc.).', 'error');
      return;
    }
    ocultarModalDetalleSeccionTemporalmente();
    abrirModalProducto(subtipos[0].nombre);
    return;
  }

  ocultarModalDetalleSeccionTemporalmente();
  abrirModalProducto(seccion.nombre);
}

function obtenerProductosDisponiblesParaSeccion(nombreSeccion, busqueda = '') {
  const termino = busqueda.trim().toLowerCase();

  return productos.filter((producto) => {
    if (producto.categoria === nombreSeccion) return false;
    if (!termino) return true;
    return producto.nombre.toLowerCase().includes(termino);
  });
}

function renderizarProductosDisponiblesParaSeccion(busqueda = '') {
  const lista = document.getElementById('lista-productos-disponibles');
  const seccion = obtenerSeccionActiva();
  if (!lista || !seccion) return;

  const disponibles = obtenerProductosDisponiblesParaSeccion(seccion.nombre, busqueda);

  if (!productos.length) {
    lista.innerHTML = '<p class="producto-existente-modal__vacio">Todavía no hay productos en el catálogo.</p>';
    return;
  }

  if (!disponibles.length) {
    lista.innerHTML = busqueda.trim()
      ? '<p class="producto-existente-modal__vacio">No encontramos productos con ese nombre.</p>'
      : '<p class="producto-existente-modal__vacio">Todos los productos ya están en esta sección.</p>';
    return;
  }

  lista.innerHTML = disponibles
    .map(
      (producto) => `
        <article class="producto-existente-item">
          <img
            class="producto-existente-item__thumb"
            src="${obtenerImagenPrincipal(producto)}"
            alt="${producto.nombre}"
            width="48"
            height="64"
            loading="lazy"
          >
          <div class="producto-existente-item__info">
            <h3 class="producto-existente-item__nombre">${producto.nombre}</h3>
            <p class="producto-existente-item__categoria">Sección actual: ${producto.categoria || 'Sin sección'}</p>
          </div>
          <button
            type="button"
            class="producto-existente-item__btn"
            data-product-id="${producto.id}"
          >
            Agregar
          </button>
        </article>
      `
    )
    .join('');
}

function abrirModalAgregarProductoExistente() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  const modal = document.getElementById('modal-agregar-producto-existente');
  const titulo = document.getElementById('modal-agregar-producto-existente-titulo');
  const busqueda = document.getElementById('buscar-producto-existente');
  if (!modal) return;

  if (titulo) titulo.textContent = `Agregar a «${seccion.nombre}»`;
  if (busqueda) busqueda.value = '';

  renderizarProductosDisponiblesParaSeccion();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  busqueda?.focus();
}

function cerrarModalAgregarProductoExistente() {
  const modal = document.getElementById('modal-agregar-producto-existente');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('buscar-producto-existente')?.blur();

  const detalleSeccion = document.getElementById('modal-detalle-seccion');
  if (!detalleSeccion?.classList.contains('is-open')) {
    document.body.classList.remove('modal-open');
  }
}

async function asignarProductoASeccion(productoId) {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  const producto = productos.find((item) => item.id === Number(productoId));
  if (!producto) return;

  if (producto.categoria === seccion.nombre) {
    mostrarToast('Este producto ya está en esta sección.', 'error');
    return;
  }

  const seccionAnterior = producto.categoria;

  try {
    const payload = {
      nombre: producto.nombre,
      precio: producto.precio,
      precioOferta: tieneOfertaValida(producto) ? producto.precioOferta : null,
      enOferta: Boolean(producto.enOferta || producto.en_oferta) && tieneOfertaValida(producto),
      categoria: seccion.nombre,
      genero: producto.genero || 'hombre',
      stock: producto.stock ?? 0,
      stockTalles: producto.stockTalles,
      descripcion: producto.descripcion || '',
      imagenFrente: obtenerImagenFrente(producto),
      imagenEspalda: obtenerImagenEspalda(producto),
      talles: producto.talles,
    };

    const actualizado = await apiFetch(`/api/productos/${producto.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const indice = productos.findIndex((item) => item.id === producto.id);
    if (indice !== -1) productos[indice] = actualizado;

    renderizarProductosEnSeccion(seccion);
    renderizarProductosDisponiblesParaSeccion(
      document.getElementById('buscar-producto-existente')?.value ?? ''
    );
    actualizarVistaSecciones();
    actualizarVistaCatalogoAdmin();
    renderizarFiltrosCategorias(productos);
    renderizarProductos();
    renderizarStadiumCarousel();

    const mensaje = seccionAnterior
      ? `«${producto.nombre}» movido de «${seccionAnterior}» a «${seccion.nombre}».`
      : `«${producto.nombre}» agregado a «${seccion.nombre}».`;
    mostrarToast(mensaje);
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo asignar el producto a la sección.', 'error');
  }
}

async function eliminarSeccion(id) {
  const seccion = secciones.find((item) => item.id === Number(id));
  if (!seccion) return;

  if (esSeccionCalzadoRaiz(seccion)) {
    mostrarToast('La sección «Calzado» es fija y no se puede eliminar.', 'error');
    return;
  }

  const totalProductos = contarProductosPorSeccion(seccion.nombre);
  if (totalProductos > 0) {
    mostrarToast(
      `No podés eliminar «${seccion.nombre}» porque tiene ${totalProductos} producto${totalProductos !== 1 ? 's' : ''}. Eliminá o reasigná esos productos primero.`,
      'error'
    );
    return;
  }

  const etiqueta = esSubtipoCalzado(seccion) ? 'tipo de calzado' : 'sección';
  const confirmar = window.confirm(`¿Eliminar el ${etiqueta} «${seccion.nombre}»?`);
  if (!confirmar) return;

  try {
    await apiFetch(`/api/secciones/${seccion.id}`, { method: 'DELETE' });
    secciones = secciones.filter((item) => item.id !== seccion.id);
    actualizarVistaSecciones();
    mostrarToast(etiqueta === 'tipo de calzado' ? 'Tipo de calzado eliminado.' : 'Sección eliminada.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo eliminar la sección.', 'error');
  }
}

async function guardarNombreSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  if (esSeccionCalzadoRaiz(seccion)) {
    mostrarToast('La sección «Calzado» es fija y no se puede renombrar.', 'error');
    const inputFijo = document.getElementById('seccion-nombre-input');
    if (inputFijo) inputFijo.value = NOMBRE_SECCION_CALZADO;
    return;
  }

  const input = document.getElementById('seccion-nombre-input');
  const nuevoNombre = input?.value.trim() ?? '';

  if (!nuevoNombre) {
    mostrarToast('El nombre de la sección no puede estar vacío.', 'error');
    return;
  }

  if (nuevoNombre.toLowerCase() === seccion.nombre.toLowerCase() && nuevoNombre === seccion.nombre) {
    mostrarToast('No hay cambios en el nombre de la sección.');
    return;
  }

  const nombreAnterior = seccion.nombre;

  try {
    const actualizada = await apiFetch(`/api/secciones/${seccion.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: nuevoNombre,
        mostrarEnCarrusel: obtenerMostrarEnCarruselDesdeCheckbox(
          document.getElementById('seccion-mostrar-carrusel')
        ),
      }),
    });

    const indice = secciones.findIndex((item) => item.id === seccion.id);
    if (indice !== -1) secciones[indice] = actualizada;

    if (categoriaFiltroActiva === nombreAnterior) {
      categoriaFiltroActiva = actualizada.nombre;
    }

    productos.forEach((producto) => {
      if (producto.categoria === nombreAnterior) {
        producto.categoria = actualizada.nombre;
      }
    });

    sincronizarNombreSeccionEnModal(actualizada);
    sincronizarEscudoSeccionEnModal(actualizada);
    sincronizarMostrarEnCarruselEnModal(actualizada);
    renderizarProductosEnSeccion(actualizada);
    actualizarVistaSecciones();
    renderizarSelectCategorias();
    actualizarVistaCatalogoAdmin();
    renderizarFiltrosCategorias(productos);
    renderizarProductos();
    renderizarStadiumCarousel();
    mostrarToast(`Sección renombrada a «${actualizada.nombre}».`);
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo actualizar el nombre de la sección.', 'error');
  }
}

function editarProductoDesdeSeccion(id) {
  cerrarModalDetalleSeccion();
  abrirModalEditar(id);
}

async function eliminarProducto(id, opciones = {}) {
  const { desdeSeccion = false } = opciones;
  const producto = productos.find((item) => item.id === Number(id));
  const mensaje = producto
    ? `¿Eliminar «${producto.nombre}» del catálogo?`
    : '¿Estás seguro de eliminar este producto?';

  if (!confirm(mensaje)) return;

  try {
    await apiFetch(`/api/productos/${id}`, { method: 'DELETE' });

    carrito = carrito.filter((item) => item.id !== Number(id));
    guardarCarritoEnLocalStorage();
    actualizarCarritoUI();

    await refrescarCatalogoTrasCambioAdmin();

    if (desdeSeccion) {
      const seccion = obtenerSeccionActiva();
      if (seccion) renderizarProductosEnSeccion(seccion);
    }

    mostrarToast('Producto eliminado.');
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    mostrarToast('Error de conexión con el servidor', 'error');
  }
}

function productoTieneStock(producto) {
  return Number(producto.stock) > 0;
}

function obtenerCategoriaTipoProducto(producto = null) {
  const tipo = String(producto?.categoriaTipo || producto?.categoria_tipo || 'ropa')
    .trim()
    .toLowerCase();
  return tipo === 'calzado' ? 'calzado' : 'ropa';
}

function obtenerTallesDisponiblesPorTipo(categoriaTipo = 'ropa') {
  return categoriaTipo === 'calzado'
    ? [...TALLES_CALZADO_DISPONIBLES]
    : [...TALLES_ROPA_DISPONIBLES];
}

function obtenerCategoriaTipoDelFormulario() {
  const select = document.getElementById('producto-categoria-tipo');
  const valor = String(select?.value || 'ropa').trim().toLowerCase();
  return valor === 'calzado' ? 'calzado' : 'ropa';
}

function normalizarClaveTalleFront(talle) {
  return String(talle ?? '').trim().toUpperCase().replace(/__DOT__/g, '.');
}

function compararTallesFront(a, b) {
  const na = Number(a);
  const nb = Number(b);
  const aNum = Number.isFinite(na) && String(a).trim() !== '';
  const bNum = Number.isFinite(nb) && String(b).trim() !== '';
  if (aNum && bNum) return na - nb;
  if (aNum) return 1;
  if (bNum) return -1;
  const orden = TALLES_ROPA_DISPONIBLES;
  const ia = orden.indexOf(a);
  const ib = orden.indexOf(b);
  if (ia !== -1 && ib !== -1) return ia - ib;
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

/** IDs HTML seguros: el punto de medios talles (p. ej. 40.5) se convierte a __DOT__. */
function escaparIdTalle(talle) {
  return encodeURIComponent(String(talle).replace(/\./g, '__DOT__')).replace(/%/g, '_');
}

function obtenerStockTallesProducto(producto) {
  const origen = producto?.stockTalles || {};
  const resultado = {};
  const categoriaTipo = obtenerCategoriaTipoProducto(producto);
  const tallesBase = obtenerTallesDisponiblesPorTipo(categoriaTipo);

  Object.keys(origen).forEach((clave) => {
    const talle = normalizarClaveTalleFront(clave);
    if (!talle) return;
    resultado[talle] = Math.max(0, Math.floor(Number(origen[clave]) || 0));
  });

  tallesBase.forEach((talle) => {
    if (resultado[talle] === undefined) resultado[talle] = 0;
  });

  const total = Object.values(resultado).reduce((acc, n) => acc + n, 0);
  if (total > 0) return resultado;

  const stockTotal = Math.max(0, Math.floor(Number(producto?.stock) || 0));
  const talles = Array.isArray(producto?.talles) && producto.talles.length
    ? producto.talles.map(normalizarClaveTalleFront).filter(Boolean)
    : [...tallesBase];

  if (talles.length === 1) {
    resultado[talles[0]] = stockTotal;
    return resultado;
  }

  if (talles.length > 1 && stockTotal > 0) {
    const porTalle = Math.floor(stockTotal / talles.length);
    let resto = stockTotal - porTalle * talles.length;
    talles.forEach((talle) => {
      resultado[talle] = porTalle + (resto > 0 ? 1 : 0);
      if (resto > 0) resto -= 1;
    });
  }

  return resultado;
}

function obtenerTallesProducto(producto) {
  if (!productoTieneStock(producto)) return [];

  const stockTalles = obtenerStockTallesProducto(producto);
  const conStock = Object.keys(stockTalles)
    .filter((talle) => stockTalles[talle] > 0)
    .sort(compararTallesFront);
  if (conStock.length) return conStock;

  if (Array.isArray(producto.talles) && producto.talles.length > 0) {
    return producto.talles.map(normalizarClaveTalleFront).filter(Boolean);
  }
  return [];
}

function crearHtmlFilaStockTalle(talle, categoriaTipo, stock = 0, medidas = {}) {
  const idSeguro = escaparIdTalle(talle);
  const stockVal = Math.max(0, Math.floor(Number(stock) || 0));

  if (categoriaTipo === 'calzado') {
    const plantilla = String(medidas.largoPlantilla ?? '').trim();
    return `
      <div class="product-form__stock-talle product-form__stock-talle--calzado" data-talle="${escaparAtributoHtml(talle)}">
        <span class="product-form__stock-talle-nombre">${escaparHtmlTexto(talle)}</span>
        <label class="product-form__stock-field">
          <span class="visually-hidden">Stock ${escaparHtmlTexto(talle)}</span>
          <input type="number" id="producto-stock-${idSeguro}" name="stock_${escaparAtributoHtml(talle)}" class="product-form__input product-form__stock-input" min="0" step="1" value="${stockVal}" data-talle="${escaparAtributoHtml(talle)}" aria-label="Stock talle ${escaparAtributoHtml(talle)}">
        </label>
        <label class="product-form__medida-field">
          <span>Largo de Plantilla (cm)</span>
          <input type="text" id="producto-medida-plantilla-${idSeguro}" name="medida_plantilla_${escaparAtributoHtml(talle)}" class="product-form__input product-form__medida-input" placeholder="26 cm" inputmode="decimal" autocomplete="off" data-talle="${escaparAtributoHtml(talle)}" data-medida="largoPlantilla" aria-label="Largo de plantilla talle ${escaparAtributoHtml(talle)}" value="${escaparAtributoHtml(plantilla)}">
        </label>
      </div>
    `;
  }

  const ancho = String(medidas.ancho ?? '').trim();
  const largo = String(medidas.largo ?? '').trim();
  return `
    <div class="product-form__stock-talle" data-talle="${escaparAtributoHtml(talle)}">
      <span class="product-form__stock-talle-nombre">${escaparHtmlTexto(talle)}</span>
      <label class="product-form__stock-field">
        <span class="visually-hidden">Stock ${escaparHtmlTexto(talle)}</span>
        <input type="number" id="producto-stock-${idSeguro}" name="stock_${escaparAtributoHtml(talle)}" class="product-form__input product-form__stock-input" min="0" step="1" value="${stockVal}" data-talle="${escaparAtributoHtml(talle)}" aria-label="Stock talle ${escaparAtributoHtml(talle)}">
      </label>
      <label class="product-form__medida-field">
        <span>Ancho (cm)</span>
        <input type="text" id="producto-medida-ancho-${idSeguro}" name="medida_ancho_${escaparAtributoHtml(talle)}" class="product-form__input product-form__medida-input" placeholder="52cm" inputmode="decimal" autocomplete="off" data-talle="${escaparAtributoHtml(talle)}" data-medida="ancho" aria-label="Ancho talle ${escaparAtributoHtml(talle)}" value="${escaparAtributoHtml(ancho)}">
      </label>
      <label class="product-form__medida-field">
        <span>Largo (cm)</span>
        <input type="text" id="producto-medida-largo-${idSeguro}" name="medida_largo_${escaparAtributoHtml(talle)}" class="product-form__input product-form__medida-input" placeholder="71cm" inputmode="decimal" autocomplete="off" data-talle="${escaparAtributoHtml(talle)}" data-medida="largo" aria-label="Largo talle ${escaparAtributoHtml(talle)}" value="${escaparAtributoHtml(largo)}">
      </label>
    </div>
  `;
}

function renderizarGrillaStockTallesFormulario(producto = null) {
  const contenedor = document.getElementById('producto-stock-talles');
  if (!contenedor) return;

  const categoriaTipo = producto
    ? obtenerCategoriaTipoProducto(producto)
    : obtenerCategoriaTipoDelFormulario();

  const selectTipo = document.getElementById('producto-categoria-tipo');
  if (selectTipo) selectTipo.value = categoriaTipo;

  contenedor.dataset.tipo = categoriaTipo;
  contenedor.classList.toggle('product-form__stock-talles--calzado', categoriaTipo === 'calzado');

  const talles = obtenerTallesDisponiblesPorTipo(categoriaTipo);
  const stockTalles = producto
    ? obtenerStockTallesProducto(producto)
    : Object.fromEntries(talles.map((t) => [t, categoriaTipo === 'ropa' ? 2 : 0]));

  const porTalle = new Map();
  if (Array.isArray(producto?.tablaMedidas)) {
    producto.tablaMedidas.forEach((fila) => {
      if (!fila || typeof fila !== 'object') return;
      const talle = normalizarClaveTalleFront(fila.talle);
      if (!talle) return;
      porTalle.set(talle, {
        ancho: String(fila.ancho ?? '').trim(),
        largo: String(fila.largo ?? '').trim(),
        largoPlantilla: String(fila.largoPlantilla ?? fila.largo_plantilla ?? '').trim(),
      });
    });
  }

  contenedor.innerHTML = talles
    .map((talle) => crearHtmlFilaStockTalle(
      talle,
      categoriaTipo,
      stockTalles[talle] ?? 0,
      porTalle.get(talle) || {}
    ))
    .join('');

  actualizarTotalStockFormulario();
}

function obtenerTallesActivosDelFormulario() {
  return [...document.querySelectorAll('#producto-stock-talles [data-talle]')]
    .map((el) => normalizarClaveTalleFront(el.getAttribute('data-talle')))
    .filter(Boolean);
}

function obtenerStockTallesDelFormulario() {
  const stockTalles = {};
  obtenerTallesActivosDelFormulario().forEach((talle) => {
    const input = document.getElementById(`producto-stock-${escaparIdTalle(talle)}`);
    stockTalles[talle] = Math.max(0, Math.floor(Number(input?.value) || 0));
  });
  return stockTalles;
}

function obtenerTallesDelFormulario() {
  const stockTalles = obtenerStockTallesDelFormulario();
  return Object.keys(stockTalles)
    .filter((talle) => stockTalles[talle] > 0)
    .sort(compararTallesFront);
}

function actualizarTotalStockFormulario() {
  const totalEl = document.getElementById('producto-stock-total');
  if (!totalEl) return;
  const stockTalles = obtenerStockTallesDelFormulario();
  const total = Object.values(stockTalles).reduce((acc, n) => acc + n, 0);
  totalEl.textContent = String(total);
}

function establecerStockTallesEnFormulario(producto = null) {
  renderizarGrillaStockTallesFormulario(producto);
}

function obtenerTablaMedidasDelFormulario() {
  const categoriaTipo = obtenerCategoriaTipoDelFormulario();

  return obtenerTallesActivosDelFormulario()
    .map((talle) => {
      const idSeguro = escaparIdTalle(talle);
      if (categoriaTipo === 'calzado') {
        const largoPlantilla = document.getElementById(`producto-medida-plantilla-${idSeguro}`)?.value.trim() ?? '';
        return { talle, ancho: '', largo: '', largoPlantilla };
      }
      const ancho = document.getElementById(`producto-medida-ancho-${idSeguro}`)?.value.trim() ?? '';
      const largo = document.getElementById(`producto-medida-largo-${idSeguro}`)?.value.trim() ?? '';
      return { talle, ancho, largo, largoPlantilla: '' };
    })
    .filter((fila) => {
      if (categoriaTipo === 'calzado') return fila.largoPlantilla !== '';
      return fila.ancho !== '' || fila.largo !== '';
    });
}

function establecerTablaMedidasEnFormulario(producto = null) {
  // La grilla ya se rellena en renderizarGrillaStockTallesFormulario.
  if (producto) renderizarGrillaStockTallesFormulario(producto);
}

function establecerTallesEnFormulario(talles = TALLES_ROPA_DISPONIBLES) {
  const tallesActivos = new Set(
    Array.isArray(talles) ? talles.map((talle) => normalizarClaveTalleFront(talle)) : []
  );

  document.querySelectorAll('input[name="producto-talle"]').forEach((input) => {
    input.checked = tallesActivos.has(input.value);
  });
}

function alCambiarCategoriaTipoProducto() {
  const tipo = obtenerCategoriaTipoDelFormulario();
  // Rebuild limpio: evita reenviar ancho/largo en calzado o largoPlantilla en ropa.
  // No reutiliza stock ni medidas del tipo anterior (estructuras de talle incompatibles).
  renderizarGrillaStockTallesFormulario({
    categoriaTipo: tipo,
    stockTalles: {},
    tablaMedidas: [],
    talles: obtenerTallesDisponiblesPorTipo(tipo),
    stock: 0,
  });
}

function restablecerFormularioProducto() {
  const descripcionInput = document.getElementById('producto-descripcion');
  const precioOfertaInput = document.getElementById('producto-precio-oferta');
  const enOfertaSwitch = document.getElementById('producto-en-oferta');
  const generoSelect = document.getElementById('producto-genero');
  const categoriaTipoSelect = document.getElementById('producto-categoria-tipo');
  const urlFrente = document.getElementById('producto-imagen-frente-url');
  const urlEspalda = document.getElementById('producto-imagen-espalda-url');

  if (descripcionInput) descripcionInput.value = '';
  if (precioOfertaInput) precioOfertaInput.value = '';
  if (enOfertaSwitch) enOfertaSwitch.checked = false;
  if (generoSelect) generoSelect.value = 'hombre';
  if (categoriaTipoSelect) categoriaTipoSelect.value = 'ropa';
  if (urlFrente) urlFrente.value = '';
  if (urlEspalda) urlEspalda.value = '';
  establecerStockTallesEnFormulario(null);
  actualizarControlesOfertaFormulario();
}

function formatearStockAdmin(stock) {
  const valor = Number(stock);
  if (!Number.isFinite(valor) || valor <= 0) return '0 u.';
  return `${valor} u.`;
}

function renderizarCeldaStockAdmin(stock) {
  const valor = Number(stock);
  if (!Number.isFinite(valor) || valor <= 0) {
    return '<span class="admin-stock-badge admin-stock-badge--out">Sin Stock</span>';
  }
  if (valor <= 3) {
    return `<span class="admin-stock-badge admin-stock-badge--low">Últimas unidades</span> <span class="admin-table__stock admin-table__stock--low">${valor} u.</span>`;
  }
  return `<span class="admin-table__stock">${valor} u.</span>`;
}

function productoCoincideBusqueda(producto, busqueda) {
  if (!busqueda) return true;

  const nombre = (producto.nombre || '').toLowerCase();
  const descripcion = (producto.descripcion || '').toLowerCase();
  const tags = Array.isArray(producto.tags)
    ? producto.tags.join(' ').toLowerCase()
    : String(producto.tags || '').toLowerCase();

  return (
    nombre.includes(busqueda) ||
    descripcion.includes(busqueda) ||
    tags.includes(busqueda)
  );
}

function filtrarProductos(lista) {
  return lista.filter((producto) => {
    // La tienda nunca muestra inactivos, aunque el admin tenga ?todos=true en memoria.
    if (producto.activo === false) return false;

    let coincideCategoria = categoriaFiltroActiva === 'todos'
      || producto.categoria === categoriaFiltroActiva;

    // Filtrar por la sección fija Calzado incluye todos sus subtipos.
    if (!coincideCategoria && categoriaFiltroActiva === NOMBRE_SECCION_CALZADO) {
      coincideCategoria = productoEsCalzadoPorSeccion(producto);
    }

    const ligaProducto = String(producto.liga || '').trim().toLowerCase();
    const coincideLiga =
      !ligaFiltroActiva || ligaProducto === ligaFiltroActiva.trim().toLowerCase();
    const coincideBusqueda = productoCoincideBusqueda(producto, busquedaActiva);
    const generoProducto = producto.genero || 'hombre';
    const coincideGenero =
      generoFiltroActivo === 'todos' || generoProducto === generoFiltroActivo;
    const coincideOferta = !filtroSoloOfertas || tieneOfertaValida(producto);
    return coincideCategoria && coincideLiga && coincideBusqueda && coincideGenero && coincideOferta;
  });
}

function obtenerEtiquetaGeneroTarjeta(genero) {
  if (genero === 'mujer') return 'Versión Femenina';
  if (genero === 'ninos') return 'Niños';
  return '';
}

function obtenerEtiquetaFiltroGenero(genero) {
  const etiquetas = { todos: 'Todos', hombre: 'Hombre', mujer: 'Mujer', ninos: 'Niños' };
  return etiquetas[genero] || 'Todos';
}

function escaparHtmlTexto(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizarTextoMedida(valor) {
  const texto = String(valor ?? '').trim();
  return texto || '';
}

function filaTablaMedidasTieneDatos(fila) {
  if (!fila || typeof fila !== 'object') return false;
  const talle = normalizarTextoMedida(fila.talle);
  if (!talle) return false;
  return Boolean(
    normalizarTextoMedida(fila.ancho)
    || normalizarTextoMedida(fila.largo)
    || normalizarTextoMedida(fila.largoPlantilla)
    || normalizarTextoMedida(fila.largo_plantilla)
  );
}

function obtenerTablaMedidasProducto(producto) {
  if (!Array.isArray(producto?.tablaMedidas)) return [];
  return producto.tablaMedidas.filter(filaTablaMedidasTieneDatos);
}

function crearHtmlEnlaceTablaMedidas(productoId) {
  return `
    <button
      type="button"
      class="tabla-medidas-link"
      onclick="event.stopPropagation(); abrirTablaMedidas(${Number(productoId)})"
    >Ver tabla de medidas</button>
  `;
}

function crearHtmlBotonesTalles(producto, opciones = {}) {
  const { incluirEnlaceMedidas = true } = opciones;
  const talles = obtenerTallesProducto(producto);
  if (!talles.length) return '';

  const talleActivo = tallesSeleccionados[producto.id] ?? null;

  const botones = talles
    .map(
      (talle) => `
        <button
          type="button"
          class="talle-btn${talle === talleActivo ? ' selected' : ''}"
          data-product-id="${producto.id}"
          data-talle="${escaparAtributoHtml(talle)}"
          onclick="seleccionarTalle(${producto.id}, '${escaparAtributoHtml(talle).replace(/'/g, "\\'")}')"
          aria-label="Talle ${escaparHtmlTexto(talle)}"
          aria-pressed="${talle === talleActivo}"
        >${escaparHtmlTexto(talle)}</button>
      `
    )
    .join('');

  const enlaceMedidas = incluirEnlaceMedidas && obtenerTablaMedidasProducto(producto).length
    ? crearHtmlEnlaceTablaMedidas(producto.id)
    : '';

  return `
    <span class="selector-talles__label">Talle</span>
    ${botones}
    ${enlaceMedidas}
  `;
}

function renderizarFilasTablaMedidas(tablaMedidas, talleSeleccionado = null, categoriaTipo = 'ropa') {
  const tipo = categoriaTipo === 'calzado' ? 'calzado' : 'ropa';
  const colspan = tipo === 'calzado' ? 2 : 3;
  const filas = Array.isArray(tablaMedidas)
    ? tablaMedidas.filter((fila) => {
      try {
        return filaTablaMedidasTieneDatos(fila);
      } catch {
        return false;
      }
    })
    : [];
  if (!filas.length) {
    return `<tr><td colspan="${colspan}"><p class="size-chart-modal__empty">No hay medidas cargadas para este producto.</p></td></tr>`;
  }

  const talleActivo = normalizarTextoMedida(talleSeleccionado).toUpperCase();

  return filas
    .map((fila) => {
      const talle = normalizarTextoMedida(fila?.talle) || '—';
      const activo = Boolean(talleActivo) && talle.toUpperCase() === talleActivo;

      if (tipo === 'calzado') {
        const plantilla = normalizarTextoMedida(fila?.largoPlantilla || fila?.largo_plantilla) || '—';
        return `
          <tr class="${activo ? 'is-selected' : ''}"${activo ? ' aria-current="true"' : ''}>
            <td>${escaparHtmlTexto(talle)}</td>
            <td>${escaparHtmlTexto(plantilla)}</td>
          </tr>
        `;
      }

      const ancho = normalizarTextoMedida(fila?.ancho) || '—';
      const largo = normalizarTextoMedida(fila?.largo) || '—';
      return `
        <tr class="${activo ? 'is-selected' : ''}"${activo ? ' aria-current="true"' : ''}>
          <td>${escaparHtmlTexto(talle)}</td>
          <td>${escaparHtmlTexto(ancho)}</td>
          <td>${escaparHtmlTexto(largo)}</td>
        </tr>
      `;
    })
    .join('');
}

function actualizarEncabezadoTablaMedidasModal(categoriaTipo = 'ropa') {
  const tipo = categoriaTipo === 'calzado' ? 'calzado' : 'ropa';
  const titleText = document.getElementById('size-chart-modal-title-text');
  const subtitleText = document.getElementById('size-chart-modal-subtitle-text');
  const head = document.getElementById('size-chart-modal-head');

  if (tipo === 'calzado') {
    if (titleText) titleText.textContent = 'TABLA DE MEDIDAS (CALZADO)';
    if (subtitleText) {
      subtitleText.textContent =
        'Medidas tomadas sobre la plantilla interna. Tomá la plantilla de una zapatilla tuya que te quede bien y medí su largo de punta a talón.';
    }
    if (head) {
      head.innerHTML = `
        <th scope="col">Talle (AR)</th>
        <th scope="col">Largo de Plantilla (cm)</th>
      `;
    }
    return;
  }

  if (titleText) titleText.textContent = 'TABLA DE MEDIDAS (REFERENCIA DE PRENDA)';
  if (subtitleText) {
    subtitleText.textContent =
      'Medidas tomadas sobre la prenda en plano. Tomá una remera tuya que te quede bien y compará el ancho (axila a axila).';
  }
  if (head) {
    head.innerHTML = `
      <th scope="col">Talle</th>
      <th scope="col">Ancho (Axila a Axila)</th>
      <th scope="col">Largo (cm)</th>
    `;
  }
}

function crearHtmlTablaMedidasProducto(producto, talleSeleccionado = null) {
  const filas = obtenerTablaMedidasProducto(producto);
  if (!filas.length) return '';

  const categoriaTipo = obtenerCategoriaTipoProducto(producto);
  const esCalzado = categoriaTipo === 'calzado';

  const titulo = esCalzado
    ? 'Tabla de medidas (calzado)'
    : 'Tabla de medidas (referencia de prenda)';
  const subtitulo = esCalzado
    ? 'Medidas tomadas sobre la plantilla interna. Tomá la plantilla de una zapatilla tuya que te quede bien y medí su largo de punta a talón.'
    : 'Medidas tomadas sobre la prenda en plano. Tomá una remera tuya que te quede bien y compará el ancho (axila a axila).';
  const thead = esCalzado
    ? `<tr><th scope="col">Talle (AR)</th><th scope="col">Largo de Plantilla (cm)</th></tr>`
    : `<tr><th scope="col">Talle</th><th scope="col">Ancho (Axila a Axila)</th><th scope="col">Largo (cm)</th></tr>`;

  return `
    <div class="product-size-chart">
      <h3 class="product-size-chart__title">
        <span class="product-size-chart__title-icon" aria-hidden="true">📐</span>
        ${titulo}
      </h3>
      <p class="product-size-chart__subtitle">
        <span class="product-size-chart__subtitle-icon" aria-hidden="true">✏️</span>
        ${subtitulo}
      </p>
      <div class="product-size-chart__table-wrap">
        <table class="product-size-chart__table">
          <thead>
            ${thead}
          </thead>
          <tbody>
            ${renderizarFilasTablaMedidas(filas, talleSeleccionado, categoriaTipo)}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function abrirTablaMedidas(productoId) {
  const producto = productos.find((item) => item.id === Number(productoId));
  const modal = document.getElementById('size-chart-modal');
  const tbody = document.getElementById('size-chart-modal-body');
  if (!producto || !modal || !tbody) return;

  const categoriaTipo = obtenerCategoriaTipoProducto(producto);
  const talleSeleccionado = tallesSeleccionados[producto.id] ?? null;
  actualizarEncabezadoTablaMedidasModal(categoriaTipo);
  tbody.innerHTML = renderizarFilasTablaMedidas(
    obtenerTablaMedidasProducto(producto),
    talleSeleccionado,
    categoriaTipo
  );
  modal.dataset.productId = String(producto.id);
  modal.dataset.categoriaTipo = categoriaTipo;
  modal.style.display = 'flex';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    modal.classList.add('is-visible');
  });
}

function cerrarTablaMedidas() {
  const modal = document.getElementById('size-chart-modal');
  if (!modal || modal.style.display === 'none') return;

  modal.classList.remove('is-visible');
  modal.setAttribute('aria-hidden', 'true');
  delete modal.dataset.productId;

  const finalizarCierre = () => {
    modal.classList.remove('is-open');
    modal.style.display = 'none';
    modal.removeEventListener('transitionend', finalizarCierre);
  };

  modal.addEventListener('transitionend', finalizarCierre);
  window.setTimeout(finalizarCierre, 320);
}

function inicializarTablaMedidas() {
  const overlay = document.getElementById('size-chart-modal-overlay');
  const closeBtn = document.getElementById('size-chart-modal-close');
  closeBtn?.addEventListener('click', cerrarTablaMedidas);
  overlay?.addEventListener('click', cerrarTablaMedidas);
}

function renderizarTallesDetalleProducto(producto) {
  const contenedor = document.getElementById('product-detail-talles');
  if (!contenedor) return;

  if (!producto) {
    contenedor.innerHTML = '';
    contenedor.hidden = true;
    return;
  }

  const conStock = productoTieneStock(producto);
  const tallesHtml = conStock
    ? crearHtmlBotonesTalles(producto, { incluirEnlaceMedidas: false })
    : '';

  if (tallesHtml) {
    contenedor.innerHTML = tallesHtml;
    contenedor.hidden = false;
    return;
  }

  contenedor.innerHTML = '';
  contenedor.hidden = true;
}

function renderizarMedidasDetalleProducto(producto) {
  const contenedor = document.getElementById('product-detail-medidas');
  if (!contenedor) return;

  if (!producto) {
    contenedor.innerHTML = '';
    contenedor.hidden = true;
    return;
  }

  const talleSeleccionado = tallesSeleccionados[producto.id] ?? null;
  const html = crearHtmlTablaMedidasProducto(producto, talleSeleccionado);
  if (!html) {
    contenedor.innerHTML = '';
    contenedor.hidden = true;
    return;
  }

  contenedor.innerHTML = html;
  contenedor.hidden = false;
}

function renderizarAccionesDetalleProducto(producto) {
  const btn = document.getElementById('product-detail-add-btn');
  if (!btn) return;

  const conStock = Boolean(producto && productoTieneStock(producto));
  btn.disabled = !conStock;
  btn.textContent = conStock ? 'Agregar al carrito' : 'Sin Stock';
  btn.setAttribute(
    'aria-label',
    conStock
      ? `Agregar ${producto.nombre} al carrito`
      : `${producto?.nombre || 'Producto'} sin stock`
  );
  btn.classList.remove('btn-success-soft');
}

function obtenerStockProducto(producto) {
  const stock = Number(producto.stock);
  return Number.isFinite(stock) && stock > 0 ? stock : 0;
}

function renderizarMiniaturasDetalleProducto(imagenes, indiceActivo = 0) {
  const contenedor = document.getElementById('product-detail-thumbs');
  if (!contenedor) return;

  if (imagenes.length <= 1) {
    contenedor.innerHTML = '';
    contenedor.classList.add('hidden');
    return;
  }

  contenedor.classList.remove('hidden');
  contenedor.innerHTML = imagenes
    .map(
      (url, indice) => `
        <button
          type="button"
          class="product-detail-modal__thumb${indice === indiceActivo ? ' product-detail-modal__thumb--active' : ''}"
          data-index="${indice}"
          aria-label="Ver imagen ${indice + 1}"
          aria-pressed="${indice === indiceActivo}"
        >
          <img src="${url}" alt="" width="72" height="96" loading="lazy">
        </button>
      `
    )
    .join('');
}

function seleccionarImagenDetalleProducto(indice) {
  const producto = productos.find((item) => item.id === Number(document.getElementById('product-detail-modal')?.dataset.productId));
  if (!producto) return;

  const imagenes = obtenerImagenesProducto(producto);
  const url = imagenes[indice];
  if (!url) return;

  const imagenPrincipal = document.getElementById('product-detail-main-image');
  if (imagenPrincipal) {
    imagenPrincipal.src = url;
    imagenPrincipal.alt = producto.nombre;
  }

  document.querySelectorAll('.product-detail-modal__thumb').forEach((thumb, thumbIndex) => {
    const activo = thumbIndex === indice;
    thumb.classList.toggle('product-detail-modal__thumb--active', activo);
    thumb.setAttribute('aria-pressed', String(activo));
  });
}

function abrirDetalleProducto(id) {
  const producto = productos.find((item) => item.id === Number(id));
  if (!producto) return;

  const modal = document.getElementById('product-detail-modal');
  const imagenPrincipal = document.getElementById('product-detail-main-image');
  const titulo = document.getElementById('product-detail-title');
  const precio = document.getElementById('product-detail-price');
  const descripcion = document.getElementById('product-detail-description');
  if (!modal || !imagenPrincipal || !titulo || !precio || !descripcion) return;

  const imagenes = obtenerImagenesProducto(producto);
  const enOferta = tieneOfertaValida(producto);

  modal.dataset.productId = String(producto.id);
  imagenPrincipal.src = imagenes[0] || '';
  imagenPrincipal.alt = producto.nombre;
  titulo.textContent = producto.nombre;
  precio.innerHTML = enOferta
    ? `<span class="precio-tachado">${formatearPrecio(producto.precio)}</span> <span class="product-card__price-actual">${formatearPrecio(producto.precioOferta)}</span>`
    : formatearPrecio(producto.precio);
  descripcion.textContent = producto.descripcion || 'Sin descripción disponible.';

  renderizarMiniaturasDetalleProducto(imagenes);
  renderizarTallesDetalleProducto(producto);
  renderizarMedidasDetalleProducto(producto);
  renderizarAccionesDetalleProducto(producto);

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function cerrarDetalleProducto() {
  const modal = document.getElementById('product-detail-modal');
  if (!modal) return;

  cerrarTablaMedidas();
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  delete modal.dataset.productId;
  document.body.classList.remove('modal-open');
}

function inicializarDetalleProducto() {
  const overlay = document.getElementById('product-detail-modal-overlay');
  const closeBtn = document.getElementById('product-detail-modal-close');
  const thumbs = document.getElementById('product-detail-thumbs');
  const addBtn = document.getElementById('product-detail-add-btn');

  closeBtn?.addEventListener('click', cerrarDetalleProducto);
  overlay?.addEventListener('click', cerrarDetalleProducto);

  thumbs?.addEventListener('click', (event) => {
    const thumb = event.target.closest('.product-detail-modal__thumb');
    if (!thumb) return;
    seleccionarImagenDetalleProducto(Number(thumb.dataset.index));
  });

  addBtn?.addEventListener('click', () => {
    const productoId = Number(document.getElementById('product-detail-modal')?.dataset.productId);
    if (!Number.isFinite(productoId)) return;
    agregarAlCarrito(productoId);

    if (!addBtn.disabled) {
      const textoOriginal = 'Agregar al carrito';
      addBtn.textContent = '✓ ¡Agregado!';
      addBtn.classList.add('btn-success-soft');
      window.setTimeout(() => {
        addBtn.textContent = textoOriginal;
        addBtn.classList.remove('btn-success-soft');
      }, 1500);
    }
  });

  inicializarTablaMedidas();
}

function crearHtmlTarjetaProducto(producto) {
  const sinStock = !productoTieneStock(producto);
  const tallesHtml = sinStock ? '' : crearHtmlBotonesTalles(producto);
  const enOferta = tieneOfertaValida(producto);

  let precioHtml;
  if (enOferta) {
    precioHtml = `
      <p class="product-card__price product-card__price--oferta">
        <span class="precio-tachado">${formatearPrecio(producto.precio)}</span>
        <span class="product-card__price-actual">${formatearPrecio(producto.precioOferta)}</span>
      </p>
    `;
  } else {
    precioHtml = `<p class="product-card__price">${formatearPrecio(producto.precio)}</p>`;
  }

  const descuentoPct = enOferta
    ? calcularDescuentoPorcentaje(producto.precio, producto.precioOferta)
    : 0;

  const badgesFila = `
    <div class="product-card__badges-row">
      <span class="product-card__cuotas-badge">4x3</span>
      ${enOferta ? `<span class="product-card__offer-badge">-${descuentoPct}% OFF</span>` : ''}
    </div>
  `;

  const generoProducto = producto.genero || 'hombre';
  const etiquetaGenero = obtenerEtiquetaGeneroTarjeta(generoProducto);
  const badgeGenero = etiquetaGenero
    ? `<span class="product-card__genero-badge">${etiquetaGenero}</span>`
    : '';

  const techFooter = `
    <div class="product-card__tech">
      <span class="product-card__tech-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" d="M3 8c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 5 0"/>
          <path stroke-linecap="round" d="M3 12c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 5 0"/>
          <path stroke-linecap="round" d="M3 16c2.5-2 5-2 7.5 0s5 2 7.5 0 5-2 5 0"/>
        </svg>
      </span>
      <span class="product-card__tech-text">Tecnología Dri-Fit</span>
    </div>
  `;

  const imagenFrente = optimizarUrlImagenProducto(obtenerImagenFrente(producto));
  const imagenEspalda = optimizarUrlImagenProducto(obtenerImagenEspalda(producto));

  return `
    <article class="product-card${sinStock ? ' product-card--sin-stock' : ''}" role="listitem" data-id="${producto.id}">
      <div
        class="product-card__image-wrapper"
        role="button"
        tabindex="0"
        onclick="abrirDetalleProducto(${producto.id})"
        onkeydown="if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); abrirDetalleProducto(${producto.id}); }"
        aria-label="Ver detalle de ${producto.nombre}"
      >
        <img
          class="product-card__image img-frente"
          src="${imagenFrente}"
          alt="${producto.nombre} — frente"
          loading="lazy"
          width="600"
          height="750"
        >
        <img
          class="product-card__image img-espalda"
          src="${imagenEspalda}"
          alt="${producto.nombre} — espalda"
          loading="lazy"
          width="600"
          height="750"
        >
        ${badgesFila}
        ${sinStock ? '<span class="product-card__stock-badge">SIN STOCK</span>' : ''}
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name">${producto.nombre}</h3>
        ${badgeGenero}
        ${precioHtml}
        ${tallesHtml ? `<div class="selector-talles" id="talles-${producto.id}">${tallesHtml}</div>` : ''}
        ${techFooter}
        <button
          class="product-card__add-btn"
          onclick="agregarAlCarrito(${producto.id})"
          ${sinStock ? 'disabled' : ''}
          aria-label="${sinStock ? `${producto.nombre} sin stock` : `Agregar ${producto.nombre} al carrito`}"
        >
          ${sinStock ? 'Sin Stock' : 'Agregar al carrito'}
        </button>
      </div>
    </article>
  `;
}

function actualizarBotonesTalleUI(productoId) {
  const nuevoTalle = tallesSeleccionados[productoId] ?? null;
  const contenedores = [
    document.getElementById(`talles-${productoId}`),
    document.getElementById('product-detail-talles'),
  ].filter(Boolean);

  contenedores.forEach((contenedor) => {
    contenedor.querySelectorAll(`.talle-btn[data-product-id="${productoId}"]`).forEach((btn) => {
      const activo = btn.dataset.talle === nuevoTalle;
      btn.classList.toggle('selected', activo);
      btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
  });
}

function seleccionarTalle(productoId, talle) {
  const yaSeleccionado = tallesSeleccionados[productoId] === talle;

  if (yaSeleccionado) {
    delete tallesSeleccionados[productoId];
  } else {
    tallesSeleccionados[productoId] = talle;
  }

  actualizarBotonesTalleUI(productoId);

  const modalDetalle = document.getElementById('product-detail-modal');
  if (
    modalDetalle?.classList.contains('is-open')
    && Number(modalDetalle.dataset.productId) === Number(productoId)
  ) {
    const producto = productos.find((item) => item.id === Number(productoId));
    if (producto) renderizarMedidasDetalleProducto(producto);
  }

  const modalMedidas = document.getElementById('size-chart-modal');
  if (
    modalMedidas?.classList.contains('is-open')
    && Number(modalMedidas.dataset.productId) === Number(productoId)
  ) {
    const producto = productos.find((item) => item.id === Number(productoId));
    const tbody = document.getElementById('size-chart-modal-body');
    if (producto && tbody) {
      const categoriaTipo = obtenerCategoriaTipoProducto(producto);
      tbody.innerHTML = renderizarFilasTablaMedidas(
        obtenerTablaMedidasProducto(producto),
        tallesSeleccionados[productoId] ?? null,
        categoriaTipo
      );
    }
  }
}

function escaparAtributoHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function obtenerEscudoSeccion(seccion) {
  return String(seccion?.escudo || '').trim();
}

function esUrlEscudoValida(url) {
  return /^https?:\/\/.+/i.test(String(url || '').trim());
}

function extraerRutaAssetCloudinary(url) {
  const match = String(url || '').match(/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:.+\/)?(v\d+\/.+)$/);
  return match ? match[1] : null;
}

function extraerCloudNameCloudinary(url) {
  const match = String(url || '').match(/res\.cloudinary\.com\/([^/]+)\/image\/upload\//);
  return match ? match[1] : '';
}

function optimizarUrlEscudo(url) {
  const limpia = String(url || '').trim();
  if (!esUrlEscudoValida(limpia)) return '';

  const assetPath = extraerRutaAssetCloudinary(limpia);
  if (!assetPath) return limpia;

  const cloudName = extraerCloudNameCloudinary(limpia) || CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return limpia;

  const transform =
    'e_trim:color_FFFFFF;tolerance_60,e_trim:color_F5F5F5;tolerance_40,e_trim/c_scale,h_280/c_pad,w_360,h_360,g_south,b_rgb:F5F5F5,f_png,q_auto';

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}/${assetPath}`;
}

function optimizarUrlImagenProducto(url, opciones = {}) {
  const limpia = String(url || '').trim();
  if (!/^https?:\/\/.+/i.test(limpia)) return limpia;

  const assetPath = extraerRutaAssetCloudinary(limpia);
  if (!assetPath) return limpia;

  const cloudName = extraerCloudNameCloudinary(limpia) || CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return limpia;

  // c_fill recorta sin deformar; c_scale con w+h estiraba las camisetas.
  const transform = opciones.transform || 'c_fill,g_center,w_600,h_750,q_auto,f_auto';
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transform}/${assetPath}`;
}

function mostrarPlaceholderEscudo(img, placeholder, seccion) {
  if (img) {
    img.removeAttribute('src');
    img.classList.add('hidden');
    img.onerror = null;
  }

  if (placeholder) {
    placeholder.textContent = (seccion?.nombre || '?').charAt(0).toUpperCase();
    placeholder.classList.remove('hidden');
  }
}

function mostrarImagenEscudo(img, placeholder, url) {
  const urlOptimizada = optimizarUrlEscudo(url);
  if (!img || !esUrlEscudoValida(urlOptimizada)) return false;

  if (placeholder) {
    placeholder.textContent = '';
    placeholder.classList.add('hidden');
  }

  img.onerror = () => {
    const seccion = obtenerSeccionActiva();
    mostrarPlaceholderEscudo(img, placeholder, seccion);
  };
  img.src = urlOptimizada;
  img.classList.remove('hidden');
  return true;
}

function formatearEtiquetaCategoria(categoria) {
  if (!categoria) return '';
  return categoria
    .trim()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase())
    .join(' ');
}

function esFiltroSeccionValido(nombre) {
  return nombre === 'todos'
    || nombre === NOMBRE_SECCION_CALZADO
    || secciones.some((seccion) => seccion.nombre === nombre);
}

function obtenerSeccionesParaCarrusel() {
  const generales = obtenerSeccionesGenerales();
  const calzado = obtenerSeccionCalzadoRaiz();
  const items = [...generales];
  if (calzado) items.push(calzado);
  // Solo secciones habilitadas para el carrusel de atajos (home).
  // El menú hamburguesa usa `secciones` completo y no aplica este filtro.
  return items.filter((seccion) => seccion.mostrarEnCarrusel !== false);
}

function obtenerLigaRepresentativaSeccion(seccionNombre) {
  const conteo = {};

  productos.forEach((producto) => {
    if (producto.categoria !== seccionNombre) return;
    const liga = String(producto.liga || '').trim();
    if (!liga) return;
    conteo[liga] = (conteo[liga] || 0) + 1;
  });

  const ligasOrdenadas = Object.entries(conteo).sort((a, b) => b[1] - a[1]);
  return ligasOrdenadas[0]?.[0] || '';
}

function obtenerFiltroDesdeItemCarousel(elemento) {
  const item = elemento?.closest?.('.club-nav__item');
  if (!item) return null;

  const equipo = item.dataset.equipo || item.dataset.seccion || 'todos';
  const liga = item.dataset.liga || '';
  const seccionId = item.dataset.seccionId || '';

  return { equipo, liga, seccionId };
}

function sincronizarFiltrosCategoriaUi() {
  document.querySelectorAll('#dropdown-categorias-list .dropdown-item').forEach((btn) => {
    const activo = !filtroSoloOfertas && btn.dataset.categoria === categoriaFiltroActiva;
    btn.classList.toggle('active', activo);
  });

  sincronizarCarruselSeccionesActivo();
  sincronizarMenuMobileActivo();
}

function actualizarUiFiltroColeccion() {
  const titulo = document.querySelector('#coleccion .section-title');
  const subtitulo = document.querySelector('#coleccion .section-subtitle');
  const contenedorFiltros = document.querySelector('#coleccion .filtros-container');
  const coleccion = document.getElementById('coleccion');
  const ligaVisible =
    ligaFiltroActiva ||
    (categoriaFiltroActiva !== 'todos'
      ? obtenerLigaRepresentativaSeccion(categoriaFiltroActiva)
      : '');

  if (filtroSoloOfertas) {
    titulo && (titulo.textContent = 'Ofertas');
    subtitulo && (subtitulo.textContent = 'Camisetas con descuento disponibles ahora');
    coleccion?.classList.add('products-section--filtrada');
  } else if (categoriaFiltroActiva !== 'todos') {
    const nombreEquipo = formatearEtiquetaCategoria(categoriaFiltroActiva);
    titulo && (titulo.textContent = nombreEquipo);
    subtitulo &&
      (subtitulo.textContent = ligaVisible
        ? `Camisetas de ${nombreEquipo} — ${ligaVisible}`
        : `Camisetas de ${nombreEquipo}`);
    coleccion?.classList.add('products-section--filtrada');
  } else if (ligaFiltroActiva) {
    titulo && (titulo.textContent = ligaFiltroActiva);
    subtitulo && (subtitulo.textContent = `Todas las camisetas de ${ligaFiltroActiva}`);
    coleccion?.classList.add('products-section--filtrada');
  } else {
    titulo && (titulo.textContent = 'Todos nuestros Productos');
    subtitulo &&
      (subtitulo.textContent = 'Todas las camisetas, filtrá por club o sección');
    coleccion?.classList.remove('products-section--filtrada');
  }

  if (!contenedorFiltros) return;

  const hayFiltroActivo =
    filtroSoloOfertas || categoriaFiltroActiva !== 'todos' || Boolean(ligaFiltroActiva);
  let chip = document.getElementById('coleccion-filtro-activo');

  if (!hayFiltroActivo) {
    chip?.remove();
    contenedorFiltros.classList.remove('filtros-container--filtrado');
    return;
  }

  if (!chip) {
    chip = document.createElement('div');
    chip.id = 'coleccion-filtro-activo';
    chip.className = 'coleccion-filtro-activo';
    chip.innerHTML = `
      <span class="coleccion-filtro-activo__label" id="coleccion-filtro-activo-label"></span>
      <button
        type="button"
        class="coleccion-filtro-activo__clear"
        id="coleccion-filtro-activo-clear"
        aria-label="Quitar filtro activo"
      >×</button>
    `;
    contenedorFiltros.prepend(chip);
    document.getElementById('coleccion-filtro-activo-clear')?.addEventListener('click', () => {
      aplicarFiltroColeccion({ equipo: 'todos', liga: '', scroll: false });
    });
  }

  contenedorFiltros.classList.add('filtros-container--filtrado');

  const etiqueta = document.getElementById('coleccion-filtro-activo-label');
  if (!etiqueta) return;

  if (filtroSoloOfertas) {
    etiqueta.textContent = 'Viendo: Ofertas';
    return;
  }

  if (categoriaFiltroActiva !== 'todos') {
    const nombreEquipo = formatearEtiquetaCategoria(categoriaFiltroActiva);
    etiqueta.textContent = ligaVisible
      ? `Viendo: ${nombreEquipo} (${ligaVisible})`
      : `Viendo: ${nombreEquipo}`;
    return;
  }

  if (ligaFiltroActiva) {
    etiqueta.textContent = `Viendo: ${ligaFiltroActiva}`;
  }
}

function aplicarFiltroColeccion(opciones = {}) {
  const equipo = opciones.equipo ?? 'todos';
  const liga = opciones.liga ?? '';
  const scroll = opciones.scroll !== false;

  filtroSoloOfertas = false;
  categoriaFiltroActiva = equipo || 'todos';
  ligaFiltroActiva = categoriaFiltroActiva === 'todos' ? liga : '';

  sincronizarFiltrosCategoriaUi();
  actualizarUiFiltroColeccion();
  solicitarRenderizadoProductos({ skeleton: false });

  if (scroll) {
    document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function inicializarEnlaceProductos() {
  document.addEventListener('click', (event) => {
    const enlace = event.target.closest(
      '.footer-nav a[href="#coleccion"], .mobile-nav__link[href$="#coleccion"]'
    );
    if (!enlace) return;

    event.preventDefault();
    aplicarFiltroColeccion({ equipo: 'todos', liga: '', scroll: true });
    if (window.location.hash !== '#coleccion') {
      history.replaceState(null, '', '#coleccion');
    }
  });
}

function crearHtmlIconoSeccion(seccion) {
  const escudo = optimizarUrlEscudo(obtenerEscudoSeccion(seccion));
  if (esUrlEscudoValida(escudo)) {
    return `<img class="club-nav__escudo" src="${escaparAtributoHtml(escudo)}" alt="" loading="lazy">`;
  }

  const inicial = (seccion.nombre || '?').charAt(0).toUpperCase();
  return `<span class="club-nav__icon-placeholder">${inicial}</span>`;
}

function crearHtmlItemCarruselSeccion(seccion, activo) {
  const liga = obtenerLigaRepresentativaSeccion(seccion.nombre);
  const atributosLiga = liga ? ` data-liga="${escaparAtributoHtml(liga)}"` : '';

  return `
    <li>
      <button
        type="button"
        class="club-nav__item${activo ? ' active' : ''}"
        data-seccion="${escaparAtributoHtml(seccion.nombre)}"
        data-equipo="${escaparAtributoHtml(seccion.nombre)}"
        data-seccion-id="${seccion.id}"${atributosLiga}
        aria-pressed="${activo}"
        aria-label="Filtrar por ${escaparAtributoHtml(seccion.nombre)}"
      >
        <span class="club-nav__logo" aria-hidden="true">${crearHtmlIconoSeccion(seccion)}</span>
        <span class="club-nav__label">${seccion.nombre.toUpperCase()}</span>
      </button>
    </li>
  `;
}

function obtenerMaxEscudoCarrusel() {
  return window.matchMedia('(max-width: 768px)').matches ? 56 : CLUB_NAV_ESCUDO_MAX;
}

function aplicarTamanioUniformeEscudo(img) {
  const maxEscudo = obtenerMaxEscudoCarrusel();
  img.style.width = `${maxEscudo}px`;
  img.style.height = `${maxEscudo}px`;
  img.style.transform = '';
}

function equalizarTamanioEscudosCarrusel() {
  document.querySelectorAll('#club-nav-list .club-nav__escudo').forEach(aplicarTamanioUniformeEscudo);
}

function sincronizarCarruselSeccionesActivo() {
  document.querySelectorAll('.club-nav__item').forEach((btn) => {
    const activo = btn.dataset.seccion === categoriaFiltroActiva;
    btn.classList.toggle('active', activo);
    btn.setAttribute('aria-pressed', String(activo));
  });
}

function renderizarCarruselSecciones() {
  const lista = document.getElementById('club-nav-list');
  if (!lista) return;

  const seccionesCarrusel = obtenerSeccionesParaCarrusel();

  if (
    categoriaFiltroActiva !== 'todos' &&
    !seccionesCarrusel.some((seccion) => seccion.nombre === categoriaFiltroActiva) &&
    !secciones.some((seccion) => seccion.nombre === categoriaFiltroActiva)
  ) {
    categoriaFiltroActiva = 'todos';
  }

  const verTodoActivo = categoriaFiltroActiva === 'todos';
  const items = [
    `
      <li>
        <button
          type="button"
          class="club-nav__item${verTodoActivo ? ' active' : ''}"
          data-seccion="todos"
          data-equipo="todos"
          aria-pressed="${verTodoActivo}"
          aria-label="Ver todas las secciones"
        >
          <span class="club-nav__logo club-nav__logo--all" aria-hidden="true">
            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 16h10M16 11v10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </span>
          <span class="club-nav__label">VER TODO</span>
        </button>
      </li>
    `,
    ...seccionesCarrusel.map((seccion) =>
      crearHtmlItemCarruselSeccion(seccion, categoriaFiltroActiva === seccion.nombre)
    ),
  ];

  lista.innerHTML = items.join('');

  lista.querySelectorAll('.club-nav__escudo').forEach((img) => {
    const nombre = img.closest('.club-nav__item')?.dataset.seccion || '?';
    img.addEventListener(
      'load',
      () => aplicarTamanioUniformeEscudo(img),
      { once: true }
    );
    img.addEventListener(
      'error',
      () => {
        const placeholder = document.createElement('span');
        placeholder.className = 'club-nav__icon-placeholder';
        placeholder.textContent = nombre === 'todos' ? '+' : nombre.charAt(0).toUpperCase();
        img.replaceWith(placeholder);
      },
      { once: true }
    );
  });

  equalizarTamanioEscudosCarrusel();
  window.dispatchEvent(new Event('header:remeasure'));
}

function filtrarPorSeccionCarousel(seccionNombre) {
  aplicarFiltroColeccion({ equipo: seccionNombre });
}

function filtrarPorOfertas() {
  filtroSoloOfertas = true;
  categoriaFiltroActiva = 'todos';
  ligaFiltroActiva = '';

  document.querySelectorAll('#dropdown-categorias-list .dropdown-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.categoria === 'todos');
  });

  sincronizarCarruselSeccionesActivo();
  sincronizarMenuMobileActivo();
  actualizarUiFiltroColeccion();
  solicitarRenderizadoProductos({ skeleton: false });
  document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function obtenerContenedorScrollClubNav() {
  const lista = document.getElementById('club-nav-list');
  if (!lista) return null;

  const viewport = lista.closest('.club-nav__viewport');
  if (window.matchMedia('(max-width: 768px)').matches && viewport) {
    return viewport;
  }

  return lista;
}

function inicializarCarruselClubNav() {
  const track = document.getElementById('club-nav-list');
  const prev = document.getElementById('club-nav-prev');
  const next = document.getElementById('club-nav-next');
  if (!track) return;

  const desplazar = (direccion) => {
    const scrollEl = obtenerContenedorScrollClubNav();
    if (!scrollEl) return;

    const item = track.querySelector('.club-nav__item');
    const gap = parseFloat(getComputedStyle(track).gap) || 4;
    const paso = item ? item.closest('li').offsetWidth + gap : 76;
    const esMobile = window.matchMedia('(max-width: 768px)').matches;

    scrollEl.scrollBy({
      left: direccion * paso * 2,
      behavior: esMobile ? 'auto' : 'smooth',
    });
  };

  prev?.addEventListener('click', () => desplazar(-1));
  next?.addEventListener('click', () => desplazar(1));
}

function manejarInteraccionCarruselEquipos(event) {
  const objetivoInteractivo = event.target.closest(
    '.club-nav__item, .club-nav__logo, .club-nav__label, .club-nav__escudo, .club-nav__icon-placeholder'
  );
  if (!objetivoInteractivo) return;

  const btn = event.target.closest('.club-nav__item');
  if (!btn) return;

  event.preventDefault();

  const filtro = obtenerFiltroDesdeItemCarousel(btn);
  if (!filtro) return;

  const mismoFiltroActivo =
    !filtroSoloOfertas &&
    filtro.equipo === categoriaFiltroActiva &&
    (filtro.equipo !== 'todos' || !ligaFiltroActiva);

  aplicarFiltroColeccion({
    equipo: filtro.equipo,
    liga: filtro.equipo === 'todos' ? filtro.liga : '',
    scroll: !mismoFiltroActivo && filtro.equipo !== 'todos',
  });
}

function inicializarClubNav() {
  const lista = document.getElementById('club-nav-list');
  lista?.addEventListener('click', manejarInteraccionCarruselEquipos);

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(equalizarTamanioEscudosCarrusel, 150);
  });

  inicializarCarruselClubNav();
}

function obtenerProductosDestacados() {
  // Filtro limpio: solo productos con destacado === true (portada).
  return filtrarProductos(productos)
    .filter((producto) => producto.destacado === true)
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function obtenerProductosEnOfertaPortada() {
  return filtrarProductos(productos)
    .filter((producto) => {
      const marcado = producto.enOferta === true || producto.en_oferta === true;
      return marcado && tieneOfertaValida(producto);
    })
    .sort((a, b) => Number(b.id) - Number(a.id));
}

function obtenerProductosIngresos() {
  const filtrados = filtrarProductos(productos);
  return [...filtrados].sort((a, b) => Number(b.id) - Number(a.id)).slice(0, 12);
}

function renderizarCarruselProductos(trackId, lista, mensajeVacio) {
  const track = document.getElementById(trackId);
  if (!track) return;

  if (!lista.length) {
    track.innerHTML = `<p class="stadium-carousel__empty">${mensajeVacio}</p>`;
    track.setAttribute('aria-busy', 'false');
    return;
  }

  track.innerHTML = lista.map(crearHtmlTarjetaProducto).join('');
  track.setAttribute('aria-busy', 'false');
}

function renderizarCarruselesInicio() {
  renderizarCarruselProductos(
    'destacados-carousel-track',
    obtenerProductosDestacados(),
    'No hay productos destacados para mostrar.'
  );
  renderizarCarruselProductos(
    'ofertas-carousel-track',
    obtenerProductosEnOfertaPortada(),
    'No hay productos en oferta por ahora.'
  );
  renderizarCarruselProductos(
    'stadium-carousel-track',
    obtenerProductosIngresos(),
    'No hay ingresos recientes para mostrar.'
  );
}

function renderizarStadiumCarousel() {
  renderizarCarruselesInicio();
}

function inicializarCarruselHorizontal(trackId, prevId, nextId) {
  const track = document.getElementById(trackId);
  const prev = document.getElementById(prevId);
  const next = document.getElementById(nextId);
  if (!track) return;

  const scrollEl = track.closest('.stadium-carousel__viewport') || track;

  const desplazar = (direccion) => {
    const card = track.querySelector('.product-card');
    const gap = parseFloat(getComputedStyle(track).gap) || 16;
    const paso = card ? card.offsetWidth + gap : 260;
    scrollEl.scrollBy({ left: direccion * paso, behavior: 'smooth' });
  };

  prev?.addEventListener('click', () => desplazar(-1));
  next?.addEventListener('click', () => desplazar(1));
}

function inicializarStadiumCarousel() {
  inicializarCarruselHorizontal(
    'destacados-carousel-track',
    'destacados-carousel-prev',
    'destacados-carousel-next'
  );
  inicializarCarruselHorizontal(
    'ofertas-carousel-track',
    'ofertas-carousel-prev',
    'ofertas-carousel-next'
  );
  inicializarCarruselHorizontal(
    'stadium-carousel-track',
    'stadium-carousel-prev',
    'stadium-carousel-next'
  );
}

function inicializarHeroStage() {
  const viewport = document.getElementById('hero-stage-viewport');
  const counter = document.getElementById('hero-stage-counter');
  const nextBtn = document.getElementById('hero-stage-next');
  const dots = document.querySelectorAll('#hero-stage-dots [data-hero-goto]');
  if (!viewport) return;

  const slides = Array.from(viewport.querySelectorAll('.hero-slide'));
  if (!slides.length) return;

  let indice = Math.max(0, slides.findIndex((slide) => slide.classList.contains('is-active')));
  let timerId = null;

  const irA = (nuevoIndice) => {
    indice = ((nuevoIndice % slides.length) + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === indice);
    });
    dots.forEach((dot, i) => {
      const activo = i === indice;
      dot.classList.toggle('is-active', activo);
      dot.setAttribute('aria-selected', activo ? 'true' : 'false');
    });
    if (counter) counter.textContent = `${indice + 1} / ${slides.length}`;
  };

  const siguiente = () => irA(indice + 1);

  const reiniciarAutoplay = () => {
    if (timerId) window.clearInterval(timerId);
    timerId = window.setInterval(siguiente, 5500);
  };

  nextBtn?.addEventListener('click', () => {
    siguiente();
    reiniciarAutoplay();
  });

  dots.forEach((dot) => {
    dot.addEventListener('click', () => {
      const destino = Number(dot.dataset.heroGoto);
      if (Number.isNaN(destino)) return;
      irA(destino);
      reiniciarAutoplay();
    });
  });

  let touchStartX = 0;
  viewport.addEventListener('touchstart', (event) => {
    touchStartX = event.changedTouches?.[0]?.clientX || 0;
  }, { passive: true });

  viewport.addEventListener('touchend', (event) => {
    const touchEndX = event.changedTouches?.[0]?.clientX || 0;
    const delta = touchEndX - touchStartX;
    if (Math.abs(delta) < 40) return;
    if (delta < 0) siguiente();
    else irA(indice - 1);
    reiniciarAutoplay();
  }, { passive: true });

  irA(indice);
  reiniciarAutoplay();
}

function inicializarNewsletter() {
  const form = document.getElementById('newsletter-form');
  const feedback = document.getElementById('newsletter-feedback');
  const input = document.getElementById('newsletter-email');
  if (!form || !input) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = String(input.value || '').trim();
    const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!feedback) return;

    feedback.classList.remove('hidden', 'is-error');

    if (!valido) {
      feedback.classList.add('is-error');
      feedback.textContent = 'Ingresá un email válido.';
      return;
    }

    feedback.textContent = '¡Listo! Te vamos a avisar con las próximas novedades.';
    input.value = '';
  });
}

function filtrarPorCategoria(categoria, elemento) {
  aplicarFiltroColeccion({ equipo: categoria, scroll: false });

  document.querySelectorAll('#dropdown-categorias-list .dropdown-item').forEach((btn) => {
    btn.classList.remove('active');
  });
  elemento?.classList.add('active');

  cerrarDropdownCategorias();
}

function cerrarDropdownCategorias() {
  const dropdown = document.getElementById('dropdown-categorias');
  const trigger = document.getElementById('btn-colecciones');
  dropdown?.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
}

function cerrarDropdownOrden() {
  const dropdown = document.getElementById('dropdown-orden');
  const trigger = document.getElementById('btn-ordenar');
  dropdown?.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
}

function cerrarDropdownGenero() {
  const dropdown = document.getElementById('dropdown-genero');
  const trigger = document.getElementById('btn-genero');
  dropdown?.classList.remove('is-open');
  trigger?.setAttribute('aria-expanded', 'false');
}

function cerrarTodosDropdowns() {
  cerrarDropdownCategorias();
  cerrarDropdownOrden();
  cerrarDropdownGenero();
}

function toggleDropdownCategorias() {
  const dropdown = document.getElementById('dropdown-categorias');
  const trigger = document.getElementById('btn-colecciones');
  if (!dropdown) return;

  const isOpen = dropdown.classList.toggle('is-open');
  trigger?.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    cerrarDropdownOrden();
    cerrarDropdownGenero();
  }
}

function toggleDropdownOrden() {
  const dropdown = document.getElementById('dropdown-orden');
  const trigger = document.getElementById('btn-ordenar');
  if (!dropdown) return;

  const isOpen = dropdown.classList.toggle('is-open');
  trigger?.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    cerrarDropdownCategorias();
    cerrarDropdownGenero();
  }
}

function toggleDropdownGenero() {
  const dropdown = document.getElementById('dropdown-genero');
  const trigger = document.getElementById('btn-genero');
  if (!dropdown) return;

  const isOpen = dropdown.classList.toggle('is-open');
  trigger?.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) {
    cerrarDropdownCategorias();
    cerrarDropdownOrden();
  }
}

function inicializarDropdownCategorias() {
  const trigger = document.getElementById('btn-colecciones');
  const dropdown = document.getElementById('dropdown-categorias');

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownCategorias();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown?.contains(e.target)) {
      cerrarDropdownCategorias();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarTodosDropdowns();
    }
  });
}

function inicializarDropdownOrden() {
  const trigger = document.getElementById('btn-ordenar');
  const dropdown = document.getElementById('dropdown-orden');

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownOrden();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown?.contains(e.target)) {
      cerrarDropdownOrden();
    }
  });

  document.querySelectorAll('#dropdown-orden-list .dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => filtrarPorOrden(btn.dataset.orden, btn));
  });
}

function actualizarEtiquetaDropdownGenero() {
  const label = document.getElementById('btn-genero-label');
  if (label) label.textContent = obtenerEtiquetaFiltroGenero(generoFiltroActivo);
}

function filtrarPorGenero(genero, elemento) {
  generoFiltroActivo = genero;

  document.querySelectorAll('#dropdown-genero-list .dropdown-item').forEach((btn) => {
    btn.classList.remove('active');
  });
  elemento?.classList.add('active');

  actualizarEtiquetaDropdownGenero();
  cerrarDropdownGenero();
  solicitarRenderizadoProductos();
}

function inicializarDropdownGenero() {
  const trigger = document.getElementById('btn-genero');
  const dropdown = document.getElementById('dropdown-genero');

  actualizarEtiquetaDropdownGenero();

  trigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownGenero();
  });

  document.addEventListener('click', (e) => {
    if (!dropdown?.contains(e.target)) {
      cerrarDropdownGenero();
    }
  });

  document.querySelectorAll('#dropdown-genero-list .dropdown-item').forEach((btn) => {
    btn.addEventListener('click', () => filtrarPorGenero(btn.dataset.genero, btn));
  });
}

function filtrarPorOrden(criterio, elemento) {
  criterioOrdenActivo = criterio;

  document.querySelectorAll('#dropdown-orden-list .dropdown-item').forEach((btn) => {
    btn.classList.remove('active');
  });
  elemento?.classList.add('active');

  cerrarDropdownOrden();
  solicitarRenderizadoProductos();
}

function ordenarListaProductos(lista) {
  if (criterioOrdenActivo === 'predeterminado') {
    return lista;
  }

  const copia = [...lista];

  switch (criterioOrdenActivo) {
    case 'precio-asc':
      return copia.sort((a, b) => obtenerPrecioEfectivo(a) - obtenerPrecioEfectivo(b));
    case 'precio-desc':
      return copia.sort((a, b) => obtenerPrecioEfectivo(b) - obtenerPrecioEfectivo(a));
    case 'alfa-asc':
      return copia.sort((a, b) => a.nombre.localeCompare(b.nombre));
    case 'alfa-desc':
      return copia.sort((a, b) => b.nombre.localeCompare(a.nombre));
    default:
      return lista;
  }
}

function renderizarFiltrosCategorias(listaProductos) {
  const menu = document.getElementById('dropdown-categorias-list');
  if (!menu) return;

  const categorias = [...new Set(listaProductos.map((p) => p.categoria).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, 'es')
  );

  if (
    categoriaFiltroActiva !== 'todos' &&
    !categorias.includes(categoriaFiltroActiva) &&
    !esFiltroSeccionValido(categoriaFiltroActiva)
  ) {
    categoriaFiltroActiva = 'todos';
    ligaFiltroActiva = '';
    sincronizarCarruselSeccionesActivo();
    actualizarUiFiltroColeccion();
  }

  menu.innerHTML = '';

  const crearItem = (categoria, etiqueta) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-item${categoriaFiltroActiva === categoria ? ' active' : ''}`;
    btn.dataset.categoria = categoria;
    btn.textContent = etiqueta;
    btn.setAttribute('role', 'menuitem');
    btn.addEventListener('click', () => filtrarPorCategoria(categoria, btn));
    return btn;
  };

  menu.appendChild(crearItem('todos', 'Ver Todo'));

  categorias.forEach((cat) => {
    menu.appendChild(crearItem(cat, formatearEtiquetaCategoria(cat)));
  });
}

function registrarBusquedaProducto(nombre) {
  if (!nombre) return;

  try {
    const stats = JSON.parse(localStorage.getItem(SEARCH_STATS_KEY) || '{}');
    const clave = nombre.toLowerCase();
    stats[clave] = (stats[clave] || 0) + 1;
    localStorage.setItem(SEARCH_STATS_KEY, JSON.stringify(stats));
  } catch {
    /* ignorar errores de almacenamiento */
  }
}

function obtenerProductoMasBuscado() {
  try {
    const stats = JSON.parse(localStorage.getItem(SEARCH_STATS_KEY) || '{}');
    let nombreDestacado = null;
    let maximo = 0;

    Object.entries(stats).forEach(([nombre, cantidad]) => {
      if (cantidad > maximo) {
        maximo = cantidad;
        nombreDestacado = nombre;
      }
    });

    if (nombreDestacado) {
      const productoCoincidente = productos.find(
        (item) => item.nombre.toLowerCase() === nombreDestacado
      );
      return productoCoincidente?.nombre || nombreDestacado;
    }
  } catch {
    /* ignorar errores de almacenamiento */
  }

  if (productos.length) {
    const destacados = obtenerProductosDestacados();
    return (destacados[0] || productos[0]).nombre;
  }

  return 'Camiseta Titular 2025';
}

function obtenerContenedorResultadosPredictivos() {
  return document.getElementById('contenedor-resultados-predicativos');
}

function crearHtmlSugerenciaBusqueda(producto) {
  const productoLocal = productos.find((item) => item.id === producto.id) || producto;
  const sinStock = !productoTieneStock(productoLocal);
  const imagen = optimizarUrlImagenProducto(producto.imagenFrente || obtenerImagenPrincipal(productoLocal));
  const enOferta = tieneOfertaValida(productoLocal);
  const precioHtml = enOferta
    ? `<span class="precio-tachado">${formatearPrecio(productoLocal.precio)}</span> <span class="product-card__price-actual">${formatearPrecio(productoLocal.precioOferta)}</span>`
    : formatearPrecio(productoLocal.precio ?? producto.precio);

  return `
    <div class="search-suggestion" role="option" data-suggestion-id="${producto.id}">
      <img class="search-suggestion__thumb" src="${imagen}" alt="" loading="lazy">
      <div class="search-suggestion__info">
        <span class="search-suggestion__name">${producto.nombre}</span>
        <span class="search-suggestion__price">${precioHtml}</span>
      </div>
      <button
        type="button"
        class="search-suggestion__add"
        data-suggestion-add="${producto.id}"
        aria-label="${sinStock ? `${producto.nombre} sin stock` : `Agregar ${producto.nombre} al carrito`}"
        ${sinStock ? 'disabled' : ''}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.25 7.5V6.75A2.25 2.25 0 0110.5 4.5h3a2.25 2.25 0 012.25 2.25V7.5"/>
          <path d="M6 8.25h12a1.5 1.5 0 011.5 1.5v9a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 18.75v-9A1.5 1.5 0 016 8.25z"/>
        </svg>
      </button>
    </div>
  `;
}

function renderizarResultadosPredictivos(resultados, termino) {
  const dropdown = obtenerContenedorResultadosPredictivos();
  const input = document.getElementById('input-busqueda');
  if (!dropdown || !input) return;

  const consulta = termino.trim();

  if (!consulta) {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
    input.setAttribute('aria-expanded', 'false');
    return;
  }

  if (!resultados.length) {
    dropdown.hidden = false;
    dropdown.innerHTML = '<p class="search-suggestions__empty">No encontramos productos con ese nombre.</p>';
    input.setAttribute('aria-expanded', 'true');
    return;
  }

  dropdown.hidden = false;
  dropdown.innerHTML = resultados.map(crearHtmlSugerenciaBusqueda).join('');
  input.setAttribute('aria-expanded', 'true');
}

async function buscarProductosPredictivo(termino) {
  const consulta = termino.trim();
  if (consulta.length < 2) {
    renderizarResultadosPredictivos([], consulta);
    return;
  }

  try {
    const resultados = await fetch(
      `${API_BASE}/api/productos/buscar?q=${encodeURIComponent(consulta)}`
    ).then((respuesta) => {
      if (!respuesta.ok) throw new Error('No se pudo completar la búsqueda.');
      return respuesta.json();
    });

    renderizarResultadosPredictivos(Array.isArray(resultados) ? resultados : [], consulta);
  } catch (error) {
    console.error('Error en búsqueda predictiva:', error);
    renderizarResultadosPredictivos([], consulta);
  }
}

function ocultarSugerenciasBusqueda() {
  const dropdown = obtenerContenedorResultadosPredictivos();
  const input = document.getElementById('input-busqueda');
  if (dropdown) {
    dropdown.hidden = true;
    dropdown.innerHTML = '';
  }
  input?.setAttribute('aria-expanded', 'false');
}

function crearPanelMenuMobile() {
  if (document.getElementById('mobile-nav')) return;

  const nav = document.createElement('div');
  nav.id = 'mobile-nav';
  nav.className = 'mobile-nav';
  nav.setAttribute('aria-hidden', 'true');
  nav.innerHTML = `
    <div class="mobile-nav__overlay" id="mobile-nav-overlay" aria-hidden="true"></div>
    <aside
      class="mobile-nav__panel"
      id="mobile-nav-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Accesos rápidos"
    >
      <div class="mobile-nav__header">
        <h2 class="mobile-nav__title">Accesos rápidos</h2>
        <button type="button" class="mobile-nav__close" id="mobile-nav-close" aria-label="Cerrar menú">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18"/>
          </svg>
        </button>
      </div>
      <nav class="mobile-nav__links" id="mobile-nav-links" aria-label="Enlaces rápidos"></nav>
    </aside>
  `;
  document.body.appendChild(nav);
}

function esPaginaTienda() {
  const pagina = document.body?.dataset?.page || 'index';
  return pagina === 'index';
}

function renderizarEnlacesMenuMobile() {
  const lista = document.getElementById('mobile-nav-links');
  if (!lista) return;

  const partes = [];

  if (esPaginaTienda()) {
    partes.push(`
      <button type="button" class="mobile-nav__link" data-mobile-nav="seccion" data-seccion="todos">
        Ver todo
      </button>
    `);

    secciones.forEach((seccion) => {
      const liga = obtenerLigaRepresentativaSeccion(seccion.nombre);
      const atributosLiga = liga ? ` data-liga="${escaparAtributoHtml(liga)}"` : '';

      partes.push(`
        <button
          type="button"
          class="mobile-nav__link"
          data-mobile-nav="seccion"
          data-seccion="${escaparAtributoHtml(seccion.nombre)}"
          data-equipo="${escaparAtributoHtml(seccion.nombre)}"
          data-seccion-id="${seccion.id}"${atributosLiga}
        >${seccion.nombre}</button>
      `);
    });

    partes.push(`
      <button type="button" class="mobile-nav__link" data-mobile-nav="ofertas">
        Ofertas
      </button>
    `);
  } else {
    partes.push(`
      <a href="index.html#inicio" class="mobile-nav__link">Inicio</a>
      <a href="index.html#coleccion" class="mobile-nav__link">Catálogo</a>
    `);
  }

  partes.push('<div class="mobile-nav__divider" role="separator"></div>');
  partes.push('<span class="mobile-nav__group-label">Mi cuenta</span>');

  if (esSesionAdminActiva()) {
    partes.push(`
      <button type="button" class="mobile-nav__link" data-mobile-nav="admin-panel">
        Panel de Control
      </button>
    `);
  }

  partes.push(`
    <button type="button" class="mobile-nav__link" data-mobile-nav="cuenta" data-panel="ingresar">
      Ingresá / Mi cuenta
    </button>
    <button type="button" class="mobile-nav__link" data-mobile-nav="cuenta" data-panel="perfil">
      Mi perfil
    </button>
    <button type="button" class="mobile-nav__link" data-mobile-nav="cuenta" data-panel="pedidos">
      Mis pedidos
    </button>
  `);

  if (document.getElementById('header-favoritos-btn')) {
    partes.push('<div class="mobile-nav__divider" role="separator"></div>');
    partes.push(`
      <button type="button" class="mobile-nav__link" data-mobile-nav="favoritos">
        Favoritos
      </button>
    `);
  }

  lista.innerHTML = partes.join('');
  sincronizarMenuMobileActivo();
}

function sincronizarMenuMobileActivo() {
  document.querySelectorAll('#mobile-nav-links [data-mobile-nav="seccion"]').forEach((btn) => {
    const activo = !filtroSoloOfertas && btn.dataset.seccion === categoriaFiltroActiva;
    btn.classList.toggle('is-active', activo);
  });

  document.querySelectorAll('#mobile-nav-links [data-mobile-nav="ofertas"]').forEach((btn) => {
    btn.classList.toggle('is-active', filtroSoloOfertas);
  });
}

function abrirMenuMobile() {
  const menu = document.getElementById('mobile-nav');
  const btn = document.getElementById('header-menu-btn');
  if (!menu || !btn) return;

  cerrarBuscadorMobile();
  renderizarEnlacesMenuMobile();
  menu.classList.add('is-open');
  menu.setAttribute('aria-hidden', 'false');
  btn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('mobile-nav-open');
  document.getElementById('mobile-nav-close')?.focus();
}

function cerrarMenuMobile() {
  const menu = document.getElementById('mobile-nav');
  const btn = document.getElementById('header-menu-btn');
  if (!menu) return;

  menu.classList.remove('is-open');
  menu.setAttribute('aria-hidden', 'true');
  btn?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('mobile-nav-open');

  if (btn && document.activeElement?.closest('#mobile-nav')) {
    btn.focus();
  }
}

function manejarClickMenuMobile(event) {
  const enlace = event.target.closest('[data-mobile-nav]');
  if (!enlace) return;

  const tipo = enlace.dataset.mobileNav;

  if (tipo === 'seccion') {
    filtrarPorSeccionCarousel(enlace.dataset.seccion || 'todos');
    cerrarMenuMobile();
    return;
  }

  if (tipo === 'ofertas') {
    filtrarPorOfertas();
    cerrarMenuMobile();
    return;
  }

  if (tipo === 'admin-panel') {
    cerrarMenuMobile();
    if (!esSesionAdminActiva()) return;
    if (esPaginaCuenta()) {
      window.location.href = 'index.html';
      return;
    }
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

  if (tipo === 'cuenta') {
    cerrarMenuMobile();
    const panel = enlace.dataset.panel || 'resumen';
    if (panel === 'ingresar') {
      document.getElementById('admin-access-btn')?.click();
      return;
    }
    navegarPanelCuenta(panel);
    return;
  }

  if (tipo === 'favoritos') {
    cerrarMenuMobile();
    document.getElementById('header-favoritos-btn')?.click();
  }
}

function esVistaMobile() {
  return window.matchMedia('(max-width: 768px)').matches;
}

function abrirBuscadorMobile() {
  const header = document.querySelector('.main-header');
  const toggle = document.getElementById('header-search-toggle');
  const panel = document.getElementById('header-search-panel');
  const input = document.getElementById('input-busqueda');
  if (!header || !toggle) return;

  cerrarMenuMobile();
  panel?.removeAttribute('hidden');
  header.classList.add('is-search-open');
  toggle.setAttribute('aria-expanded', 'true');
  window.dispatchEvent(new Event('header:remeasure'));

  requestAnimationFrame(() => {
    input?.focus({ preventScroll: true });
  });
}

function cerrarBuscadorMobile() {
  const header = document.querySelector('.main-header');
  const toggle = document.getElementById('header-search-toggle');
  const panel = document.getElementById('header-search-panel');
  const input = document.getElementById('input-busqueda');
  if (!header?.classList.contains('is-search-open')) return;

  header.classList.remove('is-search-open');
  panel?.setAttribute('hidden', '');
  toggle?.setAttribute('aria-expanded', 'false');
  ocultarSugerenciasBusqueda();
  window.dispatchEvent(new Event('header:remeasure'));

  if (document.activeElement === input) {
    input.blur();
  }
}

function alternarBuscadorMobile() {
  const header = document.querySelector('.main-header');
  if (!header) return;

  if (header.classList.contains('is-search-open')) {
    cerrarBuscadorMobile();
  } else {
    abrirBuscadorMobile();
  }
}

function inicializarBuscadorMobile() {
  const toggle = document.getElementById('header-search-toggle');
  const input = document.getElementById('input-busqueda');
  const header = document.querySelector('.main-header');
  if (!toggle || !input || !header || toggle.dataset.bound) return;
  toggle.dataset.bound = 'true';

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    alternarBuscadorMobile();
  });

  document.addEventListener('click', (event) => {
    if (!header.classList.contains('is-search-open')) return;
    if (event.target.closest('.header-search') || event.target.closest('#header-search-toggle')) return;
    cerrarBuscadorMobile();
  });

  let scrollTimer;
  window.addEventListener('scroll', () => {
    if (!header.classList.contains('is-search-open')) return;
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(cerrarBuscadorMobile, 80);
  }, { passive: true });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-search-open')) {
      cerrarBuscadorMobile();
      toggle.focus();
    }
  });
}

function inicializarMenuMobile() {
  const btn = document.getElementById('header-menu-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = 'true';

  crearPanelMenuMobile();
  renderizarEnlacesMenuMobile();

  btn.addEventListener('click', () => {
    const menu = document.getElementById('mobile-nav');
    if (menu?.classList.contains('is-open')) {
      cerrarMenuMobile();
    } else {
      abrirMenuMobile();
    }
  });

  document.getElementById('mobile-nav-close')?.addEventListener('click', cerrarMenuMobile);
  document.getElementById('mobile-nav-overlay')?.addEventListener('click', cerrarMenuMobile);
  document.getElementById('mobile-nav-links')?.addEventListener('click', manejarClickMenuMobile);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('mobile-nav')?.classList.contains('is-open')) {
      cerrarMenuMobile();
    }
  });
}

function inicializarHeaderScroll() {
  const header = document.querySelector('.main-header');
  if (!header) return;

  const obtenerAltura = () => {
    const fila = header.querySelector('.header-inner');
    const alto = fila?.offsetHeight || 70;
    document.documentElement.style.setProperty('--main-header-height', `${alto}px`);
    header.classList.remove('main-header--hidden');
    return alto;
  };

  window.addEventListener('resize', obtenerAltura);
  window.addEventListener('header:remeasure', obtenerAltura);
  obtenerAltura();
}

function inicializarBuscador() {
  const input = document.getElementById('input-busqueda');
  const dropdown = obtenerContenedorResultadosPredictivos();

  input?.addEventListener('input', (e) => {
    const valor = e.target.value;
    busquedaActiva = valor.toLowerCase().trim();
    solicitarRenderizadoProductos({ delay: 150 });

    clearTimeout(busquedaPredictivaTimer);
    busquedaPredictivaTimer = setTimeout(() => {
      buscarProductosPredictivo(valor);
    }, 300);
  });

  input?.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) {
      buscarProductosPredictivo(input.value);
    }
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      ocultarSugerenciasBusqueda();
      if (esVistaMobile() && document.querySelector('.main-header')?.classList.contains('is-search-open')) {
        cerrarBuscadorMobile();
        document.getElementById('header-search-toggle')?.focus();
      } else {
        input.blur();
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.search-bar')) {
      ocultarSugerenciasBusqueda();
    }
  });

  dropdown?.addEventListener('click', (event) => {
    const addBtn = event.target.closest('[data-suggestion-add]');
    if (addBtn) {
      event.stopPropagation();
      const id = Number(addBtn.dataset.suggestionAdd);
      const producto = productos.find((item) => item.id === id);
      if (producto) {
        registrarBusquedaProducto(producto.nombre);
        agregarAlCarrito(id);
        ocultarSugerenciasBusqueda();
        input.value = '';
        busquedaActiva = '';
        renderizarProductos();
      }
      return;
    }

    const item = event.target.closest('[data-suggestion-id]');
    if (!item) return;

    const id = Number(item.dataset.suggestionId);
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;

    registrarBusquedaProducto(producto.nombre);
    input.value = '';
    busquedaActiva = '';
    renderizarProductos();
    ocultarSugerenciasBusqueda();
    document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    abrirDetalleProducto(id);
  });
}

function inicializarBuscadorPedidos() {
  const input = document.getElementById('input-busqueda');
  if (!input) return;

  const irATienda = () => {
    const q = input.value.trim();
    window.location.href = q ? `index.html?q=${encodeURIComponent(q)}#coleccion` : 'index.html#coleccion';
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      irATienda();
    }
  });
}

async function cargarProductos(opciones = {}) {
  const incluirInactivos = Boolean(opciones.todos);
  const container = obtenerContenedorTienda();
  const mostrarSkeleton = !incluirInactivos && debeMostrarSkeletonTienda();

  if (mostrarSkeleton) {
    ++renderProductosToken;
    renderizarSkeletonProductos(container);
  }

  try {
    const ruta = incluirInactivos ? '/api/productos?todos=true' : '/api/productos';
    productos = await apiFetch(ruta);
    if (!incluirInactivos) {
      renderizarFiltrosCategorias(productos);
      renderizarCarruselSecciones();
    }
    return true;
  } catch {
    productos = [];
    if (!incluirInactivos) {
      renderizarFiltrosCategorias(productos);
      renderizarCarruselSecciones();
    }
    if (!incluirInactivos) {
      mostrarToast('Error de conexión con el servidor', 'error');
    }
    if (mostrarSkeleton && container) {
      container.innerHTML = `
        <p class="store-section__empty">No se pudieron cargar los productos. Intentá más tarde.</p>
      `;
    }
    return false;
  }
}

function actualizarContadorProductosAdmin() {
  const countEl = document.getElementById('products-count');
  if (!countEl) return;

  const total = productos.length;
  countEl.textContent = total === 1 ? '1 producto en catálogo' : `${total} productos en catálogo`;
}

function liberarPreviewPendiente(tipo) {
  if (tipo === 'frente' && previewPendienteFrente) {
    URL.revokeObjectURL(previewPendienteFrente);
    previewPendienteFrente = null;
  }
  if (tipo === 'espalda' && previewPendienteEspalda) {
    URL.revokeObjectURL(previewPendienteEspalda);
    previewPendienteEspalda = null;
  }
}

function resetearImagenesFormulario() {
  liberarPreviewPendiente('frente');
  liberarPreviewPendiente('espalda');
  imagenFrenteFormulario = '';
  imagenEspaldaFormulario = '';
  archivoPendienteFrente = null;
  archivoPendienteEspalda = null;

  ['frente', 'espalda'].forEach((tipo) => {
    const input = document.getElementById(`producto-imagen-${tipo}`);
    const nombreEl = document.getElementById(`producto-imagen-${tipo}-nombre`);
    const preview = document.getElementById(`producto-imagen-${tipo}-preview`);
    const thumb = document.getElementById(`producto-imagen-${tipo}-thumb`);

    if (input) {
      input.value = '';
      input.required = tipo === 'frente' && !editandoProductoId;
    }
    if (nombreEl) nombreEl.textContent = 'Sin imagen';
    if (preview) {
      preview.classList.add('hidden');
      preview.setAttribute('aria-hidden', 'true');
    }
    if (thumb) thumb.removeAttribute('src');
  });
}

function actualizarVistaPreviaImagenFormulario(tipo) {
  const preview = document.getElementById(`producto-imagen-${tipo}-preview`);
  const thumb = document.getElementById(`producto-imagen-${tipo}-thumb`);
  const nombreEl = document.getElementById(`producto-imagen-${tipo}-nombre`);
  const input = document.getElementById(`producto-imagen-${tipo}`);
  if (!preview || !thumb || !nombreEl) return;

  const urlGuardada = tipo === 'frente' ? imagenFrenteFormulario : imagenEspaldaFormulario;
  const archivoPendiente = tipo === 'frente' ? archivoPendienteFrente : archivoPendienteEspalda;
  const previewPendiente = tipo === 'frente' ? previewPendienteFrente : previewPendienteEspalda;
  const url = previewPendiente || urlGuardada;

  if (!url) {
    preview.classList.add('hidden');
    preview.setAttribute('aria-hidden', 'true');
    thumb.removeAttribute('src');
    nombreEl.textContent = 'Sin imagen';
    if (input) input.required = tipo === 'frente' && !editandoProductoId;
    return;
  }

  thumb.src = url;
  preview.classList.remove('hidden');
  preview.setAttribute('aria-hidden', 'false');
  if (input) input.required = false;

  if (archivoPendiente) {
    nombreEl.textContent = archivoPendiente.name;
  } else if (urlGuardada) {
    nombreEl.textContent = 'Imagen guardada';
  }
}

function quitarImagenFormulario(tipo) {
  if (tipo === 'frente') {
    liberarPreviewPendiente('frente');
    imagenFrenteFormulario = '';
    archivoPendienteFrente = null;
  } else {
    liberarPreviewPendiente('espalda');
    imagenEspaldaFormulario = '';
    archivoPendienteEspalda = null;
  }

  const input = document.getElementById(`producto-imagen-${tipo}`);
  if (input) input.value = '';
  actualizarVistaPreviaImagenFormulario(tipo);
}

function limpiarVistaPreviaImagen() {
  resetearImagenesFormulario();
}

function comprimirImagen(file, maxAncho = 800, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        const ratio = Math.min(1, maxAncho / img.width);
        const ancho = Math.round(img.width * ratio);
        const alto = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');

        canvas.width = ancho;
        canvas.height = alto;
        canvas.getContext('2d')?.drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL('image/jpeg', calidad));
      };

      img.onerror = () => reject(new Error('No se pudo procesar la imagen.'));
      img.src = e.target.result;
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function manejarSeleccionImagenProducto(event, tipo) {
  const archivo = (event.target.files || [])[0];
  event.target.value = '';

  if (!archivo) return;

  if (!archivo.type.startsWith('image/')) {
    mostrarToast('Seleccioná un archivo de imagen válido (JPG, PNG, WebP, etc.).', 'error');
    return;
  }

  if (tipo === 'frente') {
    liberarPreviewPendiente('frente');
    archivoPendienteFrente = archivo;
    previewPendienteFrente = URL.createObjectURL(archivo);
  } else {
    liberarPreviewPendiente('espalda');
    archivoPendienteEspalda = archivo;
    previewPendienteEspalda = URL.createObjectURL(archivo);
  }

  actualizarVistaPreviaImagenFormulario(tipo);
}

function abrirModalProducto(categoriaPreseleccionada = null) {
  const modal = document.getElementById('product-modal');
  if (!modal) return;

  editandoProductoId = null;
  const titleEl = document.getElementById('product-modal-title');
  if (titleEl) titleEl.textContent = 'Nuevo producto';

  document.getElementById('product-form')?.reset();
  restablecerFormularioProducto();
  resetearImagenesFormulario();
  renderizarSelectCategorias();

  if (categoriaPreseleccionada) {
    const categoriaSelect = document.getElementById('producto-categoria');
    if (categoriaSelect) categoriaSelect.value = categoriaPreseleccionada;
    sincronizarCategoriaTipoConSeccion(categoriaPreseleccionada);
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  document.getElementById('producto-nombre')?.focus();
  actualizarControlesOfertaFormulario();
}

function abrirModalEditar(id) {
  const producto = productos.find((p) => p.id === Number(id));
  if (!producto) return;

  const modal = document.getElementById('product-modal');
  if (!modal) return;

  if (document.getElementById('modal-detalle-seccion')?.classList.contains('is-open')) {
    ocultarModalDetalleSeccionTemporalmente();
  }

  editandoProductoId = producto.id;

  const titleEl = document.getElementById('product-modal-title');
  if (titleEl) titleEl.textContent = 'Editar Producto';

  renderizarSelectCategorias();

  const nombreInput = document.getElementById('producto-nombre');
  const precioInput = document.getElementById('producto-precio');
  const precioOfertaInput = document.getElementById('producto-precio-oferta');
  const categoriaSelect = document.getElementById('producto-categoria');
  const descripcionInput = document.getElementById('producto-descripcion');
  const urlFrente = document.getElementById('producto-imagen-frente-url');
  const urlEspalda = document.getElementById('producto-imagen-espalda-url');

  if (nombreInput) nombreInput.value = producto.nombre;
  if (precioInput) precioInput.value = producto.precio;
  const enOfertaSwitch = document.getElementById('producto-en-oferta');
  const tieneOferta = tieneOfertaValida(producto);
  if (enOfertaSwitch) enOfertaSwitch.checked = tieneOferta;
  if (precioOfertaInput) {
    precioOfertaInput.value = obtenerDescuentoOfertaFormulario(producto);
  }
  actualizarControlesOfertaFormulario();
  if (categoriaSelect) categoriaSelect.value = producto.categoria;
  const categoriaTipoSelect = document.getElementById('producto-categoria-tipo');
  if (categoriaTipoSelect) {
    categoriaTipoSelect.value = obtenerCategoriaTipoProducto(producto);
  }
  const generoSelect = document.getElementById('producto-genero');
  if (generoSelect) generoSelect.value = producto.genero || 'hombre';
  if (descripcionInput) descripcionInput.value = producto.descripcion || '';
  establecerStockTallesEnFormulario(producto);

  resetearImagenesFormulario();
  imagenFrenteFormulario = obtenerImagenFrente(producto);
  imagenEspaldaFormulario = obtenerImagenEspalda(producto);
  if (urlFrente) urlFrente.value = imagenFrenteFormulario || '';
  if (urlEspalda) urlEspalda.value = imagenEspaldaFormulario || '';
  actualizarVistaPreviaImagenFormulario('frente');
  actualizarVistaPreviaImagenFormulario('espalda');

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  nombreInput?.focus();
  actualizarControlesOfertaFormulario();
}

function cerrarModalProducto() {
  const modal = document.getElementById('product-modal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('product-modal-open');
  document.getElementById('product-form')?.reset();
  resetearImagenesFormulario();
  restablecerFormularioProducto();

  editandoProductoId = null;
  const titleEl = document.getElementById('product-modal-title');
  if (titleEl) titleEl.textContent = 'Nuevo producto';

  restaurarModalDetalleSeccionSiCorresponde();
}

async function guardarNuevoProducto(event) {
  event.preventDefault();

  const nombre = document.getElementById('producto-nombre')?.value.trim() ?? '';
  const precio = Number(document.getElementById('producto-precio')?.value);
  const enOfertaActiva = Boolean(document.getElementById('producto-en-oferta')?.checked);
  const descuentoOfertaRaw = enOfertaActiva
    ? (document.getElementById('producto-precio-oferta')?.value ?? '')
    : '';
  const categoria = document.getElementById('producto-categoria')?.value?.trim() ?? '';
  const genero = document.getElementById('producto-genero')?.value ?? 'hombre';
  const descripcion = document.getElementById('producto-descripcion')?.value.trim() ?? '';
  const stockTalles = obtenerStockTallesDelFormulario();
  const talles = obtenerTallesDelFormulario();
  const stock = Object.values(stockTalles).reduce((acc, n) => acc + n, 0);
  const categoriaTipo = obtenerCategoriaTipoDelFormulario();
  const tablaMedidas = obtenerTablaMedidasDelFormulario();
  const urlFrenteInput = document.getElementById('producto-imagen-frente-url')?.value.trim() ?? '';
  const urlEspaldaInput = document.getElementById('producto-imagen-espalda-url')?.value.trim() ?? '';
  const submitBtn = document.querySelector('#product-form .product-form__submit');

  if (nombre.length < 3) {
    mostrarToast('El nombre del producto debe tener al menos 3 caracteres.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio <= 0) {
    mostrarToast('Por favor, ingresá un precio válido mayor a $ 0.', 'error');
    return;
  }

  if (enOfertaActiva) {
    const precioOfertaIngresado = descuentoOfertaRaw === '' ? null : Number(descuentoOfertaRaw);
    if (descuentoOfertaRaw === '' || !Number.isFinite(precioOfertaIngresado) || precioOfertaIngresado <= 0) {
      mostrarToast('Con «En Oferta» activo, el precio de oferta es obligatorio.', 'error');
      document.getElementById('producto-precio-oferta')?.focus();
      return;
    }

    if (precioOfertaIngresado >= precio) {
      mostrarToast('El precio de oferta debe ser menor al precio regular.', 'error');
      return;
    }
  }

  if (!categoria) {
    mostrarToast('Seleccioná una sección para el producto.', 'error');
    return;
  }

  if (secciones.length === 0) {
    mostrarToast('Creá al menos una sección antes de agregar productos.', 'error');
    return;
  }

  if (!talles.length) {
    mostrarToast('Indicá stock en al menos un talle.', 'error');
    return;
  }

  if (urlFrenteInput) {
    imagenFrenteFormulario = urlFrenteInput;
  }
  if (urlEspaldaInput) {
    imagenEspaldaFormulario = urlEspaldaInput;
  }

  const esEdicion = editandoProductoId !== null;
  const tieneImagenFrente = Boolean(imagenFrenteFormulario || archivoPendienteFrente);

  if (!tieneImagenFrente) {
    mostrarToast('Subí al menos la imagen del frente del producto o pegá una URL.', 'error');
    return;
  }

  submitBtn?.setAttribute('disabled', 'true');

  try {
    let imagenFrente = imagenFrenteFormulario;
    let imagenEspalda = imagenEspaldaFormulario;

    if (archivoPendienteFrente) {
      imagenFrente = await subirImagenACloudinary(archivoPendienteFrente);
    }

    if (archivoPendienteEspalda) {
      imagenEspalda = await subirImagenACloudinary(archivoPendienteEspalda);
    }

    if (!imagenFrente) {
      mostrarToast('No se pudo obtener la imagen del frente.', 'error');
      return;
    }

    const precioOferta = enOfertaActiva
      ? normalizarPrecioOfertaFormulario(descuentoOfertaRaw, precio)
      : null;

    const payload = {
      nombre,
      precio,
      precioOferta: precioOferta !== null ? precioOferta : null,
      precio_oferta: precioOferta !== null ? precioOferta : null,
      categoria,
      categoriaTipo,
      genero,
      stock,
      stockTalles,
      descripcion,
      imagenFrente,
      imagenEspalda,
      talles,
      tablaMedidas,
      enOferta: precioOferta !== null,
    };

    if (esEdicion) {
      const productoActualizado = await apiFetch(`/api/productos/${editandoProductoId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      const indice = productos.findIndex((p) => p.id === editandoProductoId);
      if (indice !== -1) productos[indice] = productoActualizado;

      const precioEfectivo = obtenerPrecioEfectivo(productoActualizado);
      carrito.forEach((item) => {
        if (item.id === editandoProductoId) {
          item.nombre = productoActualizado.nombre;
          item.precio = precioEfectivo;
          item.imagen = obtenerImagenPrincipal(productoActualizado);
        }
      });
      guardarCarritoEnLocalStorage();

      cerrarModalProducto();
      await refrescarCatalogoTrasCambioAdmin();
      actualizarCarritoUI();
      mostrarToast('Producto actualizado');
      return;
    }

    await apiFetch('/api/productos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    cerrarModalProducto();
    await refrescarCatalogoTrasCambioAdmin();
    mostrarToast('Producto agregado correctamente.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo guardar el producto. Intentá de nuevo.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
}

function renderizarProductos() {
  const container = document.getElementById('store-sections-container');
  if (!container) return;

  if (secciones.length === 0 && productos.length === 0) {
    container.innerHTML = `
      <p class="store-section__empty">Todavía no hay productos disponibles en la tienda.</p>
    `;
    renderizarStadiumCarousel();
    actualizarUiFiltroColeccion();
    return;
  }

  const filtroEquipoOLigaActivo =
    filtroSoloOfertas || categoriaFiltroActiva !== 'todos' || Boolean(ligaFiltroActiva);

  if (filtroEquipoOLigaActivo) {
    const productosFiltrados = ordenarListaProductos(filtrarProductos(productos));

    if (!productosFiltrados.length) {
      const mensajeVacio = filtroSoloOfertas
        ? 'No hay ofertas disponibles por ahora.'
        : categoriaFiltroActiva !== 'todos'
          ? 'No hay productos en esta colección por ahora.'
          : `No hay productos de ${ligaFiltroActiva} por ahora.`;

      container.innerHTML = `<p class="store-section__empty">${mensajeVacio}</p>`;
      renderizarStadiumCarousel();
      actualizarUiFiltroColeccion();
      return;
    }

    container.innerHTML = `
      <div class="products-grid products-grid--filtrada" role="list">
        ${productosFiltrados.map(crearHtmlTarjetaProducto).join('')}
      </div>
    `;
    animarEntradaProductos(container);
    renderizarStadiumCarousel();
    actualizarUiFiltroColeccion();
    return;
  }

  const nombresSecciones = secciones.map((seccion) => seccion.nombre);
  const nombresCalzado = new Set(obtenerNombresCategoriasCalzado());
  const bloques = [];

  obtenerSeccionesGenerales().forEach((seccion) => {
    const productosSeccion = ordenarListaProductos(
      filtrarProductos(productos.filter((producto) => producto.categoria === seccion.nombre))
    );

    if (!productosSeccion.length) return;

    bloques.push(`
      <section class="store-section" id="seccion-${seccion.id}">
        <h3 class="store-section__title">${escaparHtmlTexto(seccion.nombre)}</h3>
        <div class="products-grid" role="list">${productosSeccion.map(crearHtmlTarjetaProducto).join('')}</div>
      </section>
    `);
  });

  const calzadoRaiz = obtenerSeccionCalzadoRaiz();
  const subtipos = obtenerSubtiposCalzado();
  if (calzadoRaiz) {
    const subBloques = [];

    subtipos.forEach((sub) => {
      const productosSub = ordenarListaProductos(
        filtrarProductos(productos.filter((producto) => producto.categoria === sub.nombre))
      );
      if (!productosSub.length) return;
      subBloques.push(`
        <div class="store-section__sub" id="seccion-${sub.id}">
          <h4 class="store-section__subtitle">${escaparHtmlTexto(sub.nombre)}</h4>
          <div class="products-grid" role="list">${productosSub.map(crearHtmlTarjetaProducto).join('')}</div>
        </div>
      `);
    });

    // Productos asignados directo a «Calzado» (legado / sin subtipo).
    const productosRaiz = ordenarListaProductos(
      filtrarProductos(productos.filter((producto) => producto.categoria === calzadoRaiz.nombre))
    );
    if (productosRaiz.length) {
      subBloques.unshift(`
        <div class="store-section__sub" id="seccion-${calzadoRaiz.id}-raiz">
          <div class="products-grid" role="list">${productosRaiz.map(crearHtmlTarjetaProducto).join('')}</div>
        </div>
      `);
    }

    if (subBloques.length) {
      bloques.push(`
        <section class="store-section store-section--calzado" id="seccion-${calzadoRaiz.id}">
          <h3 class="store-section__title">${escaparHtmlTexto(calzadoRaiz.nombre)}</h3>
          ${subBloques.join('')}
        </section>
      `);
    }
  }

  const productosSinSeccion = ordenarListaProductos(
    filtrarProductos(productos.filter((producto) => {
      const cat = producto.categoria;
      if (!cat) return true;
      if (nombresCalzado.has(cat)) return false;
      return !nombresSecciones.includes(cat);
    }))
  );

  if (productosSinSeccion.length) {
    bloques.push(`
      <section class="store-section" id="seccion-otros">
        <h3 class="store-section__title">Otros</h3>
        <div class="products-grid" role="list">
          ${productosSinSeccion.map(crearHtmlTarjetaProducto).join('')}
        </div>
      </section>
    `);
  }

  if (!bloques.length) {
    const mensajeVacio = busquedaActiva
      ? 'No encontramos productos que coincidan con tu búsqueda.'
      : categoriaFiltroActiva !== 'todos'
        ? 'No hay productos en esta colección por ahora.'
        : 'Todavía no hay productos disponibles en la tienda.';

    container.innerHTML = `<p class="store-section__empty">${mensajeVacio}</p>`;
    renderizarStadiumCarousel();
    actualizarUiFiltroColeccion();
    return;
  }

  container.innerHTML = bloques.join('');
  animarEntradaProductos(container);
  renderizarStadiumCarousel();
  actualizarUiFiltroColeccion();
}

function obtenerClaveCarritoUsuario(email) {
  return `${CARRITO_USUARIO_PREFIX}${normalizarEmail(email)}`;
}

function cargarCarritoDeSesion() {
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email || sesion.rol === 'admin') {
    carrito = [];
    return;
  }

  const clave = obtenerClaveCarritoUsuario(sesion.email);

  try {
    const guardado = localStorage.getItem(clave);
    if (guardado) {
      carrito = JSON.parse(guardado) || [];
      return;
    }

    const legacy = localStorage.getItem(CARRITO_LEGACY_KEY);
    if (legacy) {
      carrito = JSON.parse(legacy) || [];
      localStorage.setItem(clave, JSON.stringify(carrito));
      localStorage.removeItem(CARRITO_LEGACY_KEY);
      return;
    }

    carrito = [];
  } catch {
    carrito = [];
  }
}

function guardarCarritoEnLocalStorage() {
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email || sesion.rol === 'admin') return;

  const clave = obtenerClaveCarritoUsuario(sesion.email);
  localStorage.setItem(clave, JSON.stringify(carrito));
  localStorage.removeItem(CARRITO_LEGACY_KEY);
}

function vaciarCarritoDeSesion() {
  carrito = [];
  actualizarCarritoUI();
}

function calcularTotal() {
  return carrito.reduce((total, item) => total + item.precio * item.cantidad, 0);
}

function redondearMontoCheckout(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/** Payload de ítems del carrito para POST /api/cupones/validar */
function construirItemsCuponCheckout() {
  return carrito.map((item) => {
    const producto = productos.find(
      (p) => p.id === item.id || String(p.id) === String(item.id)
    );
    const seccionNombre = String(
      producto?.categoria || item.categoria || item.seccion || ''
    ).trim();
    const seccion = secciones.find(
      (s) => String(s.nombre || '').toLowerCase() === seccionNombre.toLowerCase()
    );
    const precio = Number(item.precio);
    const cantidad = Math.max(1, Number(item.cantidad) || 1);

    return {
      _id: item.id,
      id: item.id,
      seccion: seccionNombre,
      categoria: seccionNombre,
      seccionId: seccion?.id ?? null,
      precio: Number.isFinite(precio) ? precio : 0,
      cantidad,
    };
  });
}

function normalizarIdsElegiblesCupon(respuesta) {
  const raw = respuesta?.productosElegibles
    ?? respuesta?.itemsElegibles
    ?? respuesta?.idsElegibles
    ?? respuesta?.elegibles
    ?? null;

  if (!Array.isArray(raw)) return null;

  return raw
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'object') {
        return entry._id ?? entry.id ?? entry.productoId ?? null;
      }
      return entry;
    })
    .filter((id) => id != null && String(id).trim() !== '');
}

function obtenerMontoAplicableCupon(respuesta) {
  const candidatos = [
    respuesta?.montoAplicable,
    respuesta?.subtotalElegible,
    respuesta?.montoBase,
    respuesta?.baseDescuento,
  ];

  for (const valor of candidatos) {
    const n = Number(valor);
    if (Number.isFinite(n) && n >= 0) return redondearMontoCheckout(n);
  }
  return null;
}

function calcularBaseDescuentoCupon() {
  if (!cuponAplicado?.descuentoPorcentaje) return 0;

  if (
    cuponAplicado.montoAplicable != null
    && Number.isFinite(cuponAplicado.montoAplicable)
    && cuponAplicado.montoAplicable >= 0
  ) {
    return redondearMontoCheckout(cuponAplicado.montoAplicable);
  }

  if (Array.isArray(cuponAplicado.idsElegibles) && cuponAplicado.idsElegibles.length > 0) {
    const ids = new Set(cuponAplicado.idsElegibles.map((id) => String(id)));
    return redondearMontoCheckout(
      carrito.reduce((suma, item) => {
        if (!ids.has(String(item.id))) return suma;
        return suma + Number(item.precio) * Math.max(1, Number(item.cantidad) || 1);
      }, 0)
    );
  }

  const tipoFiltro = String(cuponAplicado.tipoFiltro || 'todos').toLowerCase();
  // Cupones segmentados sin montoBase del servidor: no inventar base = carrito completo.
  if (tipoFiltro === 'seccion' || tipoFiltro === 'producto') {
    return 0;
  }

  // tipoFiltro "todos" (y legacy sin filtro): aplica sobre todo el carrito.
  return redondearMontoCheckout(calcularTotal());
}

function calcularTotalConCupon() {
  const subtotal = redondearMontoCheckout(calcularTotal());
  if (!cuponAplicado?.descuentoPorcentaje) {
    return { subtotal, descuentoMonto: 0, totalFinal: subtotal, baseDescuento: 0 };
  }

  const pct = Number(cuponAplicado.descuentoPorcentaje);
  if (!Number.isFinite(pct) || pct < 1) {
    return { subtotal, descuentoMonto: 0, totalFinal: subtotal, baseDescuento: 0 };
  }

  const baseDescuento = calcularBaseDescuentoCupon();
  const descuentoMonto = Math.max(
    0,
    redondearMontoCheckout(baseDescuento * (pct / 100))
  );
  const totalFinal = Math.max(0, redondearMontoCheckout(subtotal - descuentoMonto));

  return { subtotal, descuentoMonto, totalFinal, baseDescuento };
}

function obtenerCodigoCuponCheckout() {
  return cuponAplicado?.codigo
    ? String(cuponAplicado.codigo).trim().toUpperCase()
    : '';
}

/**
 * Body compartido para POST /api/pagar y POST /api/pedidos.
 * El servidor revalida el cupón; el % del cliente es solo preview UI.
 */
function construirBodyCheckout(cliente, items, extras = {}) {
  const body = {
    cliente,
    items,
    ...extras,
  };

  const codigoCupon = obtenerCodigoCuponCheckout();
  if (codigoCupon) {
    body.codigoCupon = codigoCupon;
  }

  return body;
}

function setMensajeCuponCheckout(texto, tipo) {
  const msg = document.getElementById('checkout-cupon-msg');
  if (!msg) return;

  if (!texto) {
    msg.hidden = true;
    msg.textContent = '';
    msg.classList.remove('is-error', 'is-success');
    return;
  }

  msg.hidden = false;
  msg.textContent = texto;
  msg.classList.toggle('is-error', tipo === 'error');
  msg.classList.toggle('is-success', tipo === 'success');
}

function limpiarCuponCheckout() {
  cuponAplicado = null;
  const input = document.getElementById('input-cupon');
  if (input) input.value = '';
  setMensajeCuponCheckout('', null);
  actualizarTotalCheckoutUI();
}

function calcularDesgloseCheckout() {
  const { subtotal, descuentoMonto, totalFinal } = calcularTotalConCupon();
  const totalConCupon = Number(totalFinal) || 0;
  const descuentoCupon = Number(descuentoMonto) || 0;
  const descuentoTransferencia = redondearMontoCheckout(totalConCupon * 0.10);
  const totalTransferencia = Math.max(
    0,
    redondearMontoCheckout(totalConCupon - descuentoTransferencia)
  );
  const totalAhorrado = redondearMontoCheckout(descuentoCupon + descuentoTransferencia);

  return {
    subtotal,
    descuentoCupon,
    totalConCupon,
    descuentoTransferencia,
    totalTransferencia,
    totalAhorrado,
    codigoCupon: obtenerCodigoCuponCheckout(),
  };
}

function actualizarTotalCheckoutUI() {
  const {
    subtotal,
    descuentoCupon,
    totalConCupon,
    descuentoTransferencia,
    totalTransferencia,
    totalAhorrado,
    codigoCupon,
  } = calcularDesgloseCheckout();
  const summaryTotal = document.getElementById('checkout-summary-total');
  const subtotalRow = document.getElementById('checkout-summary-subtotal-row');
  const subtotalEl = document.getElementById('checkout-summary-subtotal');
  const descuentoRow = document.getElementById('checkout-summary-descuento-row');
  const descuentoEl = document.getElementById('checkout-summary-descuento');
  const descuentoLabel = document.getElementById('checkout-summary-descuento-label');

  if (summaryTotal) summaryTotal.textContent = formatearPrecio(totalConCupon);

  const hayDescuento = Boolean(cuponAplicado && descuentoCupon > 0);

  if (subtotalRow) subtotalRow.hidden = !hayDescuento;
  if (descuentoRow) descuentoRow.hidden = !hayDescuento;
  if (subtotalEl) subtotalEl.textContent = formatearPrecio(subtotal);
  if (descuentoEl) descuentoEl.textContent = `−${formatearPrecio(descuentoCupon)}`;
  if (descuentoLabel) {
    descuentoLabel.textContent = hayDescuento
      ? `Descuento por cupón${codigoCupon ? ` (${codigoCupon})` : ''}`
      : 'Descuento por cupón';
  }

  const totalConTransferenciaEl = document.getElementById('total-con-transferencia');
  const montoAhorradoEl = document.getElementById('monto-ahorrado-total');
  const contenedorAhorro = document.getElementById('contenedor-ahorro-transferencia');

  if (totalConTransferenciaEl) {
    totalConTransferenciaEl.textContent = formatearPrecio(totalTransferencia);
  }
  if (montoAhorradoEl) {
    montoAhorradoEl.textContent = formatearPrecio(totalAhorrado);
  }
  if (contenedorAhorro) {
    contenedorAhorro.style.display = totalAhorrado > 0 ? 'block' : 'none';
  }
}

async function aplicarCuponCheckout() {
  const input = document.getElementById('input-cupon');
  const btn = document.getElementById('btn-aplicar-cupon');
  const codigo = String(input?.value || '').trim().toUpperCase();

  if (!codigo) {
    cuponAplicado = null;
    setMensajeCuponCheckout('Ingresá un código de cupón.', 'error');
    actualizarTotalCheckoutUI();
    return;
  }

  if (!carrito.length) {
    cuponAplicado = null;
    setMensajeCuponCheckout('Tu carrito está vacío.', 'error');
    actualizarTotalCheckoutUI();
    return;
  }

  if (input) input.value = codigo;
  if (btn) btn.disabled = true;

  try {
    const items = construirItemsCuponCheckout();
    const respuesta = await apiFetch('/api/cupones/validar', {
      method: 'POST',
      body: JSON.stringify({ codigo, items }),
    });

    const descuentoPorcentaje = Number(respuesta?.descuentoPorcentaje);
    if (!respuesta?.valido || !Number.isFinite(descuentoPorcentaje) || descuentoPorcentaje < 1) {
      throw new Error('El código de cupón ingresado no es válido o ya ha expirado');
    }

    const idsElegibles = normalizarIdsElegiblesCupon(respuesta);
    const montoAplicable = obtenerMontoAplicableCupon(respuesta);

    if (
      Array.isArray(idsElegibles)
      && idsElegibles.length === 0
      && (montoAplicable == null || montoAplicable <= 0)
    ) {
      throw new Error('Este cupón no es válido para los productos en tu carrito');
    }

    cuponAplicado = {
      codigo: String(respuesta.codigo || codigo).trim().toUpperCase(),
      descuentoPorcentaje,
      tipoFiltro: String(respuesta.tipoFiltro || 'todos').toLowerCase(),
      idsElegibles,
      montoAplicable,
    };

    const { descuentoMonto, baseDescuento } = calcularTotalConCupon();
    if (descuentoMonto <= 0) {
      cuponAplicado = null;
      throw new Error('Este cupón no es válido para los productos en tu carrito');
    }

    const parcial = baseDescuento < redondearMontoCheckout(calcularTotal()) - 0.005;
    setMensajeCuponCheckout(
      parcial
        ? `Cupón ${cuponAplicado.codigo} aplicado (−${descuentoPorcentaje}% sobre productos elegibles).`
        : `Cupón ${cuponAplicado.codigo} aplicado (−${descuentoPorcentaje}%).`,
      'success'
    );
    actualizarTotalCheckoutUI();
  } catch (error) {
    cuponAplicado = null;
    setMensajeCuponCheckout(
      error?.message || 'El código de cupón ingresado no es válido o ya ha expirado',
      'error'
    );
    actualizarTotalCheckoutUI();
  } finally {
    if (btn) btn.disabled = false;
  }
}

function obtenerCantidadTotal() {
  return carrito.reduce((total, item) => total + item.cantidad, 0);
}

function actualizarContador() {
  const contador = document.getElementById('cart-count');
  if (!contador) return;

  const cantidad = obtenerCantidadTotal();
  contador.textContent = cantidad;
  contador.style.display = cantidad > 0 ? 'flex' : 'none';
}

function actualizarTotal() {
  const totalEl = document.getElementById('cart-total');
  const checkoutBtn = document.getElementById('cart-checkout');
  const total = calcularTotal();

  if (totalEl) totalEl.textContent = formatearPrecio(total);
  if (checkoutBtn) checkoutBtn.disabled = carrito.length === 0;
}

function renderizarCarrito() {
  const container = document.getElementById('cart-items-container');
  if (!container) return;

  if (carrito.length === 0) {
    container.innerHTML = `
      <div class="cart-drawer__empty">
        <p class="cart-drawer__empty-text">Tu carrito está vacío</p>
        <p class="cart-drawer__empty-hint">Explorá la colección y agregá tus piezas favoritas</p>
      </div>
    `;
    return;
  }

  container.innerHTML = carrito
    .map(
      (item) => {
        const nombreConTalle = item.talle ? `${item.nombre} — Talle ${item.talle}` : item.nombre;

        return `
        <article class="cart-item" data-id-talle="${item.id_talle}">
          <img
            class="cart-item__image"
            src="${obtenerImagenPrincipal({ imagen: item.imagen })}"
            alt="${nombreConTalle}"
            width="72"
            height="96"
          >
          <div class="cart-item__details">
            <h3 class="cart-item__name">${nombreConTalle}</h3>
            <p class="cart-item__price">${formatearPrecio(item.precio)} c/u</p>
            <p class="cart-item__subtotal">${formatearPrecio(item.precio * item.cantidad)}</p>
          </div>
          <div class="cart-item__actions">
            <button
              class="cart-item__remove"
              onclick="eliminarDelCarrito('${item.id_talle}')"
              aria-label="Eliminar ${nombreConTalle} del carrito"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
              </svg>
            </button>
            <div class="cart-item__quantity">
              <button
                class="cart-item__qty-btn"
                onclick="disminuirCantidad('${item.id_talle}')"
                aria-label="Disminuir cantidad de ${nombreConTalle}"
              >−</button>
              <span class="cart-item__qty-value">${item.cantidad}</span>
              <button
                class="cart-item__qty-btn"
                onclick="aumentarCantidad('${item.id_talle}')"
                aria-label="Aumentar cantidad de ${nombreConTalle}"
              >+</button>
            </div>
          </div>
        </article>
      `;
      }
    )
    .join('');
}

function actualizarCarritoUI() {
  actualizarContador();
  actualizarTotal();
  renderizarCarrito();
}

function abrirCarrito() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');

  overlay?.classList.add('is-open');
  drawer?.classList.add('is-open');
  overlay?.setAttribute('aria-hidden', 'false');
  drawer?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cart-open');
}

function cerrarCarrito() {
  const overlay = document.getElementById('cart-overlay');
  const drawer = document.getElementById('cart-drawer');

  overlay?.classList.remove('is-open');
  drawer?.classList.remove('is-open');
  overlay?.setAttribute('aria-hidden', 'true');
  drawer?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cart-open');
}

function abrirCheckout() {
  if (carrito.length === 0) return;

  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) {
    cerrarCarrito();
    mostrarToast('Para comprar tenés que iniciar sesión o registrarte.', 'error');
    abrirAuthModal();
    return;
  }

  prepararCheckoutModal(sesion);

  const modal = document.getElementById('checkout-modal');
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('checkout-open');
  cerrarCarrito();
}

function obtenerPerfilesEntrega() {
  try {
    return JSON.parse(localStorage.getItem(CHECKOUT_PERFIL_KEY)) || {};
  } catch {
    return {};
  }
}

function cargarPerfilEntrega(email) {
  const perfiles = obtenerPerfilesEntrega();
  return perfiles[normalizarEmail(email)] || {
    nombre: '',
    telefono: '',
    direccion: '',
    localidad: '',
    provincia: '',
    codigoPostal: '',
  };
}

function normalizarDatosEntrega(datos = {}) {
  return {
    nombre: String(datos.nombre || '').trim(),
    telefono: String(datos.telefono || '').trim(),
    direccion: String(datos.direccion || '').trim(),
    localidad: String(datos.localidad || '').trim(),
    provincia: String(datos.provincia || '').trim(),
    codigoPostal: String(datos.codigoPostal || '').trim().toUpperCase(),
  };
}

function guardarPerfilEntrega(email, datos) {
  const perfiles = obtenerPerfilesEntrega();
  perfiles[normalizarEmail(email)] = normalizarDatosEntrega(datos);
  localStorage.setItem(CHECKOUT_PERFIL_KEY, JSON.stringify(perfiles));
}

function perfilEntregaCompleto(perfil) {
  const datos = normalizarDatosEntrega(perfil);
  return Boolean(
    datos.nombre &&
    datos.telefono &&
    datos.direccion &&
    datos.localidad &&
    datos.provincia &&
    datos.codigoPostal
  );
}

function esCodigoPostalValido(codigoPostal) {
  return /^[A-Z]?\d{4}[A-Z]{0,3}$/i.test(String(codigoPostal || '').trim());
}

async function obtenerPerfilEntregaCompleto(email) {
  const local = cargarPerfilEntrega(email);
  if (perfilEntregaCompleto(local)) return local;

  try {
    const respuesta = await apiFetch('/api/auth/perfil');
    const perfil = normalizarDatosEntrega({
      nombre: respuesta.usuario?.nombre || '',
      telefono: respuesta.usuario?.telefono || '',
      direccion: respuesta.usuario?.direccion || '',
      localidad: respuesta.usuario?.localidad || '',
      provincia: respuesta.usuario?.provincia || '',
      codigoPostal: respuesta.usuario?.codigoPostal || '',
    });
    if (perfilEntregaCompleto(perfil)) {
      guardarPerfilEntrega(email, perfil);
      return perfil;
    }
  } catch {
    // Sin perfil en servidor todavía
  }

  return local;
}

async function guardarPerfilEntregaEnServidor(email, datos) {
  try {
    const normalizados = normalizarDatosEntrega(datos);
    await apiFetch('/api/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify({
        nombre: normalizados.nombre,
        telefono: normalizados.telefono,
        direccion: normalizados.direccion,
        localidad: normalizados.localidad,
        provincia: normalizados.provincia,
        codigoPostal: normalizados.codigoPostal,
      }),
    });
  } catch {
    // El pedido igual se registra; el perfil local ya quedó guardado
  }
}

function aplicarPerfilCheckout(perfil) {
  const datos = normalizarDatosEntrega(perfil);
  const nombreInput = document.getElementById('checkout-nombre');
  const telefonoInput = document.getElementById('checkout-telefono');
  const direccionInput = document.getElementById('checkout-direccion');
  const localidadInput = document.getElementById('checkout-localidad');
  const provinciaInput = document.getElementById('checkout-provincia');
  const codigoPostalInput = document.getElementById('checkout-codigo-postal');

  if (nombreInput) nombreInput.value = datos.nombre;
  if (telefonoInput) telefonoInput.value = datos.telefono;
  if (direccionInput) direccionInput.value = datos.direccion;
  if (localidadInput) localidadInput.value = datos.localidad;
  if (provinciaInput) provinciaInput.value = datos.provincia;
  if (codigoPostalInput) codigoPostalInput.value = datos.codigoPostal;
}

function renderizarResumenCheckout() {
  const container = document.getElementById('checkout-resumen');
  if (!container) return;

  if (!carrito.length) {
    container.innerHTML = '';
    return;
  }

  const itemsHtml = carrito
    .map((item) => {
      const nombre = item.talle ? `${item.nombre} — Talle ${item.talle}` : item.nombre;
      return `
        <li class="checkout-resumen__item">
          <span class="checkout-resumen__name">${nombre}</span>
          <span class="checkout-resumen__qty">x${item.cantidad}</span>
          <span class="checkout-resumen__price">${formatearPrecio(item.precio * item.cantidad)}</span>
        </li>
      `;
    })
    .join('');

  container.innerHTML = `
    <div class="checkout-resumen__header">
      <span class="checkout-resumen__title">Tu pedido</span>
      <span class="checkout-resumen__count">${obtenerCantidadTotal()} ${obtenerCantidadTotal() === 1 ? 'producto' : 'productos'}</span>
    </div>
    <ul class="checkout-resumen__list">${itemsHtml}</ul>
  `;
}

async function prepararCheckoutModal(sesion) {
  const cuentaEmail = document.getElementById('checkout-cuenta-email');
  const submitBtn = document.getElementById('checkout-submit-btn');
  const transferBtn = document.getElementById('checkout-transferencia-btn');
  const hint = document.getElementById('checkout-datos-hint');
  const guardarCheckbox = document.getElementById('checkout-guardar-datos');

  if (cuentaEmail) cuentaEmail.textContent = sesion.email;
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pagar con Mercado Pago';
  }
  if (transferBtn) {
    transferBtn.disabled = false;
    transferBtn.textContent = 'Coordinar por WhatsApp';
  }
  if (hint) {
    hint.textContent = 'Completá tus datos de entrega para continuar.';
  }

  // Reset cupón al abrir el checkout (preview UI; el servidor revalida al pagar).
  cuponAplicado = null;
  const inputCupon = document.getElementById('input-cupon');
  if (inputCupon) inputCupon.value = '';
  setMensajeCuponCheckout('', null);

  renderizarResumenCheckout();
  actualizarTotalCheckoutUI();

  const perfil = await obtenerPerfilEntregaCompleto(sesion.email);
  aplicarPerfilCheckout(perfil);
  if (guardarCheckbox) {
    guardarCheckbox.checked = perfilEntregaCompleto(perfil);
  }
}

function cerrarCheckout() {
  const modal = document.getElementById('checkout-modal');
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('checkout-open');
  limpiarCuponCheckout();
}

function validarFormularioCheckout() {
  if (carrito.length === 0) return { ok: false };

  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) {
    cerrarCheckout();
    mostrarToast('Para comprar tenés que iniciar sesión o registrarte.', 'error');
    abrirAuthModal();
    return { ok: false };
  }

  const nombre = document.getElementById('checkout-nombre').value.trim();
  const telefono = document.getElementById('checkout-telefono').value.trim();
  const direccion = document.getElementById('checkout-direccion').value.trim();
  const localidad = document.getElementById('checkout-localidad')?.value.trim() || '';
  const provincia = document.getElementById('checkout-provincia')?.value.trim() || '';
  const codigoPostal = (document.getElementById('checkout-codigo-postal')?.value || '').trim().toUpperCase();

  if (nombre.length <= 2) {
    mostrarToast('Por favor, ingresá tu nombre completo.', 'error');
    return { ok: false };
  }

  const telefonoSoloNumeros = normalizarTelefono(telefono);
  if (!telefono || /[a-zA-Z]/.test(telefono) || telefonoSoloNumeros.length < 8) {
    mostrarToast('Ingresá un número de teléfono válido (solo números).', 'error');
    return { ok: false };
  }

  if (!direccion) {
    mostrarToast('Por favor, ingresá la calle y número de entrega.', 'error');
    return { ok: false };
  }

  if (!localidad) {
    mostrarToast('Por favor, ingresá la localidad.', 'error');
    return { ok: false };
  }

  if (!provincia) {
    mostrarToast('Por favor, seleccioná la provincia.', 'error');
    return { ok: false };
  }

  if (!esCodigoPostalValido(codigoPostal)) {
    mostrarToast('Ingresá un código postal válido (ej: 1425 o C1425ABC).', 'error');
    return { ok: false };
  }

  return {
    ok: true,
    sesion,
    datosEntrega: {
      nombre,
      telefono: telefonoSoloNumeros,
      direccion,
      localidad,
      provincia,
      codigoPostal,
    },
    guardarDatos: Boolean(document.getElementById('checkout-guardar-datos')?.checked),
  };
}

async function procesarPedido(event) {
  event.preventDefault();
  const validacion = validarFormularioCheckout();
  if (!validacion.ok) return;

  const { sesion, datosEntrega, guardarDatos } = validacion;
  const submitBtn = document.getElementById('checkout-submit-btn');
  const transferBtn = document.getElementById('checkout-transferencia-btn');

  submitBtn?.setAttribute('disabled', 'true');
  transferBtn?.setAttribute('disabled', 'true');
  if (submitBtn) submitBtn.textContent = 'Redirigiendo a Mercado Pago…';

  try {
    if (guardarDatos) {
      guardarPerfilEntrega(sesion.email, datosEntrega);
      await guardarPerfilEntregaEnServidor(sesion.email, datosEntrega);
    }

    const items = carrito.map((item) => ({
      productoId: item.id,
      talle: item.talle,
      cantidad: item.cantidad,
    }));

    const respuestaPago = await apiFetch('/api/pagar', {
      method: 'POST',
      body: JSON.stringify(construirBodyCheckout(datosEntrega, items)),
    });

    if (!respuestaPago?.init_point) {
      throw new Error('No se recibió la URL de pago de Mercado Pago.');
    }

    carrito = [];
    cuponAplicado = null;
    guardarCarritoEnLocalStorage();
    actualizarCarritoUI();
    cerrarCheckout();
    cerrarCarrito();
    document.getElementById('checkout-form')?.reset();
    window.location.href = respuestaPago.init_point;
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo iniciar el pago. Intentá de nuevo.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
    transferBtn?.removeAttribute('disabled');
    if (submitBtn) submitBtn.textContent = 'Pagar con Mercado Pago';
  }
}

async function procesarPedidoTransferencia() {
  const validacion = validarFormularioCheckout();
  if (!validacion.ok) return;

  if (!WHATSAPP_NUMERO) {
    mostrarToast('WhatsApp no está configurado. Contactá a la tienda por otro medio.', 'error');
    return;
  }

  const { sesion, datosEntrega, guardarDatos } = validacion;
  const submitBtn = document.getElementById('checkout-submit-btn');
  const transferBtn = document.getElementById('checkout-transferencia-btn');

  submitBtn?.setAttribute('disabled', 'true');
  transferBtn?.setAttribute('disabled', 'true');
  if (transferBtn) transferBtn.textContent = 'Creando pedido…';

  try {
    if (guardarDatos) {
      guardarPerfilEntrega(sesion.email, datosEntrega);
      await guardarPerfilEntregaEnServidor(sesion.email, datosEntrega);
    }

    const items = carrito.map((item) => ({
      productoId: item.id,
      talle: item.talle,
      cantidad: item.cantidad,
    }));

    const pedido = await apiFetch('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify(construirBodyCheckout(datosEntrega, items, { metodoPago: 'Transferencia' })),
    });

    abrirWhatsAppTransferencia({
      idPedido: pedido.numeroPedido || pedido.id,
      nombre: datosEntrega.nombre,
      telefono: datosEntrega.telefono,
      direccion: datosEntrega.direccion,
      localidad: datosEntrega.localidad,
      provincia: datosEntrega.provincia,
      codigoPostal: datosEntrega.codigoPostal,
      productos: pedido.productos || [],
      total: pedido.total,
    });

    carrito = [];
    cuponAplicado = null;
    guardarCarritoEnLocalStorage();
    actualizarCarritoUI();
    cerrarCheckout();
    cerrarCarrito();
    document.getElementById('checkout-form')?.reset();
    mostrarToast('Pedido creado. Coordiná la transferencia por WhatsApp.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo crear el pedido. Intentá de nuevo.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
    transferBtn?.removeAttribute('disabled');
    if (transferBtn) transferBtn.textContent = 'Coordinar por WhatsApp';
  }
}

function abrirWhatsAppTransferencia({
  idPedido,
  nombre,
  telefono,
  direccion,
  localidad,
  provincia,
  codigoPostal,
  productos,
  total,
}) {
  const emojiCarrito = `\u{1F6D2}`;
  const emojiCliente = `\u{1F464}`;
  const emojiTelefono = `\u{1F4DE}`;
  const emojiEntrega = `\u{1F4CD}`;
  const emojiPago = `\u{1F4B3}`;
  const emojiDetalle = `\u{1F4E6}`;
  const emojiTotal = `\u{1F4B0}`;

  const textoEntrega = [direccion, localidad, provincia, codigoPostal]
    .filter(Boolean)
    .length
    ? `Envío a domicilio (${[direccion, localidad, provincia, codigoPostal].filter(Boolean).join(', ')})`
    : 'Retiro en local';

  const itemsDetalle = (productos || [])
    .map((item) => {
      const nombreLinea = item.talle
        ? `${item.cantidad}x ${item.nombre} - Talle ${item.talle}`
        : `${item.cantidad}x ${item.nombre}`;
      return `• ${nombreLinea} (${formatearPrecio(item.precio)})`;
    })
    .join('\n');

  const mensaje =
`${emojiCarrito} *NUEVO PEDIDO: ${idPedido}*
---------------------------------
${emojiCliente} *Cliente:* ${nombre}
${emojiTelefono} *Teléfono:* ${telefono}
${emojiEntrega} *Entrega:* ${textoEntrega}
${emojiPago} *Pago:* Transferencia bancaria (-10%)
---------------------------------
${emojiDetalle} *Detalle del Pedido:*
${itemsDetalle}
---------------------------------
${emojiTotal} *Total a Pagar: ${formatearPrecio(total)}*`;

  const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function buscarPedidos(telefono) {
  const telefonoNormalizado = normalizarTelefono(telefono);
  return pedidos.filter(
    (pedido) => normalizarTelefono(pedido.cliente.telefono) === telefonoNormalizado
  );
}

function crearTablaPedidosHtml(contenidoFilas) {
  return `
    <div class="tracking-orders-table-wrapper" role="region" aria-label="Estado de tus pedidos">
      <table class="orders-table" aria-label="Tabla de estados de pedidos">
        <thead>
          <tr>
            <th scope="col">Pedido</th>
            <th scope="col">Fecha</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${contenidoFilas}
        </tbody>
      </table>
    </div>
  `;
}

function renderizarTablaPedidosVacia(mensaje) {
  const container = document.getElementById('tracking-results');
  if (!container) return;

  container.innerHTML = crearTablaPedidosHtml(`
    <tr>
      <td colspan="3" class="orders-table__empty">${mensaje}</td>
    </tr>
  `);
}

function renderizarPedidos(pedidosFiltrados) {
  const container = document.getElementById('tracking-results');
  if (!container) return;

  if (pedidosFiltrados.length === 0) {
    renderizarTablaPedidosVacia('Todavía no tenés pedidos en esta cuenta.');
    return;
  }

  const pedidosOrdenados = [...pedidosFiltrados].sort(
    (a, b) => new Date(b.fecha) - new Date(a.fecha)
  );

  container.innerHTML = crearTablaPedidosHtml(
    pedidosOrdenados
      .map((pedido) => {
        const claseEstado = obtenerClaseEstado(pedido.estado);
        const etiquetaEstado = obtenerEtiquetaEstado(pedido.estado);

        return `
          <tr>
            <td class="orders-table__id">#${pedido.numeroPedido || pedido.id}</td>
            <td class="orders-table__date">${formatearFecha(pedido.fecha)}</td>
            <td class="orders-table__status">
              <span
                class="order-card__badge order-card__badge--${claseEstado}"
                title="Estado: ${escaparAtributoHtml(pedido.estado)}"
              >${etiquetaEstado}</span>
            </td>
          </tr>
        `;
      })
      .join('')
  );
}

async function manejarBusquedaPedidos(event) {
  event.preventDefault();
  await cargarPedidosDeCuenta();
}

async function cargarPedidosDeCuenta() {
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) {
    pedidos = [];
    renderizarTablaPedidosVacia('Iniciá sesión para ver los pedidos de tu cuenta.');
    actualizarUiPedidosCuenta();
    return false;
  }

  renderizarTablaPedidosVacia('Cargando tus pedidos…');
  actualizarUiPedidosCuenta();

  try {
    const misPedidos = await apiFetch('/api/pedidos/mios');
    pedidos = misPedidos;
    renderizarPedidos(misPedidos);
    if (esPaginaCuenta()) {
      actualizarResumenCuenta({
        email: sesion.email,
        nombre: document.getElementById('cuenta-perfil-nombre')?.value.trim(),
        telefono: document.getElementById('cuenta-perfil-telefono')?.value.trim(),
      });
    }
    return true;
  } catch (error) {
    pedidos = [];
    mostrarToast(error?.message || 'No se pudieron cargar tus pedidos.', 'error');
    renderizarTablaPedidosVacia(
      'No se pudieron cargar tus pedidos. Verificá que el servidor esté activo.'
    );
    return false;
  }
}

function esPaginaCuenta() {
  return document.body?.dataset?.page === 'cuenta';
}

const CUENTA_PANELS = ['resumen', 'perfil', 'pedidos', 'configuracion'];

function obtenerPanelCuentaDesdeHash() {
  const hash = (window.location.hash || '').replace('#', '');
  return CUENTA_PANELS.includes(hash) ? hash : 'resumen';
}

function mostrarPanelCuenta(panel) {
  const nombre = CUENTA_PANELS.includes(panel) ? panel : 'resumen';

  document.querySelectorAll('.header-cuenta-dropdown__item[data-cuenta-panel]').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.cuentaPanel === nombre);
  });

  if (!esPaginaCuenta()) return;

  document.querySelectorAll('.cuenta-panel[data-cuenta-panel]').forEach((el) => {
    el.hidden = el.dataset.cuentaPanel !== nombre;
  });

  const hash = `#${nombre}`;
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

function actualizarUiCuenta() {
  const loginPrompt = document.getElementById('cuenta-login-prompt');
  const layout = document.getElementById('cuenta-layout');
  const btnLogin = document.getElementById('cuenta-btn-login');
  const logueado = esSesionClienteActiva();

  loginPrompt?.classList.toggle('hidden', logueado);
  layout?.classList.toggle('hidden', !logueado);

  if (btnLogin && !btnLogin.dataset.bound) {
    btnLogin.addEventListener('click', () => abrirAuthModal());
    btnLogin.dataset.bound = 'true';
  }
}

function rellenarFormularioPerfil(perfil) {
  const datos = normalizarDatosEntrega(perfil);
  const emailInput = document.getElementById('cuenta-perfil-email');
  const nombreInput = document.getElementById('cuenta-perfil-nombre');
  const telefonoInput = document.getElementById('cuenta-perfil-telefono');
  const direccionInput = document.getElementById('cuenta-perfil-direccion');
  const localidadInput = document.getElementById('cuenta-perfil-localidad');
  const provinciaInput = document.getElementById('cuenta-perfil-provincia');
  const codigoPostalInput = document.getElementById('cuenta-perfil-codigo-postal');
  const prefPedidos = document.getElementById('cuenta-pref-pedidos');
  const prefPromos = document.getElementById('cuenta-pref-promos');

  if (emailInput) emailInput.value = perfil?.email || '';
  if (nombreInput) nombreInput.value = datos.nombre;
  if (telefonoInput) telefonoInput.value = datos.telefono;
  if (direccionInput) direccionInput.value = datos.direccion;
  if (localidadInput) localidadInput.value = datos.localidad;
  if (provinciaInput) provinciaInput.value = datos.provincia;
  if (codigoPostalInput) codigoPostalInput.value = datos.codigoPostal;
  if (prefPedidos) prefPedidos.checked = perfil?.preferencias?.emailsPedidos !== false;
  if (prefPromos) prefPromos.checked = perfil?.preferencias?.emailsPromos !== false;
}

function actualizarResumenCuenta(perfil = {}) {
  const pedidosEl = document.getElementById('cuenta-resumen-pedidos');
  const perfilEl = document.getElementById('cuenta-resumen-perfil');
  const hintEl = document.getElementById('cuenta-resumen-perfil-hint');

  if (pedidosEl) pedidosEl.textContent = String(pedidos.length);

  const completo = Boolean(perfil.nombre && perfil.telefono);
  if (perfilEl) perfilEl.textContent = completo ? 'Completo' : 'Pendiente';
  if (hintEl) {
    hintEl.textContent = completo
      ? (perfil.nombre || perfil.email || '')
      : 'Completá nombre y teléfono';
  }
}

async function cargarPerfilUsuario() {
  const sesion = obtenerSesionUsuario();
  if (!esSesionClienteActiva()) return null;

  try {
    const respuesta = await apiFetch('/api/auth/perfil');
    const usuario = respuesta.usuario;
    const local = cargarPerfilEntrega(sesion.email);
    const perfil = {
      ...usuario,
      ...normalizarDatosEntrega({
        nombre: usuario.nombre || local.nombre,
        telefono: usuario.telefono || local.telefono,
        direccion: usuario.direccion || local.direccion,
        localidad: usuario.localidad || local.localidad,
        provincia: usuario.provincia || local.provincia,
        codigoPostal: usuario.codigoPostal || local.codigoPostal,
      }),
    };

    rellenarFormularioPerfil(perfil);
    actualizarResumenCuenta(perfil);
    return perfil;
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo cargar tu perfil.', 'error');
    return null;
  }
}

async function guardarPerfilUsuario(event) {
  event.preventDefault();
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) return;

  const nombre = document.getElementById('cuenta-perfil-nombre')?.value.trim() || '';
  const telefono = document.getElementById('cuenta-perfil-telefono')?.value.trim() || '';
  const direccion = document.getElementById('cuenta-perfil-direccion')?.value.trim() || '';
  const localidad = document.getElementById('cuenta-perfil-localidad')?.value.trim() || '';
  const provincia = document.getElementById('cuenta-perfil-provincia')?.value.trim() || '';
  const codigoPostal = (document.getElementById('cuenta-perfil-codigo-postal')?.value || '').trim().toUpperCase();
  const errorEl = document.getElementById('cuenta-perfil-error');
  const btn = document.getElementById('cuenta-perfil-guardar');

  if (codigoPostal && !esCodigoPostalValido(codigoPostal)) {
    if (errorEl) {
      errorEl.textContent = 'Ingresá un código postal válido (ej: 1425 o C1425ABC).';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  const datosEntrega = { nombre, telefono, direccion, localidad, provincia, codigoPostal };

  btn?.setAttribute('disabled', 'true');
  errorEl?.classList.add('hidden');

  try {
    const respuesta = await apiFetch('/api/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify(datosEntrega),
    });

    guardarPerfilEntrega(sesion.email, datosEntrega);
    rellenarFormularioPerfil(respuesta.usuario);
    actualizarResumenCuenta(respuesta.usuario);
    mostrarToast('Perfil actualizado.');
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message || 'No se pudo guardar el perfil.';
      errorEl.classList.remove('hidden');
    }
    mostrarToast(error?.message || 'No se pudo guardar el perfil.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

async function guardarPreferenciasCuenta() {
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) return;

  const emailsPedidos = document.getElementById('cuenta-pref-pedidos')?.checked ?? true;
  const emailsPromos = document.getElementById('cuenta-pref-promos')?.checked ?? true;
  const errorEl = document.getElementById('cuenta-pref-error');
  const btn = document.getElementById('cuenta-pref-guardar');

  btn?.setAttribute('disabled', 'true');
  errorEl?.classList.add('hidden');

  try {
    const respuesta = await apiFetch('/api/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify({
        preferencias: { emailsPedidos, emailsPromos },
      }),
    });

    rellenarFormularioPerfil(respuesta.usuario);
    mostrarToast('Preferencias guardadas.');
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message || 'No se pudieron guardar las preferencias.';
      errorEl.classList.remove('hidden');
    }
    mostrarToast(error?.message || 'No se pudieron guardar las preferencias.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

async function cambiarPasswordCuenta(event) {
  event.preventDefault();
  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) return;

  const passwordActual = document.getElementById('cuenta-password-actual')?.value || '';
  const passwordNueva = document.getElementById('cuenta-password-nueva')?.value || '';
  const passwordConfirmar = document.getElementById('cuenta-password-confirmar')?.value || '';
  const errorEl = document.getElementById('cuenta-password-error');
  const btn = document.querySelector('#cuenta-password-form button[type="submit"]');

  errorEl?.classList.add('hidden');

  if (passwordNueva.length < 6) {
    if (errorEl) {
      errorEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (passwordNueva !== passwordConfirmar) {
    if (errorEl) {
      errorEl.textContent = 'Las contraseñas nuevas no coinciden.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  btn?.setAttribute('disabled', 'true');

  try {
    await apiFetch('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({
        passwordActual,
        passwordNueva,
      }),
    });

    document.getElementById('cuenta-password-form')?.reset();
    mostrarToast('Contraseña actualizada correctamente.');
  } catch (error) {
    if (errorEl) {
      errorEl.textContent = error?.message || 'No se pudo cambiar la contraseña.';
      errorEl.classList.remove('hidden');
    }
    mostrarToast(error?.message || 'No se pudo cambiar la contraseña.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

function inicializarCuenta() {
  actualizarUiCuenta();
  mostrarPanelCuenta(obtenerPanelCuentaDesdeHash());

  document.querySelectorAll('[data-cuenta-goto]').forEach((btn) => {
    btn.addEventListener('click', () => mostrarPanelCuenta(btn.dataset.cuentaGoto));
  });

  document.getElementById('cuenta-perfil-form')?.addEventListener('submit', guardarPerfilUsuario);
  document.getElementById('cuenta-pref-guardar')?.addEventListener('click', guardarPreferenciasCuenta);
  document.getElementById('cuenta-password-form')?.addEventListener('submit', cambiarPasswordCuenta);

  window.addEventListener('hashchange', () => {
    mostrarPanelCuenta(obtenerPanelCuentaDesdeHash());
  });

  if (esSesionClienteActiva()) {
    cargarPerfilUsuario().then(() => cargarPedidosDeCuenta());
  } else {
    renderizarTablaPedidosVacia('Iniciá sesión para ver los pedidos de tu cuenta.');
  }
}

function actualizarUiPedidosCuenta() {
  if (esPaginaCuenta()) {
    actualizarUiCuenta();
    return;
  }
  actualizarUiTrackingCuenta();
}

function actualizarUiTrackingCuenta() {
  const sesion = obtenerSesionUsuario();
  const loginPrompt = document.getElementById('tracking-login-prompt');
  const cuentaInfo = document.getElementById('tracking-cuenta-info');
  const cuentaEmail = document.getElementById('tracking-cuenta-email');
  const btnLogin = document.getElementById('tracking-btn-login');

  if (loginPrompt) {
    loginPrompt.classList.toggle('hidden', Boolean(sesion?.email));
  }

  if (cuentaInfo) {
    cuentaInfo.classList.toggle('hidden', !sesion?.email);
  }

  if (cuentaEmail) {
    cuentaEmail.textContent = sesion?.email || '';
  }

  if (btnLogin && !btnLogin.dataset.bound) {
    btnLogin.addEventListener('click', () => abrirAuthModal());
    btnLogin.dataset.bound = 'true';
  }
}

function agregarAlCarrito(id) {
  if (!esSesionClienteActiva()) {
    mostrarToast('Para agregar productos al carrito tenés que iniciar sesión.', 'error');
    abrirAuthModal();
    return;
  }

  const producto = productos.find((p) => p.id === id);
  if (!producto || !productoTieneStock(producto)) return;

  const talles = obtenerTallesProducto(producto);
  const talle = tallesSeleccionados[id];

  if (talles.length && !talle) {
    mostrarToast('Por favor, seleccioná un talle.', 'error');
    return;
  }

  const id_talle = talle ? `${id}-${talle}` : String(id);
  const itemExistente = carrito.find((item) => item.id_talle === id_talle);

  if (itemExistente) {
    itemExistente.cantidad += 1;
  } else {
    carrito.push({
      id: producto.id,
      id_talle,
      talle: talle || null,
      nombre: producto.nombre,
      precio: obtenerPrecioEfectivo(producto),
      imagen: obtenerImagenPrincipal(producto),
      cantidad: 1,
    });
  }

  guardarCarritoEnLocalStorage();
  actualizarCarritoUI();
  mostrarToast(producto.nombre, 'success', {
    titulo: 'Agregado al carrito',
  });
  abrirCarrito();

  const btn = document.querySelector(`.product-card[data-id="${id}"] .product-card__add-btn`);
  if (btn && !btn.disabled) {
    const textoOriginal = btn.textContent.trim();
    btn.textContent = '✓ ¡Agregado!';
    btn.classList.add('btn-success-soft');
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.classList.remove('btn-success-soft');
    }, 1500);
  }

  const contador = document.getElementById('cart-count');
  if (contador) {
    contador.classList.add('cart-icon-animate');
    setTimeout(() => contador.classList.remove('cart-icon-animate'), 400);
  }
}

function aumentarCantidad(id_talle) {
  const item = carrito.find((i) => i.id_talle === id_talle);
  if (!item) return;

  item.cantidad += 1;
  guardarCarritoEnLocalStorage();
  actualizarCarritoUI();
}

function disminuirCantidad(id_talle) {
  const item = carrito.find((i) => i.id_talle === id_talle);
  if (!item) return;

  if (item.cantidad > 1) {
    item.cantidad -= 1;
  } else {
    carrito = carrito.filter((i) => i.id_talle !== id_talle);
  }

  guardarCarritoEnLocalStorage();
  actualizarCarritoUI();
}

function eliminarDelCarrito(id_talle) {
  carrito = carrito.filter((item) => item.id_talle !== id_talle);
  guardarCarritoEnLocalStorage();
  actualizarCarritoUI();
}

function inicializarCarrito() {
  const cartBtn = document.getElementById('cart-btn');
  const cartClose = document.getElementById('cart-close');
  const cartOverlay = document.getElementById('cart-overlay');
  const checkoutBtn = document.getElementById('cart-checkout');

  cartBtn?.addEventListener('click', abrirCarrito);
  cartClose?.addEventListener('click', cerrarCarrito);
  cartOverlay?.addEventListener('click', cerrarCarrito);
  checkoutBtn?.addEventListener('click', abrirCheckout);

  actualizarCarritoUI();
}

function inicializarCheckout() {
  const modalClose = document.getElementById('checkout-modal-close');
  const modalOverlay = document.getElementById('checkout-modal-overlay');
  const btnAplicarCupon = document.getElementById('btn-aplicar-cupon');
  const inputCupon = document.getElementById('input-cupon');

  modalClose?.addEventListener('click', cerrarCheckout);
  modalOverlay?.addEventListener('click', cerrarCheckout);
  btnAplicarCupon?.addEventListener('click', aplicarCuponCheckout);
  inputCupon?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      aplicarCuponCheckout();
    }
  });
  document.getElementById('checkout-transferencia-btn')?.addEventListener('click', procesarPedidoTransferencia);
}

/* ── Página de información ── */

const PANELES_INFO = ['nosotros', 'envios', 'cambios', 'contacto'];

function obtenerPanelInfoDesdeHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash === 'terminos') return 'cambios';
  return PANELES_INFO.includes(hash) ? hash : 'nosotros';
}

function mostrarPanelInfo(panelId) {
  if (!PANELES_INFO.includes(panelId)) return;

  document.querySelectorAll('.info-panel[data-info-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.infoPanel !== panelId;
  });

  document.querySelectorAll('#info-nav [data-info-panel]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.infoPanel === panelId);
  });

  if (window.location.hash !== `#${panelId}`) {
    history.replaceState(null, '', `#${panelId}`);
  }
}

async function enviarFormularioContacto(event) {
  event.preventDefault();

  const nombre = document.getElementById('contacto-nombre')?.value?.trim() || '';
  const email = document.getElementById('contacto-email')?.value?.trim() || '';
  const mensaje = document.getElementById('contacto-mensaje')?.value?.trim() || '';
  const submitBtn = document.getElementById('contacto-submit-btn');

  if (!nombre || !email || !mensaje) {
    mostrarToast('Completá todos los campos del formulario.', 'error');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
  }

  try {
    await apiFetch('/api/contacto', {
      method: 'POST',
      body: JSON.stringify({ nombre, email, mensaje }),
    });

    document.getElementById('contacto-form')?.reset();
    mostrarToast('¡Mensaje enviado! Nos contactaremos a la brevedad');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo enviar el mensaje. Intentá de nuevo.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar Mensaje';
    }
  }
}

function inicializarInfo() {
  mostrarPanelInfo(obtenerPanelInfoDesdeHash());

  document.getElementById('info-nav')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-info-panel]');
    if (!btn || btn.tagName === 'A') return;
    mostrarPanelInfo(btn.dataset.infoPanel);
  });

  window.addEventListener('hashchange', () => {
    mostrarPanelInfo(obtenerPanelInfoDesdeHash());
  });

  document.getElementById('contacto-form')?.addEventListener('submit', enviarFormularioContacto);
}

function inicializarTracking() {
  const trackingForm = document.getElementById('tracking-form');
  trackingForm?.addEventListener('submit', manejarBusquedaPedidos);
  actualizarUiTrackingCuenta();
  cargarPedidosDeCuenta();
}

function inicializarTeclado() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;

    const authModal = document.getElementById('auth-modal');
    if (authModal?.classList.contains('is-open')) {
      cerrarAuthModal();
      return;
    }

    const orderModal = document.getElementById('order-modal');
    if (orderModal?.classList.contains('is-open')) {
      cerrarModalPedido();
      return;
    }

    const productModal = document.getElementById('product-modal');
    if (productModal && !productModal.classList.contains('hidden')) {
      cerrarModalProducto();
      return;
    }

    const checkoutModal = document.getElementById('checkout-modal');
    if (checkoutModal?.classList.contains('is-open')) {
      cerrarCheckout();
      return;
    }

    const modalCrearSeccion = document.getElementById('modal-crear-seccion');
    if (modalCrearSeccion?.classList.contains('is-open')) {
      cerrarModalCrearSeccion();
      return;
    }

    const modalDetalleSeccion = document.getElementById('modal-detalle-seccion');
    if (modalDetalleSeccion?.classList.contains('is-open')) {
      cerrarModalDetalleSeccion();
      return;
    }

    const modalAgregarProductoExistente = document.getElementById('modal-agregar-producto-existente');
    if (modalAgregarProductoExistente?.classList.contains('is-open')) {
      cerrarModalAgregarProductoExistente();
      return;
    }

    const sizeChartModal = document.getElementById('size-chart-modal');
    if (sizeChartModal?.classList.contains('is-open')) {
      cerrarTablaMedidas();
      return;
    }

    const productDetailModal = document.getElementById('product-detail-modal');
    if (productDetailModal?.classList.contains('is-open')) {
      cerrarDetalleProducto();
      return;
    }

    cerrarCarrito();
  });
}

/* ── Autenticación híbrida ── */

function normalizarEmail(email) {
  return email.trim().toLowerCase();
}

function obtenerSesionUsuario() {
  try {
    const sesion =
      sessionStorage.getItem(SESSION_USER_KEY) || localStorage.getItem(SESSION_USER_KEY);
    return sesion ? JSON.parse(sesion) : null;
  } catch {
    return null;
  }
}

function decodificarPayloadJwt(token) {
  try {
    let parte = String(token || '').split('.')[1];
    if (!parte) return null;

    parte = parte.replace(/-/g, '+').replace(/_/g, '/');
    const resto = parte.length % 4;
    if (resto) {
      parte += '='.repeat(4 - resto);
    }

    const json = atob(parte);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function tokenJwtVigente(token) {
  if (!token) return false;

  const payload = decodificarPayloadJwt(token);
  // Si no se puede leer el payload, no invalidamos en el cliente:
  // el servidor decide si el token es válido.
  if (!payload) return true;
  if (!payload.exp) return true;

  return Number(payload.exp) * 1000 > Date.now() + 5000;
}

function limpiarSesionLocal() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(CLIENTE_TOKEN_KEY);
}

function establecerSesion(usuario, token = null) {
  const payload = JSON.stringify({
    email: usuario.email,
    rol: usuario.rol,
  });
  sessionStorage.setItem(SESSION_USER_KEY, payload);
  localStorage.setItem(SESSION_USER_KEY, payload);

  if (usuario.rol === 'admin' && token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.removeItem(CLIENTE_TOKEN_KEY);
  } else if (token) {
    localStorage.setItem(CLIENTE_TOKEN_KEY, token);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

function esSesionAdminActiva() {
  const sesion = obtenerSesionUsuario();
  const tokenAdmin = localStorage.getItem(ADMIN_TOKEN_KEY);

  if (sesion?.rol === 'admin' && tokenAdmin && tokenJwtVigente(tokenAdmin)) {
    return true;
  }

  // Fallback: token admin vigente aunque la sesión en storage esté incompleta
  if (tokenAdmin && tokenJwtVigente(tokenAdmin)) {
    const payload = decodificarPayloadJwt(tokenAdmin);
    if (payload?.rol === 'admin') {
      if (!sesion || sesion.rol !== 'admin') {
        establecerSesion(
          { email: payload.email || 'admin', rol: 'admin' },
          tokenAdmin
        );
      }
      return true;
    }
  }

  return false;
}

function esSesionClienteActiva() {
  const sesion = obtenerSesionUsuario();
  const tokenCliente = localStorage.getItem(CLIENTE_TOKEN_KEY);
  return (
    Boolean(sesion?.email)
    && sesion?.rol !== 'admin'
    && Boolean(tokenCliente)
    && tokenJwtVigente(tokenCliente)
  );
}

function ocultarErroresAuth() {
  document.getElementById('auth-login-error')?.classList.add('hidden');
  document.getElementById('auth-registro-error')?.classList.add('hidden');
  document.getElementById('auth-verificacion-error')?.classList.add('hidden');
}

const AUTH_HEADINGS = {
  login: {
    title: '¡Hola de nuevo!',
    desc: 'Ingresá tus datos para continuar',
  },
  registro: {
    title: 'Creá tu cuenta',
    desc: 'Completá el formulario para registrarte',
  },
  verificacion: {
    title: 'Verificá tu email',
    desc: 'Te enviamos un código de 6 dígitos',
  },
};

function actualizarTabsAuth(pantalla) {
  const tabs = document.getElementById('auth-tabs');
  const tabLogin = document.getElementById('auth-tab-login');
  const tabRegistro = document.getElementById('auth-tab-registro');
  const esVerificacion = pantalla === 'verificacion';

  tabs?.classList.toggle('is-hidden', esVerificacion);

  if (tabLogin) {
    const activa = pantalla === 'login';
    tabLogin.classList.toggle('auth-tab--active', activa);
    tabLogin.setAttribute('aria-selected', activa ? 'true' : 'false');
  }

  if (tabRegistro) {
    const activa = pantalla === 'registro';
    tabRegistro.classList.toggle('auth-tab--active', activa);
    tabRegistro.setAttribute('aria-selected', activa ? 'true' : 'false');
  }
}

function actualizarHeadingAuth(pantalla) {
  const heading = AUTH_HEADINGS[pantalla] || AUTH_HEADINGS.login;
  const titleEl = document.getElementById('auth-modal-title');
  const descEl = document.getElementById('auth-heading-desc');

  if (titleEl) titleEl.textContent = heading.title;
  if (descEl) descEl.textContent = heading.desc;
}

function cambiarVistaAuth(pantalla) {
  const vistas = {
    login: document.getElementById('auth-view-login'),
    registro: document.getElementById('auth-view-registro'),
    verificacion: document.getElementById('auth-view-verificacion'),
  };

  Object.entries(vistas).forEach(([nombre, elemento]) => {
    if (!elemento) return;
    const activa = nombre === pantalla;
    elemento.classList.toggle('auth-view--active', activa);
    elemento.classList.remove('hidden');
    elemento.setAttribute('aria-hidden', activa ? 'false' : 'true');
  });

  actualizarTabsAuth(pantalla);
  actualizarHeadingAuth(pantalla);
  ocultarErroresAuth();

  if (pantalla === 'login') {
    document.getElementById('auth-login-email')?.focus();
  }

  if (pantalla === 'registro') {
    document.getElementById('auth-registro-email')?.focus();
  }

  if (pantalla === 'verificacion') {
    document.getElementById('verification-code-input')?.focus();
  }
}

function abrirAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('auth-open');
  cambiarVistaAuth('login');
}

function cerrarMenuCuentaHeader() {
  document.getElementById('header-cuenta-dropdown')?.classList.add('hidden');
  document.getElementById('admin-access-btn')?.setAttribute('aria-expanded', 'false');
}

function toggleMenuCuentaHeader() {
  const dropdown = document.getElementById('header-cuenta-dropdown');
  const btn = document.getElementById('admin-access-btn');
  if (!dropdown || !btn) return;

  const abierto = !dropdown.classList.contains('hidden');
  if (abierto) {
    cerrarMenuCuentaHeader();
    return;
  }

  dropdown.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');
}

function navegarPanelCuenta(panel) {
  cerrarMenuCuentaHeader();

  if (esPaginaCuenta()) {
    mostrarPanelCuenta(panel);
    document.getElementById('cuenta-layout')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  window.location.href = `cuenta.html#${panel}`;
}

function inicializarMenuCuentaHeader() {
  const menu = document.getElementById('header-cuenta-menu');
  if (!menu || menu.dataset.bound) return;
  menu.dataset.bound = 'true';

  document.getElementById('header-cuenta-dropdown')?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-cuenta-panel]');
    if (!item) return;
    navegarPanelCuenta(item.dataset.cuentaPanel);
  });

  document.getElementById('header-cuenta-logout')?.addEventListener('click', () => {
    cerrarMenuCuentaHeader();
    cerrarSesion();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#header-cuenta-menu')) {
      cerrarMenuCuentaHeader();
    }
  });
}

function manejarClickAccesoCuenta() {
  if (esSesionClienteActiva()) {
    toggleMenuCuentaHeader();
    return;
  }

  if (esSesionAdminActiva()) {
    if (esPaginaCuenta()) {
      window.location.href = 'index.html';
      return;
    }
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

  abrirAuthModal();
}

function cerrarAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-open');

  document.getElementById('auth-login-form')?.reset();
  document.getElementById('auth-registro-form')?.reset();
  const codeInputReset = document.getElementById('verification-code-input');
  if (codeInputReset) codeInputReset.value = '';

  datosRegistroTemporal = {};
  ocultarErroresAuth();
  cambiarVistaAuth('login');
}

function actualizarUIUsuario() {
  const sesion = obtenerSesionUsuario();
  const accessBtn = document.getElementById('admin-access-btn');
  const chevron = document.getElementById('header-cuenta-chevron');
  const emailEl = document.getElementById('header-cuenta-email');
  const panelBtn = document.getElementById('header-panel-control-btn');
  const logueado = esSesionClienteActiva();
  const esAdmin = esSesionAdminActiva();
  const enAdmin = document.body.classList.contains('admin-active');
  const ingresaText = accessBtn?.querySelector('.header-ingresa-btn__text');

  if (panelBtn) {
    // Solo visible para admin fuera del panel; oculto para clientes y anónimos.
    panelBtn.classList.toggle('hidden', !esAdmin || enAdmin);
    panelBtn.setAttribute('aria-hidden', (!esAdmin || enAdmin) ? 'true' : 'false');
  }

  if (esAdmin) {
    accessBtn?.classList.add('is-logged-in', 'is-admin');
    accessBtn?.setAttribute('aria-label', 'Abrir panel de control');
    if (ingresaText) ingresaText.textContent = 'Admin';
    chevron?.classList.add('hidden');
    if (emailEl) emailEl.textContent = sesion?.email || '';
    return;
  }

  accessBtn?.classList.remove('is-admin');

  if (logueado) {
    accessBtn?.classList.add('is-logged-in');
    accessBtn?.setAttribute('aria-label', 'Abrir menú de cuenta');
    if (ingresaText) ingresaText.textContent = 'Mi cuenta';
    chevron?.classList.remove('hidden');
    if (emailEl) emailEl.textContent = sesion.email;
    return;
  }

  cerrarMenuCuentaHeader();
  accessBtn?.classList.remove('is-logged-in');
  accessBtn?.setAttribute('aria-label', 'Iniciar sesión');
  if (ingresaText) ingresaText.textContent = 'Ingresá';
  chevron?.classList.add('hidden');
  if (emailEl) emailEl.textContent = '';
}

function mostrarVistaAdmin() {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');

  if (storeView) storeView.style.display = 'none';
  if (adminView) adminView.style.display = 'block';

  document.body.classList.add('admin-active');
  aplicarMarcaTienda();
  actualizarUIUsuario();
}

function mostrarVistaTienda() {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');

  if (storeView) storeView.style.display = '';
  if (adminView) adminView.style.display = 'none';

  document.body.classList.remove(
    'admin-active',
    'modal-open',
    'product-modal-open',
    'auth-open',
    'cart-open',
    'checkout-open',
    'mobile-nav-open'
  );
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';

  aplicarMarcaTienda();
  cerrarModalPedido();
  cerrarModalProducto();
  actualizarUIUsuario();
}

async function volverATiendaDesdeAdmin() {
  mostrarVistaTienda();
  actualizarUIUsuario();
  await cargarSecciones();
  renderizarCarruselSecciones();
  const ok = await cargarProductos();
  if (ok) {
    renderizarStadiumCarousel();
    renderizarProductos();
  }
  actualizarUIUsuario();
}

function completarInicioSesion(usuario, token = null) {
  establecerSesion(usuario, token);
  cerrarAuthModal();
  actualizarUIUsuario();

  if (usuario.rol === 'admin') {
    if (document.body?.dataset?.page === 'cuenta') {
      window.location.href = 'index.html';
      return;
    }
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

  if (document.body?.dataset?.page === 'cuenta') {
    actualizarUiCuenta();
    cargarPerfilUsuario();
    cargarPedidosDeCuenta();
    mostrarToast('Sesión iniciada. Bienvenido a tu cuenta.');
    return;
  }

  cargarCarritoDeSesion();
  actualizarCarritoUI();
  mostrarVistaTienda();
}

function cerrarSesion() {
  const eraAdmin = esSesionAdminActiva();
  const eraCliente = esSesionClienteActiva();

  if (eraCliente) {
    guardarCarritoEnLocalStorage();
    vaciarCarritoDeSesion();
  }

  limpiarSesionLocal();
  if (document.body?.dataset?.page === 'cuenta') {
    actualizarUIUsuario();
    actualizarUiCuenta();
    pedidos = [];
    renderizarTablaPedidosVacia('Iniciá sesión para ver los pedidos de tu cuenta.');
    mostrarToast('Sesión cerrada.');
    return;
  }
  mostrarVistaTienda();
  if (eraAdmin) {
    cargarProductos().then((ok) => {
      if (ok) {
        renderizarFiltrosCategorias(productos);
        renderizarStadiumCarousel();
        renderizarProductos();
      }
    });
  }
}

async function solicitarRegistro(event) {
  event.preventDefault();

  const email = normalizarEmail(
    document.getElementById('auth-registro-email')?.value || ''
  );
  const password = document.getElementById('auth-registro-password')?.value || '';
  const errorEl = document.getElementById('auth-registro-error');
  const submitBtn = document.querySelector('#auth-registro-form button[type="submit"]');

  submitBtn?.setAttribute('disabled', 'true');
  errorEl?.classList.add('hidden');

  try {
    const respuesta = await apiFetch('/api/auth/registro', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    datosRegistroTemporal = { email };

    const emailVerificacion = document.getElementById('auth-verificacion-email');
    if (emailVerificacion) emailVerificacion.textContent = email;

    mostrarToast('Te enviamos un código de 6 dígitos. Revisá tu correo (y spam).');
    cambiarVistaAuth('verificacion');
  } catch (error) {
    if (error.message.includes('Ya existe')) {
      mostrarToast('Este email ya está registrado.', 'error');
    } else {
      mostrarToast(error?.message || 'No se pudo completar el registro.', 'error');
    }
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
}

async function confirmarRegistro() {
  const codigoIngresado = document
    .getElementById('verification-code-input')
    ?.value.trim();
  const errorEl = document.getElementById('auth-verificacion-error');
  const submitBtn = document.getElementById('btn-confirmar-registro');
  const textoOriginal = submitBtn?.textContent?.trim() || 'Verificar y Activar';

  if (!codigoIngresado || !/^\d{6}$/.test(codigoIngresado)) {
    errorEl?.classList.remove('hidden');
    mostrarToast('Ingresá un código de 6 dígitos válido.', 'error');
    return;
  }

  if (!datosRegistroTemporal.email) {
    mostrarToast('No hay un registro pendiente. Volvé a registrarte.', 'error');
    cambiarVistaAuth('registro');
    return;
  }

  errorEl?.classList.add('hidden');

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando...';
  }

  try {
    const respuesta = await apiFetch('/api/auth/confirmar', {
      method: 'POST',
      body: JSON.stringify({
        email: datosRegistroTemporal.email,
        codigo: codigoIngresado,
      }),
    });

    datosRegistroTemporal = {};

    completarInicioSesion(respuesta.usuario, respuesta.token || null);
    mostrarToast('Cuenta verificada. ¡Bienvenido!');
  } catch (error) {
    errorEl?.classList.remove('hidden');
    mostrarToast(error?.message || 'Código inválido o expirado.', 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = textoOriginal;
    }
  }
}

async function iniciarSesion(event) {
  event.preventDefault();

  const email = normalizarEmail(
    document.getElementById('auth-login-email')?.value || ''
  );
  const password = document.getElementById('auth-login-password')?.value || '';
  const errorEl = document.getElementById('auth-login-error');
  const submitBtn = document.querySelector('#auth-login-form button[type="submit"]');

  submitBtn?.setAttribute('disabled', 'true');
  errorEl?.classList.add('hidden');

  try {
    const respuesta = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    completarInicioSesion(respuesta.usuario, respuesta.token || null);
  } catch (error) {
    errorEl?.classList.remove('hidden');
    mostrarToast(error?.message || 'Email o contraseña incorrectos.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
}

function restaurarSesion() {
  let sesion = obtenerSesionUsuario();
  let tokenAdmin = localStorage.getItem(ADMIN_TOKEN_KEY);
  let tokenCliente = localStorage.getItem(CLIENTE_TOKEN_KEY);

  if (tokenAdmin && !tokenJwtVigente(tokenAdmin)) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    tokenAdmin = null;
    if (sesion?.rol === 'admin') {
      limpiarSesionLocal();
      sesion = null;
    }
  }

  if (tokenCliente && !tokenJwtVigente(tokenCliente)) {
    localStorage.removeItem(CLIENTE_TOKEN_KEY);
    tokenCliente = null;
    if (sesion && sesion.rol !== 'admin') {
      limpiarSesionLocal();
      sesion = null;
    }
  }

  if (!sesion && tokenAdmin) {
    const payload = decodificarPayloadJwt(tokenAdmin);
    if (payload?.email && payload?.rol === 'admin' && tokenJwtVigente(tokenAdmin)) {
      establecerSesion({ email: payload.email, rol: 'admin' }, tokenAdmin);
      sesion = obtenerSesionUsuario();
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      tokenAdmin = null;
    }
  }

  if (!sesion) return;

  if (document.body?.dataset?.page === 'cuenta') {
    if (sesion.rol === 'admin' && tokenAdmin) {
      window.location.href = 'index.html';
      return;
    }
    if (sesion.rol !== 'admin' && !tokenCliente) {
      cerrarSesion();
      return;
    }
    actualizarUIUsuario();
    actualizarUiCuenta();
    return;
  }

  if (sesion.rol === 'admin' && tokenAdmin) {
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

  if (sesion.rol === 'admin' || (sesion.rol !== 'admin' && !tokenCliente)) {
    cerrarSesion();
    return;
  }

  cargarCarritoDeSesion();
  actualizarCarritoUI();
  mostrarVistaTienda();
}

function resumirProductos(productos) {
  if (!productos?.length) return '—';
  const nombres = productos.map((p) => p.nombre).join(', ');
  return nombres.length > 48 ? `${nombres.slice(0, 48)}…` : nombres;
}

const ADMIN_PANELS = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Resumen general de tu negocio',
  },
  pedidos: {
    title: 'Pedidos',
    subtitle: 'Gestioná los pedidos de tu tienda',
  },
  productos: {
    title: 'Productos',
    subtitle: 'Administrá el catálogo de tu tienda',
  },
  portada: {
    title: 'Gestión de Portada',
    subtitle: 'Definí Destacados y En Oferta de la página de inicio',
  },
  configuracion: {
    title: 'Configuración',
    subtitle: 'Personalizá los datos públicos de tu tienda',
  },
  cupones: {
    title: 'Cupones',
    subtitle: 'Creá y administrá códigos de descuento',
  },
};

let panelAdminActivo = 'dashboard';
let adminVentasChart = null;

function cambiarPanelAdmin(panel) {
  if (!ADMIN_PANELS[panel]) return;

  panelAdminActivo = panel;
  const config = ADMIN_PANELS[panel];

  document.getElementById('admin-header-title').textContent = config.title;
  document.getElementById('admin-header-subtitle').textContent = config.subtitle;

  document.querySelectorAll('.admin-panel').forEach((seccion) => {
    seccion.classList.toggle('hidden', seccion.dataset.adminPanel !== panel);
  });

  document.querySelectorAll('.admin-sidebar__link[data-admin-panel]').forEach((link) => {
    link.classList.toggle('admin-sidebar__link--active', link.dataset.adminPanel === panel);
  });

  if (panel === 'productos') {
    renderizarSelectCategoriasPreciosMasivo();
    actualizarControlesPreciosMasivo();
    actualizarVistaCatalogoAdmin();
  }

  if (panel === 'portada') {
    renderizarGestionPortada();
  }

  if (panel === 'dashboard') {
    renderizarGraficoVentasAdmin();
  }

  if (panel === 'configuracion') {
    cargarFormularioConfiguracion();
  }

  if (panel === 'cupones') {
    cargarCuponesAdmin();
  }
}

async function cargarFormularioConfiguracion() {
  try {
    const config = await fetch(`${API_BASE}/api/config`).then((respuesta) => {
      if (!respuesta.ok) throw new Error('No se pudo cargar la configuración.');
      return respuesta.json();
    });

    const nombreInput = document.getElementById('config-nombre-tienda');
    const whatsappInput = document.getElementById('config-whatsapp');
    const cloudNameInput = document.getElementById('config-cloudinary-cloud-name');
    const uploadPresetInput = document.getElementById('config-cloudinary-upload-preset');
    const afipLinkInput = document.getElementById('config-afip-link');

    if (nombreInput) nombreInput.value = String(config.nombreTienda || '').trim();
    if (whatsappInput) {
      whatsappInput.value = String(config.whatsappNumero || '').replace(/^\+/, '').trim();
    }
    if (cloudNameInput) cloudNameInput.value = String(config.cloudinaryCloudName || '').trim();
    if (uploadPresetInput) uploadPresetInput.value = String(config.cloudinaryUploadPreset || '').trim();
    if (afipLinkInput) afipLinkInput.value = String(config.afipLink || '').trim();
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo cargar la configuración.', 'error');
  }
}

async function guardarConfiguracion(event) {
  event.preventDefault();

  const nombreTienda = String(document.getElementById('config-nombre-tienda')?.value || '').trim();
  const whatsappNumero = String(document.getElementById('config-whatsapp')?.value || '')
    .replace(/^\+/, '')
    .replace(/\D/g, '')
    .trim();
  const cloudinaryCloudName = String(
    document.getElementById('config-cloudinary-cloud-name')?.value || ''
  ).trim();
  const cloudinaryUploadPreset = String(
    document.getElementById('config-cloudinary-upload-preset')?.value || ''
  ).trim();
  const afipLink = String(document.getElementById('config-afip-link')?.value || '').trim();
  const btn = document.getElementById('btn-guardar-configuracion');

  if (!nombreTienda) {
    mostrarToast('El nombre de la tienda es obligatorio.', 'error');
    return;
  }

  if (!whatsappNumero) {
    mostrarToast('Ingresá un número de WhatsApp válido (sin el +).', 'error');
    return;
  }

  btn?.setAttribute('disabled', 'true');

  try {
    await apiFetch('/api/config', {
      method: 'PUT',
      body: JSON.stringify({
        nombreTienda,
        whatsappNumero,
        cloudinaryCloudName,
        cloudinaryUploadPreset,
        afipLink,
      }),
    });

    await cargarConfiguracionTienda();
    mostrarToast('Configuración guardada correctamente.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo guardar la configuración.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

function etiquetaAplicaACupon(cupon) {
  if (cupon?.aplicaA) return String(cupon.aplicaA);
  const tipo = String(cupon?.tipoFiltro || 'todos').toLowerCase();
  const nombre = String(cupon?.referenciaNombre || '').trim();
  if (tipo === 'seccion') {
    return nombre ? `Sección: ${nombre}` : 'Sección (referencia no encontrada)';
  }
  if (tipo === 'producto') {
    return nombre ? `Producto: ${nombre}` : 'Producto (referencia no encontrada)';
  }
  return 'Toda la tienda';
}

function renderizarCuponesAdmin(cupones = []) {
  const tbody = document.getElementById('admin-cupones-tbody');
  const wrap = document.getElementById('admin-cupones-table-wrap');
  if (!tbody) return;

  if (!Array.isArray(cupones) || cupones.length === 0) {
    wrap?.classList.add('admin-table-wrapper--empty');
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Todavía no hay cupones. Creá el primero con el formulario de arriba.</td>
      </tr>
    `;
    return;
  }

  wrap?.classList.remove('admin-table-wrapper--empty');
  tbody.innerHTML = cupones
    .map((cupon) => {
      const id = escaparHtmlTexto(cupon.id);
      const codigo = escaparHtmlTexto(cupon.codigo);
      const porcentaje = Number(cupon.descuentoPorcentaje) || 0;
      const aplicaA = escaparHtmlTexto(etiquetaAplicaACupon(cupon));
      const tipoFiltro = String(cupon.tipoFiltro || 'todos').toLowerCase();
      const activo = cupon.activo !== false;
      const estadoLabel = activo ? 'Activo' : 'Inactivo';
      const estadoClase = activo ? 'admin-cupon-estado--activo' : 'admin-cupon-estado--inactivo';

      return `
        <tr data-cupon-id="${id}">
          <td><code class="admin-cupon-codigo">${codigo}</code></td>
          <td>${porcentaje}%</td>
          <td>
            <span class="admin-cupon-aplica" data-tipo-filtro="${escaparAtributoHtml(tipoFiltro)}">
              ${aplicaA}
            </span>
          </td>
          <td><span class="admin-cupon-estado ${estadoClase}">${estadoLabel}</span></td>
          <td>
            <label class="admin-toggle" title="${activo ? 'Desactivar' : 'Activar'} cupón">
              <input
                type="checkbox"
                class="admin-toggle__input admin-cupon-toggle"
                data-cupon-id="${id}"
                ${activo ? 'checked' : ''}
                aria-label="${activo ? 'Desactivar' : 'Activar'} cupón ${codigo}"
              >
              <span class="admin-toggle__track" aria-hidden="true"></span>
            </label>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function cargarCuponesAdmin() {
  const tbody = document.getElementById('admin-cupones-tbody');
  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Cargando cupones…</td>
      </tr>
    `;
  }

  try {
    const cupones = await apiFetch('/api/admin/cupones');
    renderizarCuponesAdmin(Array.isArray(cupones) ? cupones : []);
  } catch (error) {
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">No se pudieron cargar los cupones.</td>
        </tr>
      `;
    }
    mostrarToast(error?.message || 'No se pudieron cargar los cupones.', 'error');
  }
}

/** Cache local para el selector de alcance del cupón. */
let cuponSeccionesCache = null;
let cuponProductosCache = null;
let cuponProductosCargando = null;
let cuponSeccionesCargando = null;

function obtenerTipoFiltroCupon() {
  const select = document.getElementById('cupon-tipo-filtro');
  const valor = String(select?.value || 'todos').trim();
  return ['todos', 'seccion', 'producto'].includes(valor) ? valor : 'todos';
}

function setCampoCuponVisible(wrapId, visible) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.classList.toggle('hidden', !visible);
  wrap.hidden = !visible;
}

function actualizarCamposFiltroCupon() {
  const tipo = obtenerTipoFiltroCupon();
  setCampoCuponVisible('cupon-filtro-seccion-wrap', tipo === 'seccion');
  setCampoCuponVisible('cupon-filtro-producto-wrap', tipo === 'producto');

  if (tipo === 'seccion') {
    cargarOpcionesSeccionCupon();
  } else if (tipo === 'producto') {
    cargarOpcionesProductoCupon();
  }
}

async function obtenerSeccionesParaCupon() {
  if (Array.isArray(cuponSeccionesCache)) return cuponSeccionesCache;
  if (cuponSeccionesCargando) return cuponSeccionesCargando;

  cuponSeccionesCargando = (async () => {
    try {
      // Reutiliza secciones ya cargadas en admin; si no, fetch fresco.
      if (Array.isArray(secciones) && secciones.length > 0) {
        cuponSeccionesCache = secciones.slice();
      } else {
        cuponSeccionesCache = await apiFetch('/api/secciones');
      }
      return cuponSeccionesCache;
    } finally {
      cuponSeccionesCargando = null;
    }
  })();

  return cuponSeccionesCargando;
}

async function obtenerProductosParaCupon() {
  if (Array.isArray(cuponProductosCache)) return cuponProductosCache;
  if (cuponProductosCargando) return cuponProductosCargando;

  cuponProductosCargando = (async () => {
    try {
      const lista = await apiFetch('/api/productos');
      cuponProductosCache = Array.isArray(lista) ? lista : [];
      return cuponProductosCache;
    } finally {
      cuponProductosCargando = null;
    }
  })();

  return cuponProductosCargando;
}

function renderizarOpcionesSeccionCupon(lista) {
  const select = document.getElementById('cupon-seccion');
  if (!select) return;

  const valorActual = select.value;
  const todas = Array.isArray(lista) ? lista.filter(Boolean) : [];
  const raizCalzado = todas.find((seccion) => esSeccionCalzadoRaiz(seccion)) || null;
  // Incluye la raíz «Calzado» (cubre todos los subtipos) + secciones/subtipos asignables.
  const activas = [
    ...(raizCalzado ? [raizCalzado] : []),
    ...todas
      .filter((seccion) => !esSeccionCalzadoRaiz(seccion))
      .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')),
  ];

  if (activas.length === 0) {
    select.innerHTML = '<option value="">No hay secciones disponibles</option>';
    return;
  }

  select.innerHTML = [
    '<option value="">Seleccioná una sección…</option>',
    ...activas.map((seccion) => {
      const esRaiz = esSeccionCalzadoRaiz(seccion);
      const etiqueta = esRaiz
        ? `${seccion.nombre} (todos los subtipos)`
        : seccion.nombre;
      return `<option value="${escaparAtributoHtml(String(seccion.id))}">${escaparHtmlTexto(etiqueta)}</option>`;
    }),
  ].join('');

  if (valorActual && activas.some((s) => String(s.id) === String(valorActual))) {
    select.value = valorActual;
  }
}

function renderizarOpcionesProductoCupon(lista, filtroTexto = '') {
  const select = document.getElementById('cupon-producto');
  if (!select) return;

  const valorActual = select.value;
  const consulta = String(filtroTexto || '').trim().toLowerCase();
  const productosFiltrados = (Array.isArray(lista) ? lista : [])
    .filter((producto) => producto && producto.activo !== false)
    .filter((producto) => {
      if (!consulta) return true;
      const nombre = String(producto.nombre || '').toLowerCase();
      const categoria = String(producto.categoria || '').toLowerCase();
      return nombre.includes(consulta) || categoria.includes(consulta);
    })
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'));

  if (productosFiltrados.length === 0) {
    select.innerHTML = consulta
      ? '<option value="">Sin resultados para esa búsqueda</option>'
      : '<option value="">No hay productos disponibles</option>';
    return;
  }

  const maxOpciones = 150;
  const visibles = productosFiltrados.slice(0, maxOpciones);

  select.innerHTML = [
    '<option value="">Seleccioná un producto…</option>',
    ...visibles.map((producto) => {
      const etiqueta = producto.categoria
        ? `${producto.nombre} — ${producto.categoria}`
        : producto.nombre;
      return `<option value="${escaparAtributoHtml(String(producto.id))}">${escaparHtmlTexto(etiqueta)}</option>`;
    }),
  ].join('');

  if (productosFiltrados.length > maxOpciones) {
    const restante = productosFiltrados.length - maxOpciones;
    select.insertAdjacentHTML(
      'beforeend',
      `<option value="" disabled>…y ${restante} más. Refiná la búsqueda.</option>`
    );
  }

  if (valorActual && visibles.some((p) => String(p.id) === String(valorActual))) {
    select.value = valorActual;
  }
}

async function cargarOpcionesSeccionCupon() {
  const select = document.getElementById('cupon-seccion');
  if (select && !select.dataset.loaded) {
    select.innerHTML = '<option value="">Cargando secciones…</option>';
  }

  try {
    const lista = await obtenerSeccionesParaCupon();
    renderizarOpcionesSeccionCupon(lista);
    if (select) select.dataset.loaded = '1';
  } catch (error) {
    if (select) {
      select.innerHTML = '<option value="">Error al cargar secciones</option>';
      delete select.dataset.loaded;
    }
    mostrarToast(error?.message || 'No se pudieron cargar las secciones.', 'error');
  }
}

async function cargarOpcionesProductoCupon() {
  const select = document.getElementById('cupon-producto');
  const buscar = document.getElementById('cupon-producto-buscar');
  if (select && !select.dataset.loaded) {
    select.innerHTML = '<option value="">Cargando productos…</option>';
  }

  try {
    const lista = await obtenerProductosParaCupon();
    renderizarOpcionesProductoCupon(lista, buscar?.value || '');
    if (select) select.dataset.loaded = '1';
  } catch (error) {
    if (select) {
      select.innerHTML = '<option value="">Error al cargar productos</option>';
      delete select.dataset.loaded;
    }
    mostrarToast(error?.message || 'No se pudieron cargar los productos.', 'error');
  }
}

function resetearFormularioFiltroCupon() {
  const tipoSelect = document.getElementById('cupon-tipo-filtro');
  const seccionSelect = document.getElementById('cupon-seccion');
  const productoSelect = document.getElementById('cupon-producto');
  const productoBuscar = document.getElementById('cupon-producto-buscar');

  if (tipoSelect) tipoSelect.value = 'todos';
  if (seccionSelect) seccionSelect.value = '';
  if (productoSelect) productoSelect.value = '';
  if (productoBuscar) productoBuscar.value = '';
  actualizarCamposFiltroCupon();
}

function obtenerReferenciaIdCupon() {
  const tipo = obtenerTipoFiltroCupon();
  if (tipo === 'seccion') {
    return String(document.getElementById('cupon-seccion')?.value || '').trim() || null;
  }
  if (tipo === 'producto') {
    return String(document.getElementById('cupon-producto')?.value || '').trim() || null;
  }
  return null;
}

async function crearCuponAdmin(event) {
  event.preventDefault();

  const codigoInput = document.getElementById('cupon-codigo');
  const descuentoInput = document.getElementById('cupon-descuento');
  const activoInput = document.getElementById('cupon-activo');
  const btn = document.getElementById('btn-crear-cupon');

  const codigo = String(codigoInput?.value || '').trim().toUpperCase();
  const descuentoPorcentaje = Number(descuentoInput?.value);
  const tipoFiltro = obtenerTipoFiltroCupon();
  const referenciaId = obtenerReferenciaIdCupon();

  if (!codigo) {
    mostrarToast('Ingresá un código de cupón.', 'error');
    return;
  }

  if (
    !Number.isInteger(descuentoPorcentaje)
    || descuentoPorcentaje < 1
    || descuentoPorcentaje > 100
  ) {
    mostrarToast('El descuento debe ser un número entero entre 1 y 100.', 'error');
    return;
  }

  if (tipoFiltro === 'seccion' && !referenciaId) {
    mostrarToast('Seleccioná una sección para el cupón.', 'error');
    return;
  }

  if (tipoFiltro === 'producto' && !referenciaId) {
    mostrarToast('Seleccioná un producto para el cupón.', 'error');
    return;
  }

  btn?.setAttribute('disabled', 'true');

  try {
    await apiFetch('/api/admin/cupones', {
      method: 'POST',
      body: JSON.stringify({
        codigo,
        descuentoPorcentaje,
        activo: Boolean(activoInput?.checked),
        tipoFiltro,
        referenciaId,
      }),
    });

    if (codigoInput) codigoInput.value = '';
    if (descuentoInput) descuentoInput.value = '';
    if (activoInput) activoInput.checked = true;
    resetearFormularioFiltroCupon();

    mostrarToast(`Cupón ${codigo} creado (−${descuentoPorcentaje}%).`);
    await cargarCuponesAdmin();
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo crear el cupón.', 'error');
  } finally {
    btn?.removeAttribute('disabled');
  }
}

async function toggleCuponActivoAdmin(event) {
  const toggle = event.target.closest('.admin-cupon-toggle');
  if (!toggle) return;

  const id = toggle.dataset.cuponId;
  if (!id) return;

  const activo = Boolean(toggle.checked);
  toggle.disabled = true;

  try {
    await apiFetch(`/api/admin/cupones/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ activo }),
    });
    await cargarCuponesAdmin();
    mostrarToast(activo ? 'Cupón activado.' : 'Cupón desactivado.');
  } catch (error) {
    toggle.checked = !activo;
    mostrarToast(error?.message || 'No se pudo actualizar el cupón.', 'error');
  } finally {
    toggle.disabled = false;
  }
}

function formatearEtiquetaFechaStats(fechaIso) {
  const partes = String(fechaIso || '').split('-').map(Number);
  if (partes.length !== 3 || partes.some((valor) => !Number.isFinite(valor))) {
    return fechaIso || '—';
  }

  const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
  return fecha
    .toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
    .replace('.', '');
}

function renderizarGraficoVentasAdmin(stats = estadisticasAdmin) {
  const canvas = document.getElementById('admin-chart-ventas');
  if (!canvas || typeof Chart === 'undefined') return;

  const ventas = stats?.ventasUltimos7Dias || [];
  const etiquetas = ventas.map((item) => formatearEtiquetaFechaStats(item.fecha));
  const montos = ventas.map((item) => Number(item.total) || 0);

  if (adminVentasChart) {
    adminVentasChart.destroy();
  }

  adminVentasChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: etiquetas,
      datasets: [
        {
          label: 'Ventas',
          data: montos,
          backgroundColor: 'rgba(45, 138, 69, 0.78)',
          hoverBackgroundColor: 'rgba(30, 107, 50, 0.92)',
          borderColor: '#1e6b32',
          borderWidth: 2,
          borderRadius: 10,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          titleFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13 },
          bodyFont: { family: "'Plus Jakarta Sans', sans-serif", size: 13 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label(context) {
              return ` ${formatearPrecio(context.parsed.y)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#6b7280',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
          },
          border: { display: false },
        },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            color: '#6b7280',
            font: { family: "'Plus Jakarta Sans', sans-serif", size: 12 },
            callback(value) {
              return formatearPrecio(value).replace(',00', '');
            },
          },
          border: { display: false },
        },
      },
    },
  });
}

function actualizarMetricasAdmin() {
  return cargarMetricasDashboard();
}

function renderizarTopProductosDashboard(topProductos = []) {
  const listaEl = document.getElementById('kpi-top-productos');
  if (!listaEl) return;

  if (!Array.isArray(topProductos) || topProductos.length === 0) {
    listaEl.innerHTML = '<li class="kpi-top-productos__empty">Sin datos de ventas aún</li>';
    return;
  }

  listaEl.innerHTML = topProductos
    .slice(0, 3)
    .map((producto, indice) => {
      const nombre = escaparTextoHtml(producto?.nombre || 'Sin nombre');
      const stock = Number(producto?.stock);
      const stockTexto = Number.isFinite(stock) ? `${stock} u.` : '—';
      return `
        <li class="kpi-top-productos__item">
          <span class="kpi-top-productos__rank">${indice + 1}</span>
          <span class="kpi-top-productos__nombre" title="${nombre}">${nombre}</span>
          <span class="kpi-top-productos__stock">${escaparTextoHtml(stockTexto)}</span>
        </li>
      `;
    })
    .join('');
}

/**
 * Carga métricas del dashboard admin desde /api/admin/metricas
 * y actualiza facturación mensual, pendientes y Top 3.
 */
async function cargarMetricasDashboard() {
  const facturadoEl = document.getElementById('kpi-facturado');
  const pendientesEl = document.getElementById('kpi-activos');
  const listaTopEl = document.getElementById('kpi-top-productos');

  try {
    metricasDashboard = await apiFetch('/api/admin/metricas');

    if (facturadoEl) {
      facturadoEl.textContent = formatearPrecio(metricasDashboard?.totalFacturado ?? 0);
    }
    if (pendientesEl) {
      pendientesEl.textContent = String(metricasDashboard?.pendientesContador ?? 0);
    }
    renderizarTopProductosDashboard(metricasDashboard?.topProductos || []);
  } catch (error) {
    metricasDashboard = null;
    console.error('Error al cargar métricas del dashboard:', error);
    if (facturadoEl) facturadoEl.textContent = formatearPrecio(0);
    if (pendientesEl) pendientesEl.textContent = '0';
    if (listaTopEl) {
      listaTopEl.innerHTML = '<li class="kpi-top-productos__empty">No se pudieron cargar</li>';
    }
  }
}

async function cargarEstadisticasAdmin() {
  try {
    estadisticasAdmin = await apiFetch('/api/admin/stats');
  } catch (error) {
    estadisticasAdmin = null;
    console.error('Error al cargar estadísticas del administrador:', error);
  }
}

function crearOpcionesEstado(estadoActual) {
  const actual = normalizarEstadoPedidoCliente(estadoActual);
  return ESTADOS_PEDIDO.map(
    (estado) =>
      `<option value="${estado}"${estado === actual ? ' selected' : ''}>${ETIQUETAS_ESTADO_PEDIDO[estado]}</option>`
  ).join('');
}

function renderizarTablaPedidosAdmin(listaPedidos) {
  const tbody = document.getElementById('admin-orders-body');
  if (!tbody) return;

  if (listaPedidos.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  const ordenados = [...listaPedidos].sort(
    (a, b) => new Date(b.fecha) - new Date(a.fecha)
  );

  tbody.innerHTML = ordenados
    .map((pedido) => {
      const idVisible = escaparTextoHtml(pedido.numeroPedido || pedido.id);
      const idPedido = escaparAtributoHtml(pedido.id);
      const nombreCliente = escaparTextoHtml(pedido.cliente?.nombre || '—');
      const telefono = escaparTextoHtml(pedido.cliente?.telefono || '—');
      const resumen = resumirProductos(pedido.productos);
      const resumenSeguro = escaparTextoHtml(resumen);
      const resumenAttr = escaparAtributoHtml(resumen);

      return `
        <tr data-order-id="${idPedido}">
          <td><span class="admin-table__id">#${idVisible}</span></td>
          <td>${formatearFechaCorta(pedido.fecha)}</td>
          <td>${nombreCliente}</td>
          <td>${telefono}</td>
          <td><span class="admin-table__products" title="${resumenAttr}">${resumenSeguro}</span></td>
          <td class="admin-table__total">${formatearPrecio(pedido.total)}</td>
          <td>${crearBadgeEstadoPedido(pedido.estado)}</td>
          <td>
            <div class="admin-table__actions">
              ${crearBotonEtiquetaEnvio(pedido.id)}
              ${crearBotonNotificarDespacho(pedido.id, pedido.estado)}
              <button
                class="btn-detail"
                type="button"
                data-order-id="${idPedido}"
              >
                Ver detalle
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

/**
 * Notifica despacho al comprador y marca el pedido como despachado.
 * Deshabilita el botón durante el request para evitar clics múltiples.
 */
async function notificarDespachoServidor(pedidoId, botonElemento) {
  if (!pedidoId || !botonElemento || botonElemento.disabled) return;

  const codigoIngresado = window.prompt(
    'Ingresa el código de seguimiento del envío (deja en blanco si no aplica):',
    ''
  );

  // Cancelar el diálogo → no enviar nada
  if (codigoIngresado === null) return;

  const codigoSeguimiento = codigoIngresado.trim();
  const htmlOriginal = botonElemento.innerHTML;

  botonElemento.disabled = true;
  botonElemento.textContent = 'Enviando...';

  try {
    const respuesta = await apiFetch(`/api/admin/pedidos/${encodeURIComponent(pedidoId)}/notificar-despacho`, {
      method: 'POST',
      body: JSON.stringify({ codigoSeguimiento }),
    });

    const pedidoActualizado = respuesta?.pedido;
    if (pedidoActualizado?.id) {
      const indice = pedidos.findIndex((p) => p.id === pedidoActualizado.id);
      if (indice >= 0) {
        pedidos[indice] = { ...pedidos[indice], ...pedidoActualizado };
      }
    } else {
      const local = pedidos.find((p) => p.id === pedidoId);
      if (local) local.estado = 'despachado';
    }

    renderizarTablaPedidosAdmin(pedidos);
    await cargarMetricasDashboard();
    mostrarToast(respuesta?.mensaje || 'Notificación de despacho enviada.');
  } catch (error) {
    botonElemento.disabled = false;
    botonElemento.innerHTML = htmlOriginal;
    mostrarToast(error?.message || 'No se pudo notificar el despacho.', 'error');
  }
}

async function cargarPanelAdmin() {
  await Promise.all([
    cargarPedidos(),
    cargarProductos({ todos: true }),
    cargarEstadisticasAdmin(),
    cargarMetricasDashboard(),
  ]);

  const vacio = pedidos.length === 0;
  const wrapper = document.querySelector('#admin-panel-pedidos .admin-table-wrapper');
  const emptyEl = document.getElementById('admin-empty');
  const countEl = document.getElementById('orders-count');

  wrapper?.classList.toggle('admin-table-wrapper--empty', vacio);
  if (emptyEl) emptyEl.hidden = !vacio;
  if (countEl) {
    countEl.textContent = vacio
      ? ''
      : `${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}`;
  }

  renderizarGraficoVentasAdmin(estadisticasAdmin);
  renderizarTablaPedidosAdmin(pedidos);
  actualizarContadorProductosAdmin();
  renderizarSeccionesAdmin();
  cambiarPanelAdmin(panelAdminActivo);
}

function obtenerFiltroBusquedaPortada() {
  return String(document.getElementById('portada-buscar')?.value || '')
    .trim()
    .toLowerCase();
}

function actualizarContadorPortada() {
  const countEl = document.getElementById('portada-count');
  if (!countEl) return;

  const consulta = obtenerFiltroBusquedaPortada();
  const visibles = productos.filter((producto) => {
    if (!consulta) return true;
    const texto = `${producto.nombre} ${producto.categoria}`.toLowerCase();
    return texto.includes(consulta);
  }).length;
  const destacados = productos.filter((p) => p.destacado).length;
  const ofertas = productos.filter((p) => p.enOferta || p.en_oferta).length;

  countEl.textContent = `${visibles} producto${visibles !== 1 ? 's' : ''} · ${destacados} destacados · ${ofertas} en oferta`;
}

function renderizarGestionPortada() {
  const grid = document.getElementById('admin-portada-grid');
  const emptyEl = document.getElementById('admin-portada-empty');
  if (!grid) return;

  const consulta = obtenerFiltroBusquedaPortada();
  const lista = [...productos]
    .filter((producto) => {
      if (!consulta) return true;
      const texto = `${producto.nombre} ${producto.categoria}`.toLowerCase();
      return texto.includes(consulta);
    })
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

  actualizarContadorPortada();

  if (!lista.length) {
    grid.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }

  emptyEl?.classList.add('hidden');
  grid.innerHTML = lista
    .map((producto) => {
      const imagen = obtenerImagenFrente(producto) || 'https://placehold.co/144x180/f3f4f6/9ca3af?text=Sin+img';
      const destacado = producto.destacado === true;
      const enOferta = producto.enOferta === true || producto.en_oferta === true;

      return `
        <article class="admin-portada-card" data-product-id="${producto.id}">
          <img class="admin-portada-card__thumb" src="${imagen}" alt="" width="72" height="90" loading="lazy">
          <div class="admin-portada-card__body">
            <h3 class="admin-portada-card__nombre" title="${producto.nombre}">${producto.nombre}</h3>
            <p class="admin-portada-card__meta">${producto.categoria || 'Sin categoría'} · ${formatearPrecio(producto.precio)}</p>
            <div class="admin-portada-card__switches">
              <label class="admin-portada-card__switch">
                <span>Productos Destacados</span>
                <span class="admin-toggle" title="Marcar como destacado">
                  <input
                    type="checkbox"
                    class="admin-toggle__input admin-portada-toggle"
                    data-product-id="${producto.id}"
                    data-campo="destacado"
                    ${destacado ? 'checked' : ''}
                  >
                  <span class="admin-toggle__track" aria-hidden="true"></span>
                </span>
              </label>
              <label class="admin-portada-card__switch">
                <span>En Oferta</span>
                <span class="admin-toggle" title="Marcar en oferta">
                  <input
                    type="checkbox"
                    class="admin-toggle__input admin-portada-toggle"
                    data-product-id="${producto.id}"
                    data-campo="enOferta"
                    ${enOferta ? 'checked' : ''}
                  >
                  <span class="admin-toggle__track" aria-hidden="true"></span>
                </span>
              </label>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

async function cambiarAtributoPortadaProducto(id, campo, valor, input) {
  const producto = productos.find((item) => String(item.id) === String(id));
  if (!producto) return;
  if (input?.dataset.saving === 'true') return;

  const estadoAnterior = campo === 'destacado'
    ? producto.destacado === true
    : producto.enOferta === true || producto.en_oferta === true;

  if (input) input.dataset.saving = 'true';

  try {
    const body = campo === 'destacado'
      ? { destacado: valor }
      : { enOferta: valor };

    const actualizado = await apiFetch(`/api/productos/${id}/portada`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    const indice = productos.findIndex((item) => String(item.id) === String(id));
    if (indice !== -1) {
      productos[indice] = actualizado;
    }

    actualizarContadorPortada();
    sincronizarVistaTiendaTrasCambioCatalogo();
    mostrarToast(
      campo === 'destacado'
        ? (valor ? 'Producto marcado como destacado.' : 'Producto quitado de destacados.')
        : (valor ? 'Producto marcado en oferta.' : 'Producto quitado de ofertas.')
    );
  } catch (error) {
    if (input) input.checked = estadoAnterior;
    mostrarToast(error?.message || 'No se pudo actualizar la portada.', 'error');
  } finally {
    if (input) delete input.dataset.saving;
  }
}

async function cambiarEstadoActivoProducto(id, activo, input) {
  const producto = productos.find((item) => String(item.id) === String(id));
  if (!producto) return;

  const estadoAnterior = producto.activo !== false;

  if (input) {
    input.disabled = true;
  }

  try {
    const actualizado = await apiFetch(`/api/productos/${id}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo }),
    });

    const indice = productos.findIndex((item) => String(item.id) === String(id));
    if (indice !== -1) {
      productos[indice] = actualizado;
    }

    if (input) {
      input.checked = actualizado.activo !== false;
      input.setAttribute(
        'aria-label',
        `${actualizado.activo !== false ? 'Desactivar' : 'Activar'} ${actualizado.nombre}`
      );
      input.closest('.admin-toggle')?.setAttribute(
        'title',
        actualizado.activo !== false ? 'Producto visible en tienda' : 'Producto oculto en tienda'
      );
    }

    mostrarToast(
      actualizado.activo !== false
        ? `«${actualizado.nombre}» activado en la tienda.`
        : `«${actualizado.nombre}» oculto de la tienda.`
    );
    sincronizarVistaTiendaTrasCambioCatalogo();
  } catch (error) {
    if (input) {
      input.checked = estadoAnterior;
    }
    mostrarToast(error?.message || 'No se pudo cambiar el estado del producto.', 'error');
  } finally {
    if (input) {
      input.disabled = false;
    }
  }
}

async function aplicarActualizacionPreciosMasivo() {
  const selectTipo = document.getElementById('precios-masivo-tipo');
  const inputPorcentaje = document.getElementById('precios-masivo-porcentaje');
  const selectCategoria = document.getElementById('precios-masivo-categoria');
  const btn = document.getElementById('btn-aplicar-precios-masivo');

  const tipo = selectTipo?.value || 'descuento';
  const categoria = selectCategoria?.value?.trim() || '';
  const alcance = categoria ? `la categoría «${categoria}»` : 'todo el catálogo';

  if (tipo === 'quitar-ofertas') {
    const confirmar = confirm(`¿Confirmás quitar los descuentos de oferta en ${alcance}?`);
    if (!confirmar) return;

    if (btn) btn.disabled = true;

    try {
      const resultado = await apiFetch('/api/productos/quitar-ofertas-masivo', {
        method: 'PUT',
        body: JSON.stringify({
          ...(categoria ? { categoria } : {}),
        }),
      });

      await cargarProductos({ todos: true });
      actualizarVistaCatalogoAdmin();
      sincronizarVistaTiendaTrasCambioCatalogo();

      mostrarToast(
        `Descuentos quitados en ${resultado.actualizados} producto${resultado.actualizados !== 1 ? 's' : ''}.`
      );
    } catch (error) {
      mostrarToast(error?.message || 'No se pudieron quitar los descuentos.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
    return;
  }

  const tipoAjuste = tipo === 'aumento' ? 'aumento' : 'descuento';
  const porcentajeIngresado = Number(inputPorcentaje?.value);

  if (!Number.isFinite(porcentajeIngresado) || porcentajeIngresado <= 0) {
    mostrarToast('Ingresá un porcentaje válido mayor a cero.', 'error');
    inputPorcentaje?.focus();
    return;
  }

  const porcentaje = tipoAjuste === 'descuento' ? -porcentajeIngresado : porcentajeIngresado;
  const confirmar = confirm(
    `¿Confirmás aplicar un ${tipoAjuste} del ${porcentajeIngresado}% sobre ${alcance}?`
  );
  if (!confirmar) return;

  if (btn) btn.disabled = true;

  try {
    const resultado = await apiFetch('/api/productos/actualizar-precios-masivo', {
      method: 'PUT',
      body: JSON.stringify({
        porcentaje,
        ...(categoria ? { categoria } : {}),
      }),
    });

    await cargarProductos({ todos: true });
    actualizarVistaCatalogoAdmin();
    sincronizarVistaTiendaTrasCambioCatalogo();

    const signo = tipoAjuste === 'aumento' ? '+' : '-';
    mostrarToast(
      `Precios actualizados: ${resultado.actualizados} producto${resultado.actualizados !== 1 ? 's' : ''} (${signo}${porcentajeIngresado}%).`
    );
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo aplicar la actualización masiva.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function cambiarEstadoPedidoAdmin(id, nuevoEstado) {
  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) return;

  try {
    await apiFetch('/api/pedidos/cambiar-estado', {
      method: 'POST',
      body: JSON.stringify({ id, nuevoEstado }),
    });

    pedido.estado = nuevoEstado;
    renderizarTablaPedidosAdmin(pedidos);

    const modalAbierto = document.getElementById('order-modal')?.classList.contains('is-open');
    if (modalAbierto) abrirModalPedido(id);

    await Promise.all([cargarEstadisticasAdmin(), cargarMetricasDashboard()]);
    renderizarGraficoVentasAdmin(estadisticasAdmin);
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo actualizar el estado del pedido.', 'error');
    cargarPanelAdmin();
  }
}

function abrirModalPedido(id) {
  const pedido = pedidos.find((p) => p.id === id);
  if (!pedido) return;

  const modal = document.getElementById('order-modal');
  const modalId = document.getElementById('order-modal-id');
  const modalBody = document.getElementById('order-modal-body');
  const claseEstado = obtenerClaseEstado(pedido.estado);

  if (modalId) modalId.textContent = pedido.id;

  const productosHtml = (pedido.productos || [])
    .map(
      (item) => `
        <li class="detail-product">
          <span class="detail-product__name">${item.talle ? `${item.nombre} — Talle ${item.talle}` : item.nombre}</span>
          <div class="detail-product__meta">
            <div>x${item.cantidad} · ${formatearPrecio(item.precio)} c/u</div>
            <div class="detail-product__subtotal">${formatearPrecio(item.precio * item.cantidad)}</div>
          </div>
        </li>
      `
    )
    .join('');

  if (modalBody) {
    modalBody.innerHTML = `
      <div class="detail-section">
        <h3 class="detail-section__title">Estado</h3>
        <div class="detail-estado-row">
          ${crearBadgeEstadoPedido(pedido.estado)}
          <select
            class="status-select status-select--${claseEstado}"
            data-order-id="${escaparAtributoHtml(pedido.id)}"
            aria-label="Cambiar estado del pedido"
          >
            ${crearOpcionesEstado(pedido.estado)}
          </select>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section__title">Cliente</h3>
        <div class="detail-grid">
          <div class="detail-row">
            <span class="detail-row__label">Nombre</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.nombre || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Teléfono</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.telefono || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Dirección</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.direccion || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Localidad</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.localidad || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Provincia</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.provincia || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Código postal</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.cliente?.codigoPostal || '—')}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section__title">Pago y entrega</h3>
        <div class="detail-grid">
          <div class="detail-row">
            <span class="detail-row__label">Método de pago</span>
            <span class="detail-row__value">${escaparTextoHtml(pedido.metodoPago || '—')}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Fecha</span>
            <span class="detail-row__value">${formatearFechaCorta(pedido.fecha)}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section__title">Productos</h3>
        <ul class="detail-products">${productosHtml}</ul>
        <div class="detail-total">
          <span class="detail-total__label">Total</span>
          <span class="detail-total__value">${formatearPrecio(pedido.total)}</span>
        </div>
      </div>
    `;
  }

  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function cerrarModalPedido() {
  const modal = document.getElementById('order-modal');
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function inicializarEventosAdmin() {
  const tbody = document.getElementById('admin-orders-body');
  const btnRefresh = document.getElementById('btn-refresh');
  const modalClose = document.getElementById('order-modal-close');
  const modalOverlay = document.getElementById('order-modal-overlay');
  const productModalClose = document.getElementById('product-modal-close');
  const productModalCancel = document.getElementById('product-modal-cancel');
  const productModalOverlay = document.getElementById('product-modal-overlay');
  const productoImagenFrenteInput = document.getElementById('producto-imagen-frente');
  const productoImagenEspaldaInput = document.getElementById('producto-imagen-espalda');
  const btnAbrirCrearSeccion = document.getElementById('btn-abrir-crear-seccion');
  const modalCrearSeccionForm = document.getElementById('modal-crear-seccion-form');
  const modalCrearSeccionCerrar = document.getElementById('modal-crear-seccion-cerrar');
  const modalCrearSeccionCancelar = document.getElementById('modal-crear-seccion-cancelar');
  const modalCrearSeccionOverlay = document.getElementById('modal-crear-seccion-overlay');
  const modalDetalleSeccionCerrar = document.getElementById('modal-detalle-seccion-cerrar');
  const modalDetalleSeccionOverlay = document.getElementById('modal-detalle-seccion-overlay');
  const btnGuardarNombreSeccion = document.getElementById('btn-guardar-nombre-seccion');
  const btnGuardarEscudoSeccion = document.getElementById('btn-guardar-escudo-seccion');
  const seccionEscudoInput = document.getElementById('seccion-escudo-input');
  const seccionNombreInput = document.getElementById('seccion-nombre-input');
  const listaProductosSeccionModal = document.getElementById('lista-productos-seccion-modal');
  const btnModalAgregarProducto = document.getElementById('btn-modal-agregar-producto');
  const btnModalAgregarProductoExistente = document.getElementById('btn-modal-agregar-producto-existente');
  const modalAgregarProductoExistenteCerrar = document.getElementById('modal-agregar-producto-existente-cerrar');
  const modalAgregarProductoExistenteOverlay = document.getElementById('modal-agregar-producto-existente-overlay');
  const buscarProductoExistente = document.getElementById('buscar-producto-existente');
  const listaProductosDisponibles = document.getElementById('lista-productos-disponibles');
  const sectionsList = document.getElementById('lista-secciones-admin');
  const sidebarLinks = document.querySelectorAll('.admin-sidebar__link[data-admin-panel]');

  productoImagenFrenteInput?.addEventListener('change', (event) => {
    manejarSeleccionImagenProducto(event, 'frente');
  });
  productoImagenEspaldaInput?.addEventListener('change', (event) => {
    manejarSeleccionImagenProducto(event, 'espalda');
  });
  document.getElementById('producto-imagen-frente-quitar')?.addEventListener('click', () => {
    quitarImagenFormulario('frente');
  });
  document.getElementById('producto-imagen-espalda-quitar')?.addEventListener('click', () => {
    quitarImagenFormulario('espalda');
  });
  btnAbrirCrearSeccion?.addEventListener('click', abrirModalCrearSeccion);
  document.getElementById('modal-seccion-escudo')?.addEventListener('change', manejarSeleccionEscudoSeccion);
  modalCrearSeccionForm?.addEventListener('submit', crearSeccionDesdeModal);
  modalCrearSeccionCerrar?.addEventListener('click', cerrarModalCrearSeccion);
  modalCrearSeccionCancelar?.addEventListener('click', cerrarModalCrearSeccion);
  modalCrearSeccionOverlay?.addEventListener('click', cerrarModalCrearSeccion);
  modalDetalleSeccionCerrar?.addEventListener('click', cerrarModalDetalleSeccion);
  modalDetalleSeccionOverlay?.addEventListener('click', cerrarModalDetalleSeccion);
  btnGuardarNombreSeccion?.addEventListener('click', guardarNombreSeccion);
  btnGuardarEscudoSeccion?.addEventListener('click', guardarEscudoSeccion);
  document.getElementById('seccion-mostrar-carrusel')?.addEventListener('change', guardarMostrarEnCarruselSeccion);
  seccionEscudoInput?.addEventListener('change', manejarSeleccionEscudoDetalle);
  seccionNombreInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      guardarNombreSeccion();
    }
  });
  listaProductosSeccionModal?.addEventListener('click', (event) => {
    const btnEditar = event.target.closest('.btn-editar');
    if (btnEditar) {
      abrirModalEditar(btnEditar.dataset.productId);
      return;
    }

    const btnEliminar = event.target.closest('.btn-eliminar');
    if (btnEliminar) {
      eliminarProducto(btnEliminar.dataset.productId, { desdeSeccion: true });
    }
  });

  listaProductosSeccionModal?.addEventListener('change', (event) => {
    const toggle = event.target.closest('.admin-toggle-producto');
    if (!toggle) return;
    cambiarEstadoActivoProducto(toggle.dataset.productId, toggle.checked, toggle);
  });
  btnModalAgregarProducto?.addEventListener('click', abrirAgregarProductoDesdeSeccion);
  btnModalAgregarProductoExistente?.addEventListener('click', abrirModalAgregarProductoExistente);
  modalAgregarProductoExistenteCerrar?.addEventListener('click', cerrarModalAgregarProductoExistente);
  modalAgregarProductoExistenteOverlay?.addEventListener('click', cerrarModalAgregarProductoExistente);
  buscarProductoExistente?.addEventListener('input', (event) => {
    renderizarProductosDisponiblesParaSeccion(event.target.value);
  });
  listaProductosDisponibles?.addEventListener('click', (event) => {
    const btn = event.target.closest('.producto-existente-item__btn');
    if (!btn) return;
    asignarProductoASeccion(btn.dataset.productId);
  });

  sectionsList?.addEventListener('click', (e) => {
    const btnSubtipo = e.target.closest('.btn-agregar-subtipo-calzado');
    if (btnSubtipo) {
      e.stopPropagation();
      abrirModalCrearSeccion({ padreId: Number(btnSubtipo.dataset.padreId) });
      return;
    }

    const btnEliminar = e.target.closest('.btn-eliminar-seccion');
    if (btnEliminar) {
      e.stopPropagation();
      eliminarSeccion(btnEliminar.dataset.id);
      return;
    }

    const fila = e.target.closest('.seccion-fila');
    if (!fila) return;
    abrirModalDetalleSeccion(fila.dataset.id);
  });

  sectionsList?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const fila = e.target.closest('.seccion-fila');
    if (!fila || e.target.closest('.btn-eliminar-seccion') || e.target.closest('.btn-agregar-subtipo-calzado')) return;

    e.preventDefault();
    abrirModalDetalleSeccion(fila.dataset.id);
  });

  document.getElementById('btn-aplicar-precios-masivo')?.addEventListener('click', aplicarActualizacionPreciosMasivo);
  document.getElementById('precios-masivo-tipo')?.addEventListener('change', actualizarControlesPreciosMasivo);
  document.getElementById('btn-quitar-descuento-producto')?.addEventListener('click', quitarDescuentoProducto);
  document.getElementById('producto-en-oferta')?.addEventListener('change', actualizarControlesOfertaFormulario);
  document.getElementById('producto-precio-oferta')?.addEventListener('input', actualizarBotonQuitarDescuentoProducto);
  document.getElementById('form-configuracion')?.addEventListener('submit', guardarConfiguracion);
  document.getElementById('form-crear-cupon')?.addEventListener('submit', crearCuponAdmin);
  document.getElementById('cupon-tipo-filtro')?.addEventListener('change', actualizarCamposFiltroCupon);
  document.getElementById('cupon-producto-buscar')?.addEventListener('input', () => {
    if (!Array.isArray(cuponProductosCache)) {
      cargarOpcionesProductoCupon();
      return;
    }
    renderizarOpcionesProductoCupon(
      cuponProductosCache,
      document.getElementById('cupon-producto-buscar')?.value || ''
    );
  });
  actualizarCamposFiltroCupon();
  document.getElementById('admin-cupones-tbody')?.addEventListener('change', toggleCuponActivoAdmin);
  document.getElementById('portada-buscar')?.addEventListener('input', () => {
    if (panelAdminActivo === 'portada') renderizarGestionPortada();
  });
  document.getElementById('admin-portada-grid')?.addEventListener('change', (event) => {
    const toggle = event.target.closest('.admin-portada-toggle');
    if (!toggle) return;
    cambiarAtributoPortadaProducto(
      toggle.dataset.productId,
      toggle.dataset.campo,
      toggle.checked,
      toggle
    );
  });
  document.getElementById('producto-stock-talles')?.addEventListener('input', actualizarTotalStockFormulario);
  document.getElementById('producto-categoria-tipo')?.addEventListener('change', alCambiarCategoriaTipoProducto);
  document.getElementById('producto-categoria')?.addEventListener('change', (event) => {
    sincronizarCategoriaTipoConSeccion(event.target.value);
  });
  document.getElementById('producto-imagen-frente-url')?.addEventListener('input', (event) => {
    const url = String(event.target.value || '').trim();
    if (!url) return;
    imagenFrenteFormulario = url;
    actualizarVistaPreviaImagenFormulario('frente');
  });
  document.getElementById('producto-imagen-espalda-url')?.addEventListener('input', (event) => {
    const url = String(event.target.value || '').trim();
    if (!url) return;
    imagenEspaldaFormulario = url;
    actualizarVistaPreviaImagenFormulario('espalda');
  });
  document.getElementById('header-panel-control-btn')?.addEventListener('click', () => {
    if (!esSesionAdminActiva()) return;
    if (esPaginaCuenta()) {
      window.location.href = 'index.html';
      return;
    }
    mostrarVistaAdmin();
    cargarPanelAdmin();
  });

  sidebarLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarPanelAdmin(link.dataset.adminPanel);
    });
  });

  productModalClose?.addEventListener('click', cerrarModalProducto);
  productModalCancel?.addEventListener('click', cerrarModalProducto);
  productModalOverlay?.addEventListener('click', cerrarModalProducto);

  const modalBody = document.getElementById('order-modal-body');
  modalBody?.addEventListener('change', (e) => {
    if (!e.target.matches('.status-select')) return;
    cambiarEstadoPedidoAdmin(e.target.dataset.orderId, e.target.value);
  });

  tbody?.addEventListener('change', (e) => {
    if (!e.target.matches('.status-select')) return;
    cambiarEstadoPedidoAdmin(e.target.dataset.orderId, e.target.value);
  });

  tbody?.addEventListener('click', (e) => {
    const btnEtiqueta = e.target.closest('.btn-etiqueta-envio');
    if (btnEtiqueta) {
      abrirEtiquetaEnvio(btnEtiqueta.dataset.orderId);
      return;
    }

    const btnNotificar = e.target.closest('.btn-notificar-despacho');
    if (btnNotificar) {
      notificarDespachoServidor(btnNotificar.dataset.orderId, btnNotificar);
      return;
    }

    const btn = e.target.closest('.btn-detail');
    if (!btn) return;
    abrirModalPedido(btn.dataset.orderId);
  });

  btnRefresh?.addEventListener('click', () => cargarPanelAdmin());
  document.getElementById('btn-volver-tienda')?.addEventListener('click', volverATiendaDesdeAdmin);
  modalClose?.addEventListener('click', cerrarModalPedido);
  modalOverlay?.addEventListener('click', cerrarModalPedido);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && esSesionAdminActiva()) {
      cargarPanelAdmin();
    }
  });
}

function inicializarAutenticacion() {
  const accessBtn = document.getElementById('admin-access-btn');
  const loginForm = document.getElementById('auth-login-form');
  const registroForm = document.getElementById('auth-registro-form');
  const authClose = document.getElementById('auth-modal-close');
  const authOverlay = document.getElementById('auth-modal-overlay');
  const authTabs = document.getElementById('auth-tabs');
  const btnVolverLoginVerificacion = document.getElementById('btn-volver-login-verificacion');
  const btnConfirmarRegistro = document.getElementById('btn-confirmar-registro');
  const btnLogout = document.getElementById('btn-logout');
  const codeInput = document.getElementById('verification-code-input');

  accessBtn?.addEventListener('click', manejarClickAccesoCuenta);
  loginForm?.addEventListener('submit', iniciarSesion);
  registroForm?.addEventListener('submit', solicitarRegistro);
  authClose?.addEventListener('click', cerrarAuthModal);
  authOverlay?.addEventListener('click', cerrarAuthModal);
  btnVolverLoginVerificacion?.addEventListener('click', () => cambiarVistaAuth('login'));
  btnConfirmarRegistro?.addEventListener('click', confirmarRegistro);
  btnLogout?.addEventListener('click', cerrarSesion);

  authTabs?.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-auth-tab]');
    if (!tab) return;
    cambiarVistaAuth(tab.dataset.authTab);
  });

  codeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  inicializarEventosAdmin();
  inicializarMenuCuentaHeader();
  restaurarSesion();
  actualizarUIUsuario();
}

document.addEventListener('DOMContentLoaded', async () => {
  inicializarToastContainer();
  inicializarHeaderScroll();
  inicializarMenuMobile();
  inicializarBuscadorMobile();

  const pagina = document.body?.dataset?.page || 'index';

  if (pagina === 'cuenta') {
    inicializarAutenticacion();
    inicializarBuscadorPedidos();
    inicializarCuenta();
    await cargarConfiguracionTienda();
    return;
  }

  if (pagina === 'info') {
    inicializarInfo();
    inicializarAutenticacion();
    inicializarBuscadorPedidos();
    await cargarConfiguracionTienda();
    return;
  }

  await cargarConfiguracionTienda();

  const hashInformativo = window.location.hash.replace('#', '');
  const panelInfo =
    hashInformativo === 'terminos' ? 'cambios' : hashInformativo;
  if (PANELES_INFO.includes(panelInfo)) {
    window.location.replace(`info.html#${panelInfo}`);
    return;
  }

  inicializarDropdownCategorias();
  inicializarClubNav();
  inicializarHeroStage();
  inicializarStadiumCarousel();
  inicializarNewsletter();
  inicializarDetalleProducto();
  inicializarDropdownOrden();
  inicializarDropdownGenero();
  inicializarBuscador();
  inicializarEnlaceProductos();
  await cargarSecciones();
  renderizarCarruselSecciones();
  renderizarEnlacesMenuMobile();
  const productosCargados = await cargarProductos();
  renderizarSelectCategorias();
  if (productosCargados) {
    renderizarStadiumCarousel();
    renderizarProductos();
  }
  actualizarContadorProductosAdmin();
  inicializarCarrito();
  inicializarCheckout();
  inicializarTracking();
  inicializarTeclado();
  inicializarAutenticacion();
});
