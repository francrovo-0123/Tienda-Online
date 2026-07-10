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

  const porcentaje = Number(valor);
  const base = Number(precioBase);

  if (!Number.isFinite(porcentaje) || porcentaje <= 0 || porcentaje >= 100) return null;
  if (!Number.isFinite(base) || base <= 0) return null;

  return Math.max(1, Math.round(base * (1 - porcentaje / 100)));
}

function obtenerDescuentoOfertaFormulario(producto) {
  if (!tieneOfertaValida(producto)) return '';
  return String(calcularDescuentoPorcentaje(producto.precio, producto.precioOferta));
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
  if (!btn) return;

  const producto =
    editandoProductoId !== null ? productos.find((p) => p.id === editandoProductoId) : null;
  const tieneDescuentoGuardado = Boolean(producto && tieneOfertaValida(producto));
  const tieneValorEnInput = Boolean(input?.value?.trim());

  btn.classList.toggle('hidden', !(tieneDescuentoGuardado || tieneValorEnInput));
}

async function quitarDescuentoProducto() {
  const input = document.getElementById('producto-precio-oferta');
  if (input) input.value = '';

  if (editandoProductoId === null) {
    actualizarBotonQuitarDescuentoProducto();
    mostrarToast('Descuento quitado del formulario.');
    return;
  }

  const producto = productos.find((p) => p.id === editandoProductoId);
  if (!producto) return;

  if (!tieneOfertaValida(producto)) {
    actualizarBotonQuitarDescuentoProducto();
    return;
  }

  const btn = document.getElementById('btn-quitar-descuento-producto');
  btn?.setAttribute('disabled', 'true');

  try {
    const actualizado = await apiFetch(`/api/productos/${producto.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: producto.nombre,
        precio: producto.precio,
        precioOferta: '',
        categoria: producto.categoria,
        genero: producto.genero || 'hombre',
        stock: producto.stock ?? 0,
        descripcion: producto.descripcion || '',
        imagenFrente: obtenerImagenFrente(producto),
        imagenEspalda: obtenerImagenEspalda(producto),
        talles: producto.talles,
      }),
    });

    const indice = productos.findIndex((p) => p.id === producto.id);
    if (indice !== -1) productos[indice] = actualizado;

    actualizarBotonQuitarDescuentoProducto();
    actualizarVistaCatalogoAdmin();
    sincronizarVistaTiendaTrasCambioCatalogo();
    mostrarToast(`Descuento quitado de «${actualizado.nombre}».`);
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
let NOMBRE_TIENDA = 'Jerseys Store';
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
const ESTADOS_PEDIDO = [
  'Pendiente de pago',
  'pendiente_pago',
  'Aprobado',
  'Preparación de pedido',
  'Enviado',
  'Entregado',
  'Rechazado',
  'cancelado',
];
const ESTADOS_PEDIDO_LEGACY = {
  Pendiente: 'Pendiente de pago',
  'En Preparación': 'Preparación de pedido',
  Listo: 'Entregado',
  pagado: 'Aprobado',
  confirmado: 'Aprobado',
};
const CLUB_NAV_ESCUDO_MAX = 68;
const TALLES_DISPONIBLES = ['S', 'M', 'L', 'XL', 'XXL'];

const seccionesEjemplo = [
  { id: 1, nombre: 'Remeras', escudo: '' },
  { id: 2, nombre: 'Camperas', escudo: '' },
  { id: 3, nombre: 'Pantalones', escudo: '' },
];

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

async function cargarConfiguracionTienda() {
  try {
    const respuesta = await fetch(`${API_BASE}/api/config`);
    if (!respuesta.ok) {
      throw new Error('No se pudo cargar la configuración de la tienda.');
    }

    const config = await respuesta.json();
    NOMBRE_TIENDA = String(config.nombreTienda || 'Jerseys Store').trim() || 'Jerseys Store';
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
  const partes = String(nombre || 'Jerseys Store').trim().split(/\s+/);
  if (partes.length <= 1) {
    return { marca: partes[0] || 'Jerseys', sufijo: 'Store' };
  }

  return {
    marca: partes.slice(0, -1).join(' '),
    sufijo: partes[partes.length - 1],
  };
}

function aplicarMarcaTienda() {
  const nombre = NOMBRE_TIENDA || 'Jerseys Store';
  const { marca, sufijo } = dividirNombreTienda(nombre);
  const enAdmin = document.body.classList.contains('admin-active');

  document.title = enAdmin ? `${nombre} - Panel de Administración` : nombre;

  document.querySelectorAll('.logo-text__brand').forEach((el) => {
    el.textContent = marca;
  });
  document.querySelectorAll('.logo-text__store').forEach((el) => {
    el.textContent = sufijo;
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

async function apiFetch(ruta, opciones = {}) {
  const esFormData = opciones.body instanceof FormData;
  const headers = { ...opciones.headers };

  if (!esFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || localStorage.getItem(CLIENTE_TOKEN_KEY);
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${API_BASE}${ruta}`, {
    ...opciones,
    headers,
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    if (respuesta.status === 404 && !datos.error) {
      throw new Error('El servidor no reconoce esta acción. Reiniciá el servidor e intentá de nuevo.');
    }
    throw new Error(datos.error || 'Error en la petición al servidor.');
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
    'Pendiente de pago': 'pendiente',
    pendiente_pago: 'pendiente',
    Aprobado: 'aprobado',
    'Preparación de pedido': 'preparacion',
    Enviado: 'enviado',
    Entregado: 'entregado',
    Rechazado: 'rechazado',
    cancelado: 'rechazado',
  };
  return mapa[estadoNormalizado] || 'pendiente';
}

function obtenerEtiquetaEstado(estado) {
  return normalizarEstadoPedidoCliente(estado);
}

function normalizarEstadoPedidoCliente(estado) {
  const valor = String(estado || '').trim();
  if (valor === 'pendiente_pago') return 'Pendiente de pago';
  if (valor === 'cancelado') return 'Cancelado';
  if (ESTADOS_PEDIDO.includes(valor)) return valor;
  return ESTADOS_PEDIDO_LEGACY[valor] || 'Pendiente de pago';
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

function renderizarSelectCategorias() {
  const select = document.getElementById('producto-categoria');
  if (!select) return;

  const opciones = secciones
    .map((seccion) => `<option value="${seccion.nombre}">${seccion.nombre}</option>`)
    .join('');

  const valorActual = select.value;
  select.innerHTML = `<option value="" disabled ${valorActual ? '' : 'selected'}>Seleccioná una sección</option>${opciones}`;

  if (valorActual && secciones.some((seccion) => seccion.nombre === valorActual)) {
    select.value = valorActual;
  }

  renderizarSelectCategoriasPreciosMasivo();
}

function renderizarSelectCategoriasPreciosMasivo() {
  const select = document.getElementById('precios-masivo-categoria');
  if (!select) return;

  const valorActual = select.value;
  const opciones = secciones
    .map((seccion) => `<option value="${seccion.nombre}">${seccion.nombre}</option>`)
    .join('');

  select.innerHTML = `<option value="">Todas las categorías</option>${opciones}`;

  if (valorActual && (valorActual === '' || secciones.some((seccion) => seccion.nombre === valorActual))) {
    select.value = valorActual;
  }
}

function renderizarSeccionesAdmin() {
  const lista = document.getElementById('lista-secciones-admin');
  const emptyEl = document.getElementById('admin-sections-empty');
  if (!lista) return;

  const vacio = secciones.length === 0;
  lista.innerHTML = '';
  emptyEl?.classList.toggle('hidden', !vacio);

  if (vacio) return;

  lista.innerHTML = secciones
    .map((seccion) => {
      const total = contarProductosPorSeccion(seccion.nombre);
      const textoProductos = total === 1 ? '1 producto' : `${total} productos`;

      return `
        <div class="seccion-fila" data-id="${seccion.id}" role="button" tabindex="0" aria-label="Gestionar sección ${seccion.nombre}">
          <div class="seccion-info">
            ${
              obtenerEscudoSeccion(seccion) && esUrlEscudoValida(obtenerEscudoSeccion(seccion))
                ? `<img class="seccion-icono seccion-icono--img" src="${escaparAtributoHtml(optimizarUrlEscudo(obtenerEscudoSeccion(seccion)))}" alt="" width="28" height="28" loading="lazy">`
                : '<span class="seccion-icono">📁</span>'
            }
            <strong class="seccion-nombre">${seccion.nombre}</strong>
            <span class="seccion-badge-contador">${textoProductos}</span>
          </div>
          <button
            type="button"
            class="btn-eliminar-seccion"
            data-id="${seccion.id}"
            title="Eliminar sección"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Eliminar
          </button>
        </div>
      `;
    })
    .join('');
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

function abrirModalCrearSeccion() {
  const modal = document.getElementById('modal-crear-seccion');
  if (!modal) return;

  document.getElementById('modal-crear-seccion-form')?.reset();
  limpiarPreviewEscudoSeccion();
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  document.getElementById('modal-seccion-nombre')?.focus();
}

function cerrarModalCrearSeccion() {
  const modal = document.getElementById('modal-crear-seccion');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  document.getElementById('modal-crear-seccion-form')?.reset();
  limpiarPreviewEscudoSeccion();
}

async function crearSeccionDesdeModal(event) {
  event.preventDefault();

  const input = document.getElementById('modal-seccion-nombre');
  const nombre = input?.value.trim();
  if (!nombre) return;

  const submitBtn = document.querySelector('#modal-crear-seccion-form .seccion-modal-form__submit');
  submitBtn?.setAttribute('disabled', 'true');

  try {
    let escudoUrl = '';
    if (archivoEscudoPendiente) {
      escudoUrl = await subirImagenACloudinary(archivoEscudoPendiente);
    }

    const nuevaSeccion = await apiFetch('/api/secciones', {
      method: 'POST',
      body: JSON.stringify({ nombre, escudo: escudoUrl }),
    });

    await cargarSecciones();
    renderizarFiltrosCategorias(productos);
    cerrarModalCrearSeccion();
    mostrarToast('Sección creada correctamente.');
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
    lista.innerHTML = '<p class="seccion-modal-vacio">No hay productos en esta sección todavía.</p>';
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
  if (input && seccion) input.value = seccion.nombre;
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
      body: JSON.stringify({ nombre: seccion.nombre, escudo: escudoUrl }),
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

function abrirAgregarProductoDesdeSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  const nombreSeccion = seccion.nombre;
  ocultarModalDetalleSeccionTemporalmente();
  abrirModalProducto(nombreSeccion);
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
      precioOferta: producto.precioOferta ?? '',
      categoria: seccion.nombre,
      genero: producto.genero || 'hombre',
      stock: producto.stock ?? 0,
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

  const totalProductos = contarProductosPorSeccion(seccion.nombre);
  if (totalProductos > 0) {
    mostrarToast(
      `No podés eliminar «${seccion.nombre}» porque tiene ${totalProductos} producto${totalProductos !== 1 ? 's' : ''}. Eliminá o reasigná esos productos primero.`,
      'error'
    );
    return;
  }

  const confirmar = window.confirm(`¿Eliminar la sección «${seccion.nombre}»?`);
  if (!confirmar) return;

  try {
    await apiFetch(`/api/secciones/${seccion.id}`, { method: 'DELETE' });
    secciones = secciones.filter((item) => item.id !== seccion.id);
    actualizarVistaSecciones();
    mostrarToast('Sección eliminada.');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo eliminar la sección.', 'error');
  }
}

async function guardarNombreSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

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
      body: JSON.stringify({ nombre: nuevoNombre }),
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

    productos = productos.filter((item) => item.id !== Number(id));
    carrito = carrito.filter((item) => item.id !== Number(id));
    guardarCarritoEnLocalStorage();
    actualizarContadorProductosAdmin();
    renderizarSeccionesAdmin();
    actualizarVistaCatalogoAdmin();
    actualizarCarritoUI();
    renderizarFiltrosCategorias(productos);
    renderizarProductos();
    renderizarStadiumCarousel();

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

function obtenerTallesProducto(producto) {
  if (!productoTieneStock(producto)) return [];
  if (Array.isArray(producto.talles) && producto.talles.length > 0) return producto.talles;
  return [];
}

function obtenerTallesDelFormulario() {
  return [...document.querySelectorAll('input[name="producto-talle"]:checked')]
    .map((input) => input.value)
    .filter((talle) => TALLES_DISPONIBLES.includes(talle));
}

function establecerTallesEnFormulario(talles = TALLES_DISPONIBLES) {
  const tallesActivos = new Set(
    Array.isArray(talles) ? talles.map((talle) => String(talle).toUpperCase()) : []
  );

  document.querySelectorAll('input[name="producto-talle"]').forEach((input) => {
    input.checked = tallesActivos.has(input.value);
  });
}

function restablecerFormularioProducto() {
  const stockInput = document.getElementById('producto-stock');
  const descripcionInput = document.getElementById('producto-descripcion');
  const precioOfertaInput = document.getElementById('producto-precio-oferta');
  const generoSelect = document.getElementById('producto-genero');

  if (stockInput) stockInput.value = '10';
  if (descripcionInput) descripcionInput.value = '';
  if (precioOfertaInput) precioOfertaInput.value = '';
  if (generoSelect) generoSelect.value = 'hombre';
  establecerTallesEnFormulario(TALLES_DISPONIBLES);
  actualizarBotonQuitarDescuentoProducto();
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
    const coincideCategoria =
      categoriaFiltroActiva === 'todos' || producto.categoria === categoriaFiltroActiva;
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

function crearHtmlBotonesTalles(producto) {
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
          data-talle="${talle}"
          onclick="seleccionarTalle(${producto.id}, '${talle}')"
          aria-label="Talle ${talle}"
          aria-pressed="${talle === talleActivo}"
        >${talle}</button>
      `
    )
    .join('');

  return `
    <span class="selector-talles__label">Talle</span>
    ${botones}
  `;
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
    ? `<span class="precio-tachado">${formatearPrecio(producto.precio)}</span> ${formatearPrecio(producto.precioOferta)}`
    : formatearPrecio(producto.precio);
  descripcion.textContent = producto.descripcion || 'Sin descripción disponible.';

  renderizarMiniaturasDetalleProducto(imagenes);

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function cerrarDetalleProducto() {
  const modal = document.getElementById('product-detail-modal');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  delete modal.dataset.productId;
  document.body.classList.remove('modal-open');
}

function inicializarDetalleProducto() {
  const modal = document.getElementById('product-detail-modal');
  const overlay = document.getElementById('product-detail-modal-overlay');
  const closeBtn = document.getElementById('product-detail-modal-close');
  const thumbs = document.getElementById('product-detail-thumbs');

  closeBtn?.addEventListener('click', cerrarDetalleProducto);
  overlay?.addEventListener('click', cerrarDetalleProducto);

  thumbs?.addEventListener('click', (event) => {
    const thumb = event.target.closest('.product-detail-modal__thumb');
    if (!thumb) return;
    seleccionarImagenDetalleProducto(Number(thumb.dataset.index));
  });
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
          height="800"
        >
        <img
          class="product-card__image img-espalda"
          src="${imagenEspalda}"
          alt="${producto.nombre} — espalda"
          loading="lazy"
          width="600"
          height="800"
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

function seleccionarTalle(productoId, talle) {
  const yaSeleccionado = tallesSeleccionados[productoId] === talle;

  if (yaSeleccionado) {
    delete tallesSeleccionados[productoId];
  } else {
    tallesSeleccionados[productoId] = talle;
  }

  const contenedor = document.getElementById(`talles-${productoId}`);
  if (!contenedor) return;

  const nuevoTalle = tallesSeleccionados[productoId] ?? null;

  contenedor.querySelectorAll('.talle-btn').forEach((btn) => {
    const activo = btn.dataset.talle === nuevoTalle;
    btn.classList.toggle('selected', activo);
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
  });
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

  const transform = opciones.transform || 'c_scale,w_500,h_667,q_auto,f_auto';
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
  return nombre === 'todos' || secciones.some((seccion) => seccion.nombre === nombre);
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
    titulo && (titulo.textContent = 'Colección destacada');
    subtitulo &&
      (subtitulo.textContent = 'Selección curada de nuestras piezas más exclusivas');
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

  if (scroll && (categoriaFiltroActiva !== 'todos' || ligaFiltroActiva)) {
    document.getElementById('coleccion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
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

  if (
    categoriaFiltroActiva !== 'todos' &&
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
    ...secciones.map((seccion) =>
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
  const filtrados = ordenarListaProductos(filtrarProductos(productos));

  return [...filtrados]
    .sort((a, b) => {
      const ofertaA = tieneOfertaValida(a) ? 1 : 0;
      const ofertaB = tieneOfertaValida(b) ? 1 : 0;
      if (ofertaB !== ofertaA) return ofertaB - ofertaA;
      return Number(b.id) - Number(a.id);
    })
    .slice(0, 12);
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

  const desplazar = (direccion) => {
    const card = track.querySelector('.product-card');
    const gap = parseFloat(getComputedStyle(track).gap) || 16;
    const paso = card ? card.offsetWidth + gap : 260;
    track.scrollBy({ left: direccion * paso, behavior: 'smooth' });
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
    'stadium-carousel-track',
    'stadium-carousel-prev',
    'stadium-carousel-next'
  );
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
    ? `<span class="precio-tachado">${formatearPrecio(productoLocal.precio)}</span> ${formatearPrecio(productoLocal.precioOferta)}`
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
  partes.push(`
    <button type="button" class="mobile-nav__link" data-mobile-nav="cuenta" data-panel="perfil">
      Mi perfil
    </button>
    <button type="button" class="mobile-nav__link" data-mobile-nav="cuenta" data-panel="pedidos">
      Mis pedidos
    </button>
  `);

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

  if (tipo === 'cuenta') {
    cerrarMenuMobile();
    navegarPanelCuenta(enlace.dataset.panel || 'resumen');
  }
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

  let lastY = obtenerScrollY();
  let ticking = false;
  const UMBRAL_SCROLL = 15;

  const obtenerAltura = () => {
    const alto = header.offsetHeight;
    document.documentElement.style.setProperty('--main-header-height', `${alto}px`);
    return alto;
  };

  const mostrar = () => header.classList.remove('main-header--hidden');
  const ocultar = () => header.classList.add('main-header--hidden');

  const actualizar = () => {
    const y = obtenerScrollY();
    const delta = y - lastY;
    const alto = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--main-header-height'),
      10
    ) || obtenerAltura();

    if (y <= 0) {
      mostrar();
      lastY = 0;
      ticking = false;
      return;
    }

    if (y < alto) {
      mostrar();

      if (Math.abs(delta) >= UMBRAL_SCROLL) {
        lastY = y;
      }

      ticking = false;
      return;
    }

    if (Math.abs(delta) >= UMBRAL_SCROLL) {
      if (delta > 0) {
        ocultar();
      } else {
        mostrar();
      }
      lastY = y;
    }

    ticking = false;
  };

  const programarActualizacion = () => {
    if (!ticking) {
      requestAnimationFrame(actualizar);
      ticking = true;
    }
  };

  window.addEventListener('scroll', programarActualizacion, { passive: true });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      obtenerAltura();
      programarActualizacion();
    }, { passive: true });
    window.visualViewport.addEventListener('scroll', programarActualizacion, { passive: true });
  }

  window.addEventListener('resize', obtenerAltura);
  window.addEventListener('header:remeasure', obtenerAltura);

  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(obtenerAltura);
    observer.observe(header);
  }

  obtenerAltura();
  actualizar();
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
      input.blur();
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
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  document.getElementById('producto-nombre')?.focus();
  actualizarBotonQuitarDescuentoProducto();
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
  const stockInput = document.getElementById('producto-stock');
  const descripcionInput = document.getElementById('producto-descripcion');

  if (nombreInput) nombreInput.value = producto.nombre;
  if (precioInput) precioInput.value = producto.precio;
  if (precioOfertaInput) {
    precioOfertaInput.value = obtenerDescuentoOfertaFormulario(producto);
  }
  if (categoriaSelect) categoriaSelect.value = producto.categoria;
  const generoSelect = document.getElementById('producto-genero');
  if (generoSelect) generoSelect.value = producto.genero || 'hombre';
  if (stockInput) stockInput.value = String(producto.stock ?? 0);
  if (descripcionInput) descripcionInput.value = producto.descripcion || '';
  establecerTallesEnFormulario(producto.talles);

  resetearImagenesFormulario();
  imagenFrenteFormulario = obtenerImagenFrente(producto);
  imagenEspaldaFormulario = obtenerImagenEspalda(producto);
  actualizarVistaPreviaImagenFormulario('frente');
  actualizarVistaPreviaImagenFormulario('espalda');

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  nombreInput?.focus();
  actualizarBotonQuitarDescuentoProducto();
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
  const descuentoOfertaRaw = document.getElementById('producto-precio-oferta')?.value ?? '';
  const categoria = document.getElementById('producto-categoria')?.value?.trim() ?? '';
  const genero = document.getElementById('producto-genero')?.value ?? 'hombre';
  const stock = Number(document.getElementById('producto-stock')?.value);
  const descripcion = document.getElementById('producto-descripcion')?.value.trim() ?? '';
  const talles = obtenerTallesDelFormulario();
  const submitBtn = document.querySelector('#product-form .product-form__submit');

  if (nombre.length < 3) {
    mostrarToast('El nombre del producto debe tener al menos 3 caracteres.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio <= 0) {
    mostrarToast('Por favor, ingresá un precio válido mayor a $ 0.', 'error');
    return;
  }

  const descuentoOferta = descuentoOfertaRaw === '' ? null : Number(descuentoOfertaRaw);
  if (descuentoOfertaRaw !== '' && (!Number.isFinite(descuentoOferta) || descuentoOferta <= 0 || descuentoOferta >= 100)) {
    mostrarToast('Ingresá un descuento entre 1% y 99%, o dejá el campo vacío.', 'error');
    return;
  }

  if (!categoria) {
    mostrarToast('Seleccioná una sección para el producto.', 'error');
    return;
  }

  if (secciones.length === 0) {
    mostrarToast('Creá al menos una sección antes de agregar productos.', 'error');
    return;
  }

  if (!Number.isFinite(stock) || stock < 0) {
    mostrarToast('Ingresá un stock válido (0 o mayor).', 'error');
    return;
  }

  if (!talles.length) {
    mostrarToast('Seleccioná al menos un talle disponible.', 'error');
    return;
  }

  const esEdicion = editandoProductoId !== null;
  const tieneImagenFrente = Boolean(imagenFrenteFormulario || archivoPendienteFrente);

  if (!tieneImagenFrente) {
    mostrarToast('Subí al menos la imagen del frente del producto.', 'error');
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

    const precioOferta = normalizarPrecioOfertaFormulario(descuentoOfertaRaw, precio);

    const payload = {
      nombre,
      precio,
      precioOferta: precioOferta !== null ? precioOferta : '',
      categoria,
      genero,
      stock,
      descripcion,
      imagenFrente,
      imagenEspalda,
      talles,
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
      actualizarContadorProductosAdmin();
      renderizarSeccionesAdmin();
      actualizarVistaCatalogoAdmin();
      renderizarFiltrosCategorias(productos);
      renderizarProductos();
      actualizarCarritoUI();
      mostrarToast('Producto actualizado');
      return;
    }

    const nuevoProducto = await apiFetch('/api/productos', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    productos.push(nuevoProducto);
    actualizarContadorProductosAdmin();
    renderizarSeccionesAdmin();
    actualizarVistaCatalogoAdmin();

    cerrarModalProducto();
    renderizarFiltrosCategorias(productos);
    renderizarProductos();
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
  const bloques = [];

  secciones.forEach((seccion) => {
    const productosSeccion = ordenarListaProductos(
      filtrarProductos(productos.filter((producto) => producto.categoria === seccion.nombre))
    );

    if (!productosSeccion.length) return;

    bloques.push(`
      <section class="store-section" id="seccion-${seccion.id}">
        <h3 class="store-section__title">${seccion.nombre}</h3>
        <div class="products-grid" role="list">${productosSeccion.map(crearHtmlTarjetaProducto).join('')}</div>
      </section>
    `);
  });

  const productosSinSeccion = ordenarListaProductos(
    filtrarProductos(productos.filter((producto) => !nombresSecciones.includes(producto.categoria)))
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
  return perfiles[normalizarEmail(email)] || { nombre: '', telefono: '', direccion: '' };
}

function guardarPerfilEntrega(email, datos) {
  const perfiles = obtenerPerfilesEntrega();
  perfiles[normalizarEmail(email)] = {
    nombre: String(datos.nombre || '').trim(),
    telefono: String(datos.telefono || '').trim(),
    direccion: String(datos.direccion || '').trim(),
  };
  localStorage.setItem(CHECKOUT_PERFIL_KEY, JSON.stringify(perfiles));
}

function perfilEntregaCompleto(perfil) {
  return Boolean(
    perfil?.nombre?.trim() &&
    perfil?.telefono?.trim() &&
    perfil?.direccion?.trim()
  );
}

async function obtenerPerfilEntregaCompleto(email) {
  const local = cargarPerfilEntrega(email);
  if (perfilEntregaCompleto(local)) return local;

  try {
    const respuesta = await apiFetch('/api/auth/perfil');
    const perfil = {
      nombre: respuesta.usuario?.nombre || '',
      telefono: respuesta.usuario?.telefono || '',
      direccion: respuesta.usuario?.direccion || '',
    };
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
    await apiFetch('/api/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify({
        nombre: datos.nombre,
        telefono: datos.telefono,
        direccion: datos.direccion,
      }),
    });
  } catch {
    // El pedido igual se registra; el perfil local ya quedó guardado
  }
}

function aplicarPerfilCheckout(perfil) {
  const nombreInput = document.getElementById('checkout-nombre');
  const telefonoInput = document.getElementById('checkout-telefono');
  const direccionInput = document.getElementById('checkout-direccion');

  if (nombreInput) nombreInput.value = perfil?.nombre || '';
  if (telefonoInput) telefonoInput.value = perfil?.telefono || '';
  if (direccionInput) direccionInput.value = perfil?.direccion || '';
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
  const summaryTotal = document.getElementById('checkout-summary-total');
  const submitBtn = document.getElementById('checkout-submit-btn');
  const hint = document.getElementById('checkout-datos-hint');
  const guardarCheckbox = document.getElementById('checkout-guardar-datos');

  if (cuentaEmail) cuentaEmail.textContent = sesion.email;
  if (summaryTotal) summaryTotal.textContent = formatearPrecio(calcularTotal());
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Pagar con Mercado Pago';
  }
  if (hint) {
    hint.textContent = 'Completá tus datos de entrega para continuar.';
  }

  renderizarResumenCheckout();

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
}

async function procesarPedido(event) {
  event.preventDefault();
  if (carrito.length === 0) return;

  const sesion = obtenerSesionUsuario();
  if (!sesion?.email) {
    cerrarCheckout();
    mostrarToast('Para comprar tenés que iniciar sesión o registrarte.', 'error');
    abrirAuthModal();
    return;
  }

  const nombre = document.getElementById('checkout-nombre').value.trim();
  const telefono = document.getElementById('checkout-telefono').value.trim();
  const direccion = document.getElementById('checkout-direccion').value.trim();

  if (nombre.length <= 2) {
    mostrarToast('Por favor, ingresá tu nombre completo.', 'error');
    return;
  }

  const telefonoSoloNumeros = normalizarTelefono(telefono);
  if (!telefono || /[a-zA-Z]/.test(telefono) || telefonoSoloNumeros.length < 8) {
    mostrarToast('Ingresá un número de teléfono válido (solo números).', 'error');
    return;
  }

  if (!direccion) {
    mostrarToast('Por favor, ingresá la dirección de entrega.', 'error');
    return;
  }

  const submitBtn = document.getElementById('checkout-submit-btn');
  const guardarDatos = document.getElementById('checkout-guardar-datos')?.checked;

  submitBtn?.setAttribute('disabled', 'true');
  if (submitBtn) submitBtn.textContent = 'Redirigiendo a Mercado Pago…';

  try {
    if (guardarDatos) {
      guardarPerfilEntrega(sesion.email, { nombre, telefono: telefonoSoloNumeros, direccion });
      await guardarPerfilEntregaEnServidor(sesion.email, {
        nombre,
        telefono: telefonoSoloNumeros,
        direccion,
      });
    }

    const respuestaPago = await apiFetch('/api/pagar', {
      method: 'POST',
      body: JSON.stringify({
        cliente: {
          nombre,
          telefono: telefonoSoloNumeros,
          direccion,
        },
        items: carrito.map((item) => ({
          productoId: item.id,
          talle: item.talle,
          cantidad: item.cantidad,
        })),
      }),
    });

    if (!respuestaPago?.init_point) {
      throw new Error('No se recibió la URL de pago de Mercado Pago.');
    }

    carrito = [];
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
    if (submitBtn) submitBtn.textContent = 'Pagar con Mercado Pago';
  }
}

function enviarAWhatsApp({ idPedido, nombre, telefono, direccion, metodoPago, productos, total }) {
  const emojiCarrito = `\u{1F6D2}`;
  const emojiCliente = `\u{1F464}`;
  const emojiTelefono = `\u{1F4DE}`;
  const emojiEntrega = `\u{1F4CD}`;
  const emojiPago = `\u{1F4B3}`;
  const emojiDetalle = `\u{1F4E6}`;
  const emojiTotal = `\u{1F4B0}`;

  const textoEntrega = direccion
    ? `Envío a domicilio (${direccion})`
    : 'Retiro en local';

  const itemsDetalle = productos
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
${emojiPago} *Pago:* ${metodoPago}
---------------------------------
${emojiDetalle} *Detalle del Pedido:*
${itemsDetalle}
---------------------------------
${emojiTotal} *Total a Pagar: ${formatearPrecio(total)}*`;

  const mensajeEncriptado = encodeURIComponent(mensaje);
  window.open(`https://wa.me/${WHATSAPP_NUMERO}?text=${mensajeEncriptado}`, '_blank');
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
            <td class="orders-table__id">${pedido.id}</td>
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
  const emailInput = document.getElementById('cuenta-perfil-email');
  const nombreInput = document.getElementById('cuenta-perfil-nombre');
  const telefonoInput = document.getElementById('cuenta-perfil-telefono');
  const direccionInput = document.getElementById('cuenta-perfil-direccion');
  const prefPedidos = document.getElementById('cuenta-pref-pedidos');
  const prefPromos = document.getElementById('cuenta-pref-promos');

  if (emailInput) emailInput.value = perfil?.email || '';
  if (nombreInput) nombreInput.value = perfil?.nombre || '';
  if (telefonoInput) telefonoInput.value = perfil?.telefono || '';
  if (direccionInput) direccionInput.value = perfil?.direccion || '';
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
      nombre: usuario.nombre || local.nombre,
      telefono: usuario.telefono || local.telefono,
      direccion: usuario.direccion || local.direccion,
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
  const errorEl = document.getElementById('cuenta-perfil-error');
  const btn = document.getElementById('cuenta-perfil-guardar');

  btn?.setAttribute('disabled', 'true');
  errorEl?.classList.add('hidden');

  try {
    const respuesta = await apiFetch('/api/auth/perfil', {
      method: 'PUT',
      body: JSON.stringify({ nombre, telefono, direccion }),
    });

    guardarPerfilEntrega(sesion.email, { nombre, telefono, direccion });
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

  modalClose?.addEventListener('click', cerrarCheckout);
  modalOverlay?.addEventListener('click', cerrarCheckout);
}

/* ── Página de información ── */

const PANELES_INFO = ['nosotros', 'envios', 'contacto'];

function obtenerPanelInfoDesdeHash() {
  const hash = window.location.hash.replace('#', '');
  return PANELES_INFO.includes(hash) ? hash : 'nosotros';
}

function mostrarPanelInfo(panelId) {
  if (!PANELES_INFO.includes(panelId)) return;

  document.querySelectorAll('[data-info-panel]').forEach((panel) => {
    if (panel.tagName === 'SECTION') {
      panel.hidden = panel.dataset.infoPanel !== panelId;
    }
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
    const sesion = sessionStorage.getItem(SESSION_USER_KEY);
    return sesion ? JSON.parse(sesion) : null;
  } catch {
    return null;
  }
}

function establecerSesion(usuario, token = null) {
  sessionStorage.setItem(
    SESSION_USER_KEY,
    JSON.stringify({ email: usuario.email, rol: usuario.rol })
  );

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
  return sesion?.rol === 'admin' && Boolean(tokenAdmin);
}

function esSesionClienteActiva() {
  const sesion = obtenerSesionUsuario();
  const tokenCliente = localStorage.getItem(CLIENTE_TOKEN_KEY);
  return Boolean(sesion?.email) && sesion?.rol !== 'admin' && Boolean(tokenCliente);
}

function ocultarErroresAuth() {
  document.getElementById('auth-login-error')?.classList.add('hidden');
  document.getElementById('auth-registro-error')?.classList.add('hidden');
  document.getElementById('auth-verificacion-error')?.classList.add('hidden');
}

function cambiarVistaAuth(pantalla) {
  const vistas = {
    login: document.getElementById('auth-view-login'),
    registro: document.getElementById('auth-view-registro'),
    verificacion: document.getElementById('auth-view-verificacion'),
  };

  Object.entries(vistas).forEach(([nombre, elemento]) => {
    elemento?.classList.toggle('hidden', nombre !== pantalla);
  });

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
  const logueado = esSesionClienteActiva();

  if (logueado) {
    accessBtn?.classList.add('is-logged-in');
    accessBtn?.setAttribute('aria-label', 'Abrir menú de cuenta');
    const ingresaText = accessBtn?.querySelector('.header-ingresa-btn__text');
    if (ingresaText) ingresaText.textContent = 'Mi cuenta';
    chevron?.classList.remove('hidden');
    if (emailEl) emailEl.textContent = sesion.email;
    return;
  }

  cerrarMenuCuentaHeader();
  accessBtn?.classList.remove('is-logged-in');
  accessBtn?.setAttribute('aria-label', 'Iniciar sesión');
  const ingresaText = accessBtn?.querySelector('.header-ingresa-btn__text');
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
}

function mostrarVistaTienda() {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');

  if (storeView) storeView.style.display = '';
  if (adminView) adminView.style.display = 'none';

  document.body.classList.remove('admin-active', 'modal-open');
  aplicarMarcaTienda();
  cerrarModalPedido();
  actualizarUIUsuario();
}

async function volverATiendaDesdeAdmin() {
  mostrarVistaTienda();
  await cargarSecciones();
  renderizarCarruselSecciones();
  const ok = await cargarProductos();
  if (ok) {
    renderizarStadiumCarousel();
    renderizarProductos();
  }
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

  sessionStorage.removeItem(SESSION_USER_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(CLIENTE_TOKEN_KEY);
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

    mostrarToast('Te enviamos un código de 6 dígitos. Revisá tu bandeja de Mailtrap.');
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
  const sesion = obtenerSesionUsuario();
  const tokenAdmin = localStorage.getItem(ADMIN_TOKEN_KEY);
  const tokenCliente = localStorage.getItem(CLIENTE_TOKEN_KEY);
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
  configuracion: {
    title: 'Configuración',
    subtitle: 'Personalizá los datos públicos de tu tienda',
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

  if (panel === 'dashboard') {
    renderizarGraficoVentasAdmin();
  }

  if (panel === 'configuracion') {
    cargarFormularioConfiguracion();
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

function actualizarMetricasAdmin(stats = estadisticasAdmin) {
  const facturadoEl = document.getElementById('kpi-facturado');
  const activosEl = document.getElementById('kpi-activos');
  const masBuscadoEl = document.getElementById('kpi-mas-buscado');

  if (facturadoEl) facturadoEl.textContent = formatearPrecio(stats?.totalFacturado ?? 0);
  if (activosEl) activosEl.textContent = stats?.pedidosActivos ?? 0;
  if (masBuscadoEl) masBuscadoEl.textContent = obtenerProductoMasBuscado();
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
      `<option value="${estado}"${estado === actual ? ' selected' : ''}>${estado}</option>`
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
      const claseEstado = obtenerClaseEstado(pedido.estado);
      return `
        <tr data-order-id="${pedido.id}">
          <td><span class="admin-table__id">${pedido.id}</span></td>
          <td>${formatearFechaCorta(pedido.fecha)}</td>
          <td>${pedido.cliente?.nombre || '—'}</td>
          <td>${pedido.cliente?.telefono || '—'}</td>
          <td><span class="admin-table__products" title="${resumirProductos(pedido.productos)}">${resumirProductos(pedido.productos)}</span></td>
          <td class="admin-table__total">${formatearPrecio(pedido.total)}</td>
          <td>
            <select
              class="status-select status-select--${claseEstado}"
              data-order-id="${pedido.id}"
              aria-label="Cambiar estado de ${pedido.id}"
            >
              ${crearOpcionesEstado(pedido.estado)}
            </select>
          </td>
          <td>
            <button
              class="btn-detail"
              type="button"
              data-order-id="${pedido.id}"
            >
              Ver detalle
            </button>
          </td>
        </tr>
      `;
    })
    .join('');
}

async function cargarPanelAdmin() {
  await Promise.all([
    cargarPedidos(),
    cargarProductos({ todos: true }),
    cargarEstadisticasAdmin(),
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

  actualizarMetricasAdmin(estadisticasAdmin);
  renderizarGraficoVentasAdmin(estadisticasAdmin);
  renderizarTablaPedidosAdmin(pedidos);
  actualizarContadorProductosAdmin();
  renderizarSeccionesAdmin();
  cambiarPanelAdmin(panelAdminActivo);
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

    const select = document.querySelector(`.status-select[data-order-id="${id}"]`);
    if (select) {
      const clase = obtenerClaseEstado(nuevoEstado);
      select.className = `status-select status-select--${clase}`;
    }

    await cargarEstadisticasAdmin();
    actualizarMetricasAdmin(estadisticasAdmin);
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
        <span class="detail-badge detail-badge--${claseEstado}">${obtenerEtiquetaEstado(pedido.estado)}</span>
      </div>

      <div class="detail-section">
        <h3 class="detail-section__title">Cliente</h3>
        <div class="detail-grid">
          <div class="detail-row">
            <span class="detail-row__label">Nombre</span>
            <span class="detail-row__value">${pedido.cliente?.nombre || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Teléfono</span>
            <span class="detail-row__value">${pedido.cliente?.telefono || '—'}</span>
          </div>
          <div class="detail-row">
            <span class="detail-row__label">Dirección</span>
            <span class="detail-row__value">${pedido.cliente?.direccion || '—'}</span>
          </div>
        </div>
      </div>

      <div class="detail-section">
        <h3 class="detail-section__title">Pago y entrega</h3>
        <div class="detail-grid">
          <div class="detail-row">
            <span class="detail-row__label">Método de pago</span>
            <span class="detail-row__value">${pedido.metodoPago || '—'}</span>
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
  if (esSesionAdminActiva()) {
    document.body.classList.add('admin-active');
  }
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
    if (!fila || e.target.closest('.btn-eliminar-seccion')) return;

    e.preventDefault();
    abrirModalDetalleSeccion(fila.dataset.id);
  });

  document.getElementById('btn-aplicar-precios-masivo')?.addEventListener('click', aplicarActualizacionPreciosMasivo);
  document.getElementById('precios-masivo-tipo')?.addEventListener('change', actualizarControlesPreciosMasivo);
  document.getElementById('btn-quitar-descuento-producto')?.addEventListener('click', quitarDescuentoProducto);
  document.getElementById('producto-precio-oferta')?.addEventListener('input', actualizarBotonQuitarDescuentoProducto);
  document.getElementById('form-configuracion')?.addEventListener('submit', guardarConfiguracion);

  sidebarLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarPanelAdmin(link.dataset.adminPanel);
    });
  });

  productModalClose?.addEventListener('click', cerrarModalProducto);
  productModalCancel?.addEventListener('click', cerrarModalProducto);
  productModalOverlay?.addEventListener('click', cerrarModalProducto);

  tbody?.addEventListener('change', (e) => {
    if (!e.target.matches('.status-select')) return;
    cambiarEstadoPedidoAdmin(e.target.dataset.orderId, e.target.value);
  });

  tbody?.addEventListener('click', (e) => {
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
  const btnIrRegistro = document.getElementById('btn-ir-registro');
  const btnVolverLoginRegistro = document.getElementById('btn-volver-login-registro');
  const btnVolverLoginVerificacion = document.getElementById('btn-volver-login-verificacion');
  const btnConfirmarRegistro = document.getElementById('btn-confirmar-registro');
  const btnLogout = document.getElementById('btn-logout');
  const codeInput = document.getElementById('verification-code-input');

  accessBtn?.addEventListener('click', manejarClickAccesoCuenta);
  loginForm?.addEventListener('submit', iniciarSesion);
  registroForm?.addEventListener('submit', solicitarRegistro);
  authClose?.addEventListener('click', cerrarAuthModal);
  authOverlay?.addEventListener('click', cerrarAuthModal);
  btnIrRegistro?.addEventListener('click', () => cambiarVistaAuth('registro'));
  btnVolverLoginRegistro?.addEventListener('click', () => cambiarVistaAuth('login'));
  btnVolverLoginVerificacion?.addEventListener('click', () => cambiarVistaAuth('login'));
  btnConfirmarRegistro?.addEventListener('click', confirmarRegistro);
  btnLogout?.addEventListener('click', cerrarSesion);

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
  await cargarConfiguracionTienda();
  const pagina = document.body?.dataset?.page || 'index';

  if (pagina === 'cuenta') {
    inicializarAutenticacion();
    inicializarBuscadorPedidos();
    inicializarCuenta();
    return;
  }

  if (pagina === 'info') {
    inicializarAutenticacion();
    inicializarBuscadorPedidos();
    inicializarInfo();
    return;
  }

  const hashInformativo = window.location.hash.replace('#', '');
  if (PANELES_INFO.includes(hashInformativo)) {
    window.location.replace(`info.html#${hashInformativo}`);
    return;
  }

  inicializarDropdownCategorias();
  inicializarClubNav();
  inicializarStadiumCarousel();
  inicializarDetalleProducto();
  inicializarDropdownOrden();
  inicializarDropdownGenero();
  inicializarBuscador();
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
