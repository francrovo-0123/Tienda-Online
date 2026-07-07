function formatearPrecio(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return '$ 0';
  }

  const formateado = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
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

  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  if (numero >= precioBase) return null;

  return numero;
}

const WHATSAPP_NUMERO = '542494654452';
const API_BASE = 'http://localhost:3000';
const SESSION_USER_KEY = 'sesion_usuario';
const ADMIN_EMAIL = 'admin@comercio.com';
const ESTADOS_PEDIDO = ['Pendiente', 'En Preparación', 'Enviado', 'Listo'];
const TALLES_DISPONIBLES = ['S', 'M', 'L', 'XL', 'XXL'];

const seccionesEjemplo = [
  { id: 1, nombre: 'Remeras' },
  { id: 2, nombre: 'Camperas' },
  { id: 3, nombre: 'Pantalones' },
];

let generoFiltroActivo = 'todos';
let productos = [];
let secciones = [];
let categoriaFiltroActiva = 'todos';
let criterioOrdenActivo = 'predeterminado';
let busquedaActiva = '';
let editandoProductoId = null;
let seccionActivaId = null;

let carrito = [];
let tallesSeleccionados = {};
let pedidos = [];
let codigoVerificacionTemporal = null;
let datosRegistroTemporal = {};

async function apiFetch(ruta, opciones = {}) {
  const esFormData = opciones.body instanceof FormData;
  const headers = { ...opciones.headers };

  if (!esFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const respuesta = await fetch(`${API_BASE}${ruta}`, {
    ...opciones,
    headers,
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
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

const TOAST_DURACION_MS = 3500;

function inicializarToastContainer() {
  if (document.getElementById('toast-container')) return;

  const contenedor = document.createElement('div');
  contenedor.id = 'toast-container';
  contenedor.className = 'toast-container';
  contenedor.setAttribute('aria-live', 'polite');
  contenedor.setAttribute('aria-atomic', 'false');
  document.body.appendChild(contenedor);
}

function mostrarToast(mensaje, tipo = 'success') {
  const contenedor = document.getElementById('toast-container');
  if (!contenedor) return;

  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  toast.setAttribute('role', 'status');
  toast.textContent = mensaje;
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
  const mapa = {
    Pendiente: 'pendiente',
    'En Preparación': 'preparacion',
    Enviado: 'enviado',
    Listo: 'enviado',
  };
  return mapa[estado] || 'pendiente';
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

  select.innerHTML = `
    <option value="" disabled selected>Seleccioná una sección</option>
    ${opciones}
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

  lista.innerHTML = secciones
    .map((seccion) => {
      const total = contarProductosPorSeccion(seccion.nombre);
      const textoProductos = total === 1 ? '1 producto' : `${total} productos`;

      return `
        <div class="seccion-fila" data-id="${seccion.id}" role="button" tabindex="0" aria-label="Gestionar sección ${seccion.nombre}">
          <div class="seccion-info">
            <span class="seccion-icono">📁</span>
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

function abrirModalCrearSeccion() {
  const modal = document.getElementById('modal-crear-seccion');
  if (!modal) return;

  document.getElementById('modal-crear-seccion-form')?.reset();
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
}

async function crearSeccionDesdeModal(event) {
  event.preventDefault();

  const input = document.getElementById('modal-seccion-nombre');
  const nombre = input?.value.trim();
  if (!nombre) return;

  const submitBtn = document.querySelector('#modal-crear-seccion-form .seccion-modal-form__submit');
  submitBtn?.setAttribute('disabled', 'true');

  try {
    const nuevaSeccion = await apiFetch('/api/secciones', {
      method: 'POST',
      body: JSON.stringify({ nombre }),
    });

    secciones.push(nuevaSeccion);
    actualizarVistaSecciones();
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

function renderizarProductosEnSeccion(seccion) {
  const lista = document.getElementById('lista-productos-seccion-modal');
  if (!lista || !seccion) return;

  const productosSeccion = obtenerProductosDeSeccion(seccion.nombre);

  if (!productosSeccion.length) {
    lista.innerHTML = '<p class="seccion-modal-vacio">No hay productos en esta sección todavía.</p>';
    return;
  }

  lista.innerHTML = productosSeccion
    .map(
      (producto) => `
        <div class="seccion-modal-producto">
          <img
            class="seccion-modal-producto__thumb"
            src="${producto.imagen}"
            alt="${producto.nombre}"
            width="44"
            height="44"
            loading="lazy"
          >
          <span class="seccion-modal-producto__nombre">${producto.nombre}</span>
          <span class="seccion-modal-producto__stock">${formatearStockAdmin(producto.stock)}</span>
        </div>
      `
    )
    .join('');
}

function abrirModalDetalleSeccion(id) {
  const seccion = secciones.find((item) => item.id === Number(id));
  if (!seccion) return;

  seccionActivaId = seccion.id;

  const modal = document.getElementById('modal-detalle-seccion');
  const titulo = document.getElementById('modal-detalle-seccion-titulo');
  if (!modal) return;

  if (titulo) titulo.textContent = `Carpeta: ${seccion.nombre}`;

  renderizarProductosEnSeccion(seccion);

  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function cerrarModalDetalleSeccion() {
  const modal = document.getElementById('modal-detalle-seccion');
  if (!modal) return;

  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  seccionActivaId = null;
}

function abrirAgregarProductoDesdeSeccion() {
  const seccion = obtenerSeccionActiva();
  if (!seccion) return;

  const nombreSeccion = seccion.nombre;
  cerrarModalDetalleSeccion();
  abrirModalProducto(nombreSeccion);
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

async function eliminarProducto(id) {
  if (!confirm('¿Estás seguro de eliminar este producto?')) return;

  try {
    const response = await fetch(`http://localhost:3000/api/productos/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Error al eliminar el producto (${response.status})`);
    }

    productos = productos.filter((item) => item.id !== Number(id));
    carrito = carrito.filter((item) => item.id !== Number(id));
    actualizarContadorProductosAdmin();
    renderizarSeccionesAdmin();
    renderizarTablaProductosAdmin();
    actualizarCarritoUI();
    renderizarFiltrosCategorias(productos);
    renderizarProductos();
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
}

function formatearStockAdmin(stock) {
  const valor = Number(stock);
  if (!Number.isFinite(valor) || valor <= 0) return '0 u.';
  return `${valor} u.`;
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
    const coincideBusqueda = productoCoincideBusqueda(producto, busquedaActiva);
    const generoProducto = producto.genero || 'hombre';
    const coincideGenero =
      generoFiltroActivo === 'todos' || generoProducto === generoFiltroActivo;
    return coincideCategoria && coincideBusqueda && coincideGenero;
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

  const talleActivo = tallesSeleccionados[producto.id] || talles[0];
  tallesSeleccionados[producto.id] = talleActivo;

  const botones = talles
    .map(
      (talle) => `
        <button
          type="button"
          class="talle-btn${talle === talleActivo ? ' selected' : ''}"
          data-product-id="${producto.id}"
          data-talle="${talle}"
          onclick="seleccionarTalle(${producto.id}, '${talle}', this)"
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

  const badgeOferta = enOferta
    ? `<span class="product-card__offer-badge">${calcularDescuentoPorcentaje(producto.precio, producto.precioOferta)}% OFF</span>`
    : '';

  const generoProducto = producto.genero || 'hombre';
  const etiquetaGenero = obtenerEtiquetaGeneroTarjeta(generoProducto);
  const badgeGenero = etiquetaGenero
    ? `<span class="product-card__genero-badge">${etiquetaGenero}</span>`
    : '';

  return `
    <article class="product-card${sinStock ? ' product-card--sin-stock' : ''}" role="listitem" data-id="${producto.id}">
      <div class="product-card__image-wrapper">
        <img
          class="product-card__image"
          src="${producto.imagen}"
          alt="${producto.nombre}"
          loading="lazy"
          width="600"
          height="800"
        >
        ${badgeOferta}
        ${sinStock ? '<span class="product-card__stock-badge">SIN STOCK</span>' : ''}
      </div>
      <div class="product-card__info">
        <h3 class="product-card__name">${producto.nombre}</h3>
        ${badgeGenero}
        ${precioHtml}
        ${tallesHtml ? `<div class="selector-talles" id="talles-${producto.id}">${tallesHtml}</div>` : ''}
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

function seleccionarTalle(productoId, talle, elemento) {
  tallesSeleccionados[productoId] = talle;

  const contenedor = document.getElementById(`talles-${productoId}`);
  contenedor?.querySelectorAll('.talle-btn').forEach((btn) => {
    const activo = btn.dataset.talle === talle;
    btn.classList.toggle('selected', activo);
    btn.setAttribute('aria-pressed', String(activo));
  });

  elemento?.classList.add('selected');
}

function formatearEtiquetaCategoria(categoria) {
  if (!categoria) return '';
  return categoria
    .trim()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase())
    .join(' ');
}

function filtrarPorCategoria(categoria, elemento) {
  categoriaFiltroActiva = categoria;

  document.querySelectorAll('#dropdown-categorias-list .dropdown-item').forEach((btn) => {
    btn.classList.remove('active');
  });
  elemento?.classList.add('active');

  cerrarDropdownCategorias();
  renderizarProductos();
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
  renderizarProductos();
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
  renderizarProductos();
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

  if (categoriaFiltroActiva !== 'todos' && !categorias.includes(categoriaFiltroActiva)) {
    categoriaFiltroActiva = 'todos';
  }

  menu.innerHTML = '';

  const crearItem = (categoria, etiqueta) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dropdown-item${categoriaFiltroActiva === categoria ? ' active' : ''}`;
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

function inicializarBuscador() {
  const input = document.getElementById('input-busqueda');
  const searchBtn = document.getElementById('header-search-btn');

  input?.addEventListener('input', (e) => {
    busquedaActiva = e.target.value.toLowerCase().trim();
    renderizarProductos();
  });

  searchBtn?.addEventListener('click', () => {
    const coleccion = document.getElementById('coleccion');
    coleccion?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    input?.focus();
  });
}

async function cargarProductos() {
  const container = document.getElementById('store-sections-container');
  const storeView = document.getElementById('store-view');
  const mostrarSkeleton =
    container && (!storeView || storeView.style.display !== 'none');

  if (mostrarSkeleton) {
    let skeletonHTML = '<div class="products-grid" aria-busy="true" aria-label="Cargando productos">';
    for (let i = 0; i < 4; i++) {
      skeletonHTML += `
        <div class="skeleton-card">
          <div class="skeleton-image"></div>
          <div class="skeleton-text" style="width: 70%; height: 16px; margin-top: 12px;"></div>
          <div class="skeleton-text" style="width: 40%; height: 14px; margin-top: 8px;"></div>
        </div>
      `;
    }
    skeletonHTML += '</div>';
    container.innerHTML = skeletonHTML;
  }

  try {
    productos = await apiFetch('/api/productos');
    renderizarFiltrosCategorias(productos);
    return true;
  } catch {
    productos = [];
    renderizarFiltrosCategorias(productos);
    mostrarToast('Error de conexión con el servidor', 'error');
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

function limpiarVistaPreviaImagen() {
  const preview = document.getElementById('producto-imagen-preview');
  const nombreEl = document.getElementById('producto-imagen-nombre');

  if (preview) {
    preview.src = '';
    preview.classList.add('hidden');
  }
  if (nombreEl) nombreEl.textContent = 'Ningún archivo seleccionado';
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

function manejarSeleccionImagen(event) {
  const file = event.target.files?.[0];
  const preview = document.getElementById('producto-imagen-preview');
  const nombreEl = document.getElementById('producto-imagen-nombre');

  if (!file) {
    limpiarVistaPreviaImagen();
    return;
  }

  if (!file.type.startsWith('image/')) {
    event.target.value = '';
    limpiarVistaPreviaImagen();
    mostrarToast('Seleccioná un archivo de imagen válido (JPG, PNG, WebP, etc.).', 'error');
    return;
  }

  if (nombreEl) nombreEl.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (!preview) return;
    preview.src = e.target.result;
    preview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function abrirModalProducto(categoriaPreseleccionada = null) {
  const modal = document.getElementById('product-modal');
  if (!modal) return;

  editandoProductoId = null;
  const titleEl = document.getElementById('product-modal-title');
  if (titleEl) titleEl.textContent = 'Nuevo producto';

  const imagenInput = document.getElementById('producto-imagen');
  if (imagenInput) imagenInput.required = true;

  document.getElementById('product-form')?.reset();
  restablecerFormularioProducto();
  limpiarVistaPreviaImagen();
  renderizarSelectCategorias();

  if (categoriaPreseleccionada) {
    const categoriaSelect = document.getElementById('producto-categoria');
    if (categoriaSelect) categoriaSelect.value = categoriaPreseleccionada;
  }

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  document.getElementById('producto-nombre')?.focus();
}

function abrirModalEditar(id) {
  const producto = productos.find((p) => p.id === Number(id));
  if (!producto) return;

  const modal = document.getElementById('product-modal');
  if (!modal) return;

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
  const imagenInput = document.getElementById('producto-imagen');
  const preview = document.getElementById('producto-imagen-preview');
  const nombreEl = document.getElementById('producto-imagen-nombre');

  if (nombreInput) nombreInput.value = producto.nombre;
  if (precioInput) precioInput.value = producto.precio;
  if (precioOfertaInput) {
    precioOfertaInput.value = producto.precioOferta ? String(producto.precioOferta) : '';
  }
  if (categoriaSelect) categoriaSelect.value = producto.categoria;
  const generoSelect = document.getElementById('producto-genero');
  if (generoSelect) generoSelect.value = producto.genero || 'hombre';
  if (stockInput) stockInput.value = String(producto.stock ?? 0);
  if (descripcionInput) descripcionInput.value = producto.descripcion || '';
  establecerTallesEnFormulario(producto.talles);
  if (imagenInput) {
    imagenInput.value = '';
    imagenInput.required = false;
  }

  if (preview && producto.imagen) {
    preview.src = producto.imagen;
    preview.classList.remove('hidden');
  } else {
    limpiarVistaPreviaImagen();
  }

  if (nombreEl) nombreEl.textContent = 'Imagen actual del producto';

  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('product-modal-open');
  nombreInput?.focus();
}

function cerrarModalProducto() {
  const modal = document.getElementById('product-modal');
  if (!modal) return;

  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('product-modal-open');
  document.getElementById('product-form')?.reset();
  limpiarVistaPreviaImagen();
  restablecerFormularioProducto();

  editandoProductoId = null;
  const titleEl = document.getElementById('product-modal-title');
  if (titleEl) titleEl.textContent = 'Nuevo producto';

  const imagenInput = document.getElementById('producto-imagen');
  if (imagenInput) imagenInput.required = true;
}

async function guardarNuevoProducto(event) {
  event.preventDefault();

  const nombre = document.getElementById('producto-nombre')?.value.trim() ?? '';
  const precio = Number(document.getElementById('producto-precio')?.value);
  const precioOfertaRaw = document.getElementById('producto-precio-oferta')?.value ?? '';
  const categoria = document.getElementById('producto-categoria')?.value?.trim() ?? '';
  const genero = document.getElementById('producto-genero')?.value ?? 'hombre';
  const stock = Number(document.getElementById('producto-stock')?.value);
  const descripcion = document.getElementById('producto-descripcion')?.value.trim() ?? '';
  const talles = obtenerTallesDelFormulario();
  const archivo = document.getElementById('producto-imagen')?.files?.[0];
  const submitBtn = document.querySelector('#product-form .product-form__submit');

  if (nombre.length < 3) {
    mostrarToast('El nombre del producto debe tener al menos 3 caracteres.', 'error');
    return;
  }

  if (!Number.isFinite(precio) || precio <= 0) {
    mostrarToast('Por favor, ingresá un precio válido mayor a $ 0.', 'error');
    return;
  }

  const precioOfertaNumero = precioOfertaRaw === '' ? null : Number(precioOfertaRaw);
  if (precioOfertaRaw !== '' && (!Number.isFinite(precioOfertaNumero) || precioOfertaNumero < 0)) {
    mostrarToast('Ingresá un precio de oferta válido o dejá el campo vacío.', 'error');
    return;
  }

  if (Number.isFinite(precioOfertaNumero) && precioOfertaNumero > 0 && precioOfertaNumero >= precio) {
    mostrarToast('El precio de oferta debe ser menor al precio base.', 'error');
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
  const productoExistente = esEdicion
    ? productos.find((p) => p.id === editandoProductoId)
    : null;

  if (!esEdicion && !archivo) return;
  if (esEdicion && !archivo && !productoExistente?.imagen) return;

  submitBtn?.setAttribute('disabled', 'true');

  try {
    const imagen = archivo
      ? await comprimirImagen(archivo)
      : productoExistente.imagen;

    const precioOferta = normalizarPrecioOfertaFormulario(precioOfertaRaw, precio);

    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('precio', String(precio));
    formData.append('precioOferta', precioOferta !== null ? String(precioOferta) : '');
    formData.append('categoria', categoria);
    formData.append('genero', genero);
    formData.append('stock', String(stock));
    formData.append('descripcion', descripcion);
    formData.append('imagen', imagen);
    formData.delete('talles');
    talles.forEach((talle) => formData.append('talles', talle));

    if (esEdicion) {
      const productoActualizado = await apiFetch(`/api/productos/${editandoProductoId}`, {
        method: 'PUT',
        body: formData,
      });

      const indice = productos.findIndex((p) => p.id === editandoProductoId);
      if (indice !== -1) productos[indice] = productoActualizado;

      const precioEfectivo = obtenerPrecioEfectivo(productoActualizado);
      carrito.forEach((item) => {
        if (item.id === editandoProductoId) {
          item.nombre = productoActualizado.nombre;
          item.precio = precioEfectivo;
          item.imagen = productoActualizado.imagen;
        }
      });

      cerrarModalProducto();
      actualizarContadorProductosAdmin();
      renderizarSeccionesAdmin();
      renderizarTablaProductosAdmin();
      renderizarFiltrosCategorias(productos);
      renderizarProductos();
      actualizarCarritoUI();
      mostrarToast('Producto actualizado');
      return;
    }

    const nuevoProducto = await apiFetch('/api/productos', {
      method: 'POST',
      body: formData,
    });

    productos.push(nuevoProducto);
    actualizarContadorProductosAdmin();
    renderizarSeccionesAdmin();
    renderizarTablaProductosAdmin();

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
    return;
  }

  container.innerHTML = bloques.join('');
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
            src="${item.imagen}"
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

  const summaryTotal = document.getElementById('checkout-summary-total');
  if (summaryTotal) summaryTotal.textContent = formatearPrecio(calcularTotal());

  const modal = document.getElementById('checkout-modal');
  modal?.classList.add('is-open');
  modal?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('checkout-open');
  cerrarCarrito();
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

  const nombre = document.getElementById('checkout-nombre').value.trim();
  const telefono = document.getElementById('checkout-telefono').value.trim();
  const direccion = document.getElementById('checkout-direccion').value.trim();
  const metodoPagoInput = document.querySelector('input[name="metodo-pago"]:checked');
  const metodosValidos = ['Efectivo', 'Transferencia'];

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

  if (!metodoPagoInput || !metodosValidos.includes(metodoPagoInput.value)) {
    mostrarToast('Seleccioná un método de pago.', 'error');
    return;
  }

  const metodoPago = metodoPagoInput.value;
  const submitBtn = document.querySelector('#checkout-form button[type="submit"]');

  submitBtn?.setAttribute('disabled', 'true');

  try {
    const itemsCarrito = carrito.map((item) => ({ ...item }));
    const totalPedido = calcularTotal();

    const nuevoPedido = await apiFetch('/api/pedidos', {
      method: 'POST',
      body: JSON.stringify({
        cliente: { nombre, telefono: telefonoSoloNumeros, direccion },
        productos: itemsCarrito,
        total: totalPedido,
        metodoPago,
      }),
    });

    const idPedido = nuevoPedido.id;
    pedidos.push(nuevoPedido);

    enviarAWhatsApp({
      idPedido,
      nombre,
      telefono: telefonoSoloNumeros,
      direccion,
      metodoPago,
      productos: itemsCarrito,
      total: totalPedido,
    });

    carrito = [];
    actualizarCarritoUI();
    await cargarProductos();
    renderizarProductos();
    cerrarCheckout();
    cerrarCarrito();
    document.getElementById('checkout-form')?.reset();
    mostrarToast('¡Pedido enviado con éxito!');
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo registrar el pedido. Intentá de nuevo.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
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

function renderizarPedidos(pedidosFiltrados) {
  const container = document.getElementById('tracking-results');
  if (!container) return;

  if (pedidosFiltrados.length === 0) {
    container.innerHTML = `
      <p class="tracking-empty">No encontramos pedidos asociados a ese teléfono.</p>
    `;
    return;
  }

  const pedidosOrdenados = [...pedidosFiltrados].sort(
    (a, b) => new Date(b.fecha) - new Date(a.fecha)
  );

  container.innerHTML = pedidosOrdenados
    .map((pedido) => {
      const claseEstado = obtenerClaseEstado(pedido.estado);
      const productosHtml = pedido.productos
        .map(
          (item) => `
            <li class="order-card__product">
              <span>${item.nombre}</span>
              <span class="order-card__product-qty">x${item.cantidad}</span>
            </li>
          `
        )
        .join('');

      return `
        <article class="order-card">
          <div class="order-card__header">
            <div>
              <p class="order-card__id">${pedido.id}</p>
              <p class="order-card__date">${formatearFecha(pedido.fecha)}</p>
            </div>
            <span class="order-card__badge order-card__badge--${claseEstado}">${pedido.estado}</span>
          </div>
          <ul class="order-card__products">${productosHtml}</ul>
          <div class="order-card__footer">
            <span class="order-card__total-label">Total</span>
            <span class="order-card__total">${formatearPrecio(pedido.total)}</span>
          </div>
        </article>
      `;
    })
    .join('');
}

async function manejarBusquedaPedidos(event) {
  event.preventDefault();
  const telefono = document.getElementById('tracking-phone')?.value.trim();
  if (!telefono) return;

  const container = document.getElementById('tracking-results');
  if (container) {
    container.innerHTML = '<p class="tracking-empty">Buscando pedidos…</p>';
  }

  try {
    const todosPedidos = await apiFetch('/api/pedidos');
    pedidos = todosPedidos;
    const resultados = buscarPedidos(telefono);
    renderizarPedidos(resultados);
  } catch {
    mostrarToast('Error de conexión con el servidor', 'error');
    if (container) {
      container.innerHTML = '<p class="tracking-empty">No se pudieron cargar los pedidos. Verificá que el servidor esté activo.</p>';
    }
  }
}

function agregarAlCarrito(id) {
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
      imagen: producto.imagen,
      cantidad: 1,
    });
  }

  actualizarCarritoUI();
  mostrarToast('Producto agregado al carrito.');
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

  actualizarCarritoUI();
}

function eliminarDelCarrito(id_talle) {
  carrito = carrito.filter((item) => item.id_talle !== id_talle);
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

function inicializarTracking() {
  const trackingForm = document.getElementById('tracking-form');
  trackingForm?.addEventListener('submit', manejarBusquedaPedidos);
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

function establecerSesion(usuario) {
  sessionStorage.setItem(
    SESSION_USER_KEY,
    JSON.stringify({ email: usuario.email, rol: usuario.rol })
  );
}

function esSesionAdminActiva() {
  const sesion = obtenerSesionUsuario();
  return sesion?.rol === 'admin';
}

function esSesionClienteActiva() {
  const sesion = obtenerSesionUsuario();
  return sesion?.rol === 'cliente';
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

function cerrarAuthModal() {
  const modal = document.getElementById('auth-modal');
  modal?.classList.remove('is-open');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('auth-open');

  document.getElementById('auth-login-form')?.reset();
  document.getElementById('auth-registro-form')?.reset();
  const codeInputReset = document.getElementById('verification-code-input');
  if (codeInputReset) codeInputReset.value = '';

  codigoVerificacionTemporal = null;
  datosRegistroTemporal = {};
  ocultarErroresAuth();
  cambiarVistaAuth('login');
}

function actualizarUIUsuario() {
  const sesion = obtenerSesionUsuario();
  const accessBtn = document.getElementById('admin-access-btn');
  const headerSession = document.getElementById('header-session');
  const headerEmail = document.getElementById('header-session-email');

  if (sesion && sesion.rol === 'cliente') {
    accessBtn?.classList.add('is-logged-in');
    accessBtn?.setAttribute('aria-label', `Sesión activa: ${sesion.email}`);
    headerSession?.classList.remove('hidden');
    if (headerEmail) headerEmail.textContent = sesion.email;
    return;
  }

  accessBtn?.classList.remove('is-logged-in');
  accessBtn?.setAttribute('aria-label', 'Iniciar sesión');
  headerSession?.classList.add('hidden');
  if (headerEmail) headerEmail.textContent = '';
}

function mostrarVistaAdmin() {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');

  if (storeView) storeView.style.display = 'none';
  if (adminView) adminView.style.display = 'block';

  document.body.classList.add('admin-active');
  document.title = 'Atelier — Panel de Administración';
}

function mostrarVistaTienda() {
  const storeView = document.getElementById('store-view');
  const adminView = document.getElementById('admin-view');

  if (storeView) storeView.style.display = '';
  if (adminView) adminView.style.display = 'none';

  document.body.classList.remove('admin-active', 'modal-open');
  document.title = 'Atelier — Boutique Premium';
  cerrarModalPedido();
  actualizarUIUsuario();
}

function completarInicioSesion(usuario) {
  establecerSesion(usuario);
  cerrarAuthModal();

  if (usuario.rol === 'admin') {
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

  mostrarVistaTienda();
}

function cerrarSesion() {
  sessionStorage.removeItem(SESSION_USER_KEY);
  mostrarVistaTienda();
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

    codigoVerificacionTemporal = respuesta.codigoVerificacion;
    datosRegistroTemporal = { email, password };

    const emailVerificacion = document.getElementById('auth-verificacion-email');
    if (emailVerificacion) emailVerificacion.textContent = email;

    mostrarToast(
      `Código de simulación generado: ${codigoVerificacionTemporal}`
    );
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

  if (!codigoIngresado || codigoIngresado !== codigoVerificacionTemporal) {
    mostrarToast('El código ingresado no es válido.', 'error');
    return;
  }

  try {
    const respuesta = await apiFetch('/api/auth/confirmar', {
      method: 'POST',
      body: JSON.stringify({ email: datosRegistroTemporal.email }),
    });

    codigoVerificacionTemporal = null;
    datosRegistroTemporal = {};

    completarInicioSesion(respuesta.usuario);
  } catch (error) {
    mostrarToast(error?.message || 'No se pudo confirmar la cuenta.', 'error');
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

    completarInicioSesion(respuesta.usuario);
  } catch {
    mostrarToast('Email o contraseña incorrectos.', 'error');
  } finally {
    submitBtn?.removeAttribute('disabled');
  }
}

function restaurarSesion() {
  const sesion = obtenerSesionUsuario();
  if (!sesion) return;

  if (sesion.rol === 'admin') {
    mostrarVistaAdmin();
    cargarPanelAdmin();
    return;
  }

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
    showNuevoProducto: false,
  },
  pedidos: {
    title: 'Pedidos',
    subtitle: 'Gestioná los pedidos de tu tienda',
    showNuevoProducto: false,
  },
  productos: {
    title: 'Productos',
    subtitle: 'Administrá el catálogo de tu tienda',
    showNuevoProducto: true,
  },
};

let panelAdminActivo = 'dashboard';

function cambiarPanelAdmin(panel) {
  if (!ADMIN_PANELS[panel]) return;

  panelAdminActivo = panel;
  const config = ADMIN_PANELS[panel];

  document.getElementById('admin-header-title').textContent = config.title;
  document.getElementById('admin-header-subtitle').textContent = config.subtitle;
  document.getElementById('btn-nuevo-producto')?.classList.toggle('hidden', !config.showNuevoProducto);

  document.querySelectorAll('.admin-panel').forEach((seccion) => {
    seccion.classList.toggle('hidden', seccion.dataset.adminPanel !== panel);
  });

  document.querySelectorAll('.admin-sidebar__link[data-admin-panel]').forEach((link) => {
    link.classList.toggle('admin-sidebar__link--active', link.dataset.adminPanel === panel);
  });

  if (panel === 'productos') {
    renderizarSeccionesAdmin();
    renderizarTablaProductosAdmin();
  }
}

function renderizarTablaProductosAdmin() {
  const tbody = document.getElementById('admin-products-body');
  const emptyEl = document.getElementById('admin-products-empty');
  const wrapper = document.querySelector('#admin-panel-productos .admin-table-wrapper');
  const vacio = productos.length === 0;

  if (!tbody) return;

  wrapper?.classList.toggle('admin-table-wrapper--empty', vacio);
  if (emptyEl) emptyEl.hidden = !vacio;

  if (vacio) {
    tbody.innerHTML = '';
    return;
  }

  tbody.innerHTML = productos
    .map(
      (producto) => {
        const stockValor = Number(producto.stock ?? 0);
        const claseStock =
          stockValor <= 0 ? 'admin-table__stock--out' : stockValor <= 3 ? 'admin-table__stock--low' : '';

        return `
        <tr>
          <td>
            <img
              class="admin-table__thumb"
              src="${producto.imagen}"
              alt="${producto.nombre}"
              width="48"
              height="64"
              loading="lazy"
            >
          </td>
          <td>${producto.nombre}</td>
          <td><span class="admin-table__category">${producto.categoria || '—'}</span></td>
          <td class="admin-table__total">${formatearPrecio(producto.precio)}</td>
          <td><span class="admin-table__stock ${claseStock}">${formatearStockAdmin(stockValor)}</span></td>
          <td class="admin-table__actions">
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
    )
    .join('');
}

function calcularMetricasAdmin(listaPedidos) {
  const totalVentas = listaPedidos.reduce((sum, p) => sum + (p.total || 0), 0);
  const totalPedidos = listaPedidos.length;
  const pendientes = listaPedidos.filter((p) => p.estado === 'Pendiente').length;

  const ventasEl = document.getElementById('kpi-ventas');
  const totalEl = document.getElementById('kpi-total');
  const pendientesEl = document.getElementById('kpi-pendientes');

  if (ventasEl) ventasEl.textContent = formatearPrecio(totalVentas);
  if (totalEl) totalEl.textContent = totalPedidos;
  if (pendientesEl) pendientesEl.textContent = pendientes;
}

function crearOpcionesEstado(estadoActual) {
  return ESTADOS_PEDIDO.map(
    (estado) =>
      `<option value="${estado}"${estado === estadoActual ? ' selected' : ''}>${estado}</option>`
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
  await Promise.all([cargarPedidos(), cargarProductos()]);

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

  calcularMetricasAdmin(pedidos);
  renderizarTablaPedidosAdmin(pedidos);
  actualizarContadorProductosAdmin();
  renderizarSeccionesAdmin();
  renderizarTablaProductosAdmin();
  cambiarPanelAdmin(panelAdminActivo);
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

    calcularMetricasAdmin(pedidos);
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
        <span class="detail-badge detail-badge--${claseEstado}">${pedido.estado}</span>
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
  const btnNuevoProducto = document.getElementById('btn-nuevo-producto');
  const modalClose = document.getElementById('order-modal-close');
  const modalOverlay = document.getElementById('order-modal-overlay');
  const productModalClose = document.getElementById('product-modal-close');
  const productModalCancel = document.getElementById('product-modal-cancel');
  const productModalOverlay = document.getElementById('product-modal-overlay');
  const productoImagenInput = document.getElementById('producto-imagen');
  const btnAbrirCrearSeccion = document.getElementById('btn-abrir-crear-seccion');
  const modalCrearSeccionForm = document.getElementById('modal-crear-seccion-form');
  const modalCrearSeccionCerrar = document.getElementById('modal-crear-seccion-cerrar');
  const modalCrearSeccionCancelar = document.getElementById('modal-crear-seccion-cancelar');
  const modalCrearSeccionOverlay = document.getElementById('modal-crear-seccion-overlay');
  const modalDetalleSeccionCerrar = document.getElementById('modal-detalle-seccion-cerrar');
  const modalDetalleSeccionOverlay = document.getElementById('modal-detalle-seccion-overlay');
  const btnModalAgregarProducto = document.getElementById('btn-modal-agregar-producto');
  const sectionsList = document.getElementById('lista-secciones-admin');
  const productsBody = document.getElementById('admin-products-body');
  const sidebarLinks = document.querySelectorAll('.admin-sidebar__link[data-admin-panel]');

  productoImagenInput?.addEventListener('change', manejarSeleccionImagen);
  btnAbrirCrearSeccion?.addEventListener('click', abrirModalCrearSeccion);
  modalCrearSeccionForm?.addEventListener('submit', crearSeccionDesdeModal);
  modalCrearSeccionCerrar?.addEventListener('click', cerrarModalCrearSeccion);
  modalCrearSeccionCancelar?.addEventListener('click', cerrarModalCrearSeccion);
  modalCrearSeccionOverlay?.addEventListener('click', cerrarModalCrearSeccion);
  modalDetalleSeccionCerrar?.addEventListener('click', cerrarModalDetalleSeccion);
  modalDetalleSeccionOverlay?.addEventListener('click', cerrarModalDetalleSeccion);
  btnModalAgregarProducto?.addEventListener('click', abrirAgregarProductoDesdeSeccion);

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

  productsBody?.addEventListener('click', (e) => {
    const btnEditar = e.target.closest('.btn-editar');
    if (btnEditar) {
      abrirModalEditar(btnEditar.dataset.productId);
      return;
    }

    const btnEliminar = e.target.closest('.btn-eliminar');
    if (btnEliminar) {
      eliminarProducto(btnEliminar.dataset.productId);
    }
  });

  sidebarLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      cambiarPanelAdmin(link.dataset.adminPanel);
    });
  });

  btnNuevoProducto?.addEventListener('click', abrirModalProducto);
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
  const footerLogout = document.getElementById('header-logout-btn');
  const codeInput = document.getElementById('verification-code-input');

  accessBtn?.addEventListener('click', abrirAuthModal);
  loginForm?.addEventListener('submit', iniciarSesion);
  registroForm?.addEventListener('submit', solicitarRegistro);
  authClose?.addEventListener('click', cerrarAuthModal);
  authOverlay?.addEventListener('click', cerrarAuthModal);
  btnIrRegistro?.addEventListener('click', () => cambiarVistaAuth('registro'));
  btnVolverLoginRegistro?.addEventListener('click', () => cambiarVistaAuth('login'));
  btnVolverLoginVerificacion?.addEventListener('click', () => cambiarVistaAuth('login'));
  btnConfirmarRegistro?.addEventListener('click', confirmarRegistro);
  btnLogout?.addEventListener('click', cerrarSesion);
  footerLogout?.addEventListener('click', cerrarSesion);

  codeInput?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });

  inicializarEventosAdmin();
  restaurarSesion();
  actualizarUIUsuario();
}

document.addEventListener('DOMContentLoaded', async () => {
  inicializarToastContainer();
  inicializarDropdownCategorias();
  inicializarDropdownOrden();
  inicializarDropdownGenero();
  inicializarBuscador();
  await cargarSecciones();
  const productosCargados = await cargarProductos();
  renderizarSelectCategorias();
  if (productosCargados) {
    renderizarProductos();
  }
  actualizarContadorProductosAdmin();
  inicializarCarrito();
  inicializarCheckout();
  inicializarTracking();
  inicializarTeclado();
  inicializarAutenticacion();
});
