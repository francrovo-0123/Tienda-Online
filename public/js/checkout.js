/**
 * Checkout multi-step page controller.
 * Depende de app.js (carrito, validación, pagos, cupones).
 */

(function () {
  const PASO_MIN = 1;
  const PASO_MAX = 3;
  const CHECKOUT_PASO_KEY = 'checkout_paso';
  let pasoActual = 1;

  function esPaginaCheckout() {
    return document.body?.dataset?.page === 'checkout';
  }

  function guardarPasoEnSesion(numeroPaso) {
    try {
      sessionStorage.setItem(CHECKOUT_PASO_KEY, String(numeroPaso));
    } catch {
      // sessionStorage puede fallar en modo privado extremo
    }
  }

  function leerPasoGuardado() {
    try {
      const raw = sessionStorage.getItem(CHECKOUT_PASO_KEY);
      const n = Number(raw);
      if (!Number.isFinite(n)) return PASO_MIN;
      return Math.min(PASO_MAX, Math.max(PASO_MIN, Math.floor(n)));
    } catch {
      return PASO_MIN;
    }
  }

  function limpiarPasoGuardado() {
    try {
      sessionStorage.removeItem(CHECKOUT_PASO_KEY);
    } catch {
      // noop
    }
  }

  function obtenerMetodoPagoSeleccionado() {
    if (typeof obtenerMetodoPagoSeleccionadoUI === 'function') {
      const metodo = obtenerMetodoPagoSeleccionadoUI();
      if (metodo) return metodo;
    }
    return (
      document.querySelector('input[name="metodo-pago"]:checked')?.value ||
      'transferencia'
    );
  }

  function textoMetodoPago(metodo) {
    return metodo === 'transferencia'
      ? 'Transferencia bancaria (-10%) · WhatsApp'
      : 'Mercado Pago';
  }

  function validarCamposPasoEntrega() {
    if (typeof validarFormularioCheckout !== 'function') return false;
    const resultado = validarFormularioCheckout();
    return Boolean(resultado?.ok);
  }

  function validarPasoPago() {
    const metodo = obtenerMetodoPagoSeleccionado();
    if (metodo !== 'transferencia' && metodo !== 'mercadopago') {
      if (typeof mostrarToast === 'function') {
        mostrarToast('Seleccioná un método de pago para continuar.', 'error');
      }
      return false;
    }
    return true;
  }

  /**
   * Recalcula por completo el paso 3 (textos + totales) según el método actual.
   * Evita estados huérfanos al volver del paso 2 y cambiar el pago.
   */
  function actualizarResumenConfirmacion() {
    const entregaEl = document.getElementById('resumen-entrega-texto');
    const pagoEl = document.getElementById('resumen-pago-texto');
    const noteEl = document.getElementById('checkout-finalize-note');

    const nombre = document.getElementById('checkout-nombre')?.value.trim() || '';
    const telefono = document.getElementById('checkout-telefono')?.value.trim() || '';
    const direccion = document.getElementById('checkout-direccion')?.value.trim() || '';
    const localidad = document.getElementById('checkout-localidad')?.value.trim() || '';
    const provincia = document.getElementById('checkout-provincia')?.value.trim() || '';
    const cp = (document.getElementById('checkout-codigo-postal')?.value || '').trim().toUpperCase();

    if (entregaEl) {
      entregaEl.textContent = [
        nombre,
        telefono,
        direccion,
        [localidad, provincia, cp].filter(Boolean).join(', '),
      ]
        .filter(Boolean)
        .join('\n');
    }

    const metodo = obtenerMetodoPagoSeleccionado();
    if (pagoEl) pagoEl.textContent = textoMetodoPago(metodo);

    if (noteEl) {
      noteEl.textContent =
        metodo === 'transferencia'
          ? 'Al confirmar creamos tu pedido y te abrimos WhatsApp para coordinar la transferencia.'
          : 'Al confirmar serás redirigido al checkout seguro de Mercado Pago.';
    }

    const submitBtn = document.getElementById('checkout-submit-btn');
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.textContent =
        metodo === 'transferencia' ? 'Finalizar por WhatsApp' : 'Finalizar pedido';
    }

    // Fuente única de verdad para etiqueta verde, totales y "Ahorrás $…".
    if (typeof actualizarTotalCheckoutUI === 'function') {
      actualizarTotalCheckoutUI();
    }
  }

  function actualizarProgressUI(numeroPaso) {
    document.querySelectorAll('.checkout-progress__step').forEach((el) => {
      const paso = Number(el.dataset.step);
      el.classList.toggle('is-active', paso === numeroPaso);
      el.classList.toggle('is-done', paso < numeroPaso);
    });
  }

  function actualizarPasosUI(numeroPaso) {
    // Preservar método de pago: fieldset[disabled] puede desmarcar radios en Chromium.
    const metodoAntes = obtenerMetodoPagoSeleccionado();

    document.querySelectorAll('.checkout-step').forEach((step) => {
      const paso = Number(step.dataset.paso);
      const activo = paso === numeroPaso;
      const hecho = paso < numeroPaso;

      step.classList.toggle('is-active', activo);
      step.classList.toggle('is-collapsed', !activo && !hecho);
      step.classList.toggle('is-done', hecho && !activo);

      // Nunca disabled en <fieldset>: pierde :checked de los radios al alternar pasos.
      step.removeAttribute('disabled');
      if (activo) {
        step.removeAttribute('aria-disabled');
        step.removeAttribute('inert');
      } else {
        step.setAttribute('aria-disabled', 'true');
        step.setAttribute('inert', '');
      }
    });

    // Restaurar selección si el DOM la perdió al alternar pasos.
    const radioActual = document.querySelector(
      `input[name="metodo-pago"][value="${metodoAntes}"]`
    );
    if (radioActual && !radioActual.checked) {
      radioActual.checked = true;
    }
  }

  /**
   * Recalcula totales desde el carrito en memoria (+ catálogo) y
   * actualiza resumen + tarjetas del paso 2.
   * No limpia método de pago, cupón ni costo de envío.
   */
  function refrescarTotalesDesdeCarrito() {
    if (typeof sincronizarPreciosCarritoDesdeCatalogo === 'function') {
      sincronizarPreciosCarritoDesdeCatalogo();
    }
    if (typeof renderizarResumenCheckout === 'function') {
      renderizarResumenCheckout();
    } else if (typeof actualizarTotalCheckoutUI === 'function') {
      actualizarTotalCheckoutUI();
    }
    actualizarPreciosMetodoPago();
    actualizarEnvioResumen();
  }

  function actualizarPreciosMetodoPago() {
    if (typeof calcularDesgloseCheckout !== 'function') return;
    if (typeof formatearPrecio !== 'function') return;

    const desglose = calcularDesgloseCheckout();
    const totalMp = desglose.totalConEnvio ?? desglose.totalConCupon;
    const totalTr = desglose.totalTransferencia;
    const mp = document.getElementById('preview-total-mercadopago');
    const tr = document.getElementById('preview-total-transferencia');
    const trBase = document.getElementById('preview-total-transferencia-base');

    if (mp) mp.textContent = formatearPrecio(totalMp);
    if (tr) tr.textContent = formatearPrecio(totalTr);

    // Precio base (sin −10%) tachado junto al total con descuento por transferencia.
    if (trBase) {
      const hayAhorro =
        Number.isFinite(Number(totalMp))
        && Number.isFinite(Number(totalTr))
        && Number(totalMp) - Number(totalTr) > 0.005;
      trBase.textContent = hayAhorro ? formatearPrecio(totalMp) : '';
      trBase.hidden = !hayAhorro;
    }
  }

  function mostrarTiempoEnvioEstimado(tiempo) {
    const el = document.getElementById('checkout-envio-tiempo');
    if (!el) return;
    if (!tiempo) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.textContent = `Llega en ${tiempo}`;
    el.hidden = false;
  }

  function actualizarEnvioResumen() {
    const envioEl = document.getElementById('checkout-summary-envio');
    if (!envioEl || typeof calcularDesgloseCheckout !== 'function') return;

    const desglose = calcularDesgloseCheckout();
    if (desglose.envioGratis) {
      envioEl.textContent = '¡Gratis!';
      return;
    }
    if (desglose.costoEnvio > 0 && typeof formatearPrecio === 'function') {
      envioEl.textContent = formatearPrecio(desglose.costoEnvio);
      return;
    }
    envioEl.textContent = 'A coordinar';
  }

  async function calcularEnvioDesdeCodigoPostal() {
    const input = document.getElementById('checkout-codigo-postal');
    const cp = String(input?.value || '').trim();

    if (!/^\d{4}$/.test(cp)) {
      window.costoEnvioActual = 0;
      mostrarTiempoEnvioEstimado('');
      if (typeof actualizarTotalCheckoutUI === 'function') {
        actualizarTotalCheckoutUI();
      } else {
        actualizarEnvioResumen();
      }
      actualizarPreciosMetodoPago();
      return;
    }

    if (!Array.isArray(carrito) || carrito.length === 0) return;

    try {
      const respuesta = await apiFetch('/api/calcular-envio', {
        method: 'POST',
        body: JSON.stringify({
          codigoPostalDestino: cp,
          carrito: carrito.map((item) => ({
            id: item.id,
            cantidad: Math.max(1, Math.floor(Number(item.cantidad) || 1)),
          })),
        }),
      });

      if (!respuesta?.ok) {
        throw new Error(respuesta?.error || 'No se pudo calcular el envío.');
      }

      window.costoEnvioActual = Number(respuesta.costo) || 0;
      mostrarTiempoEnvioEstimado(respuesta.tiempo || '');

      if (typeof actualizarTotalCheckoutUI === 'function') {
        actualizarTotalCheckoutUI();
      } else {
        actualizarEnvioResumen();
      }
      actualizarPreciosMetodoPago();
    } catch (error) {
      window.costoEnvioActual = 0;
      mostrarTiempoEnvioEstimado('');
      if (typeof mostrarToast === 'function') {
        mostrarToast(error?.message || 'No se pudo calcular el envío.', 'error');
      }
      if (typeof actualizarTotalCheckoutUI === 'function') {
        actualizarTotalCheckoutUI();
      } else {
        actualizarEnvioResumen();
      }
      actualizarPreciosMetodoPago();
    }
  }

  function enlazarCalculoEnvio() {
    if (typeof ENVIO_EN_CHECKOUT_ACTIVO !== 'undefined' && !ENVIO_EN_CHECKOUT_ACTIVO) {
      return;
    }
    const input = document.getElementById('checkout-codigo-postal');
    if (!input || input.dataset.envioBound) return;
    input.dataset.envioBound = '1';
    input.addEventListener('blur', () => {
      calcularEnvioDesdeCodigoPostal();
    });
  }

  /**
   * Aplica el paso en UI sin validar (útil al restaurar desde sessionStorage).
   */
  function aplicarPaso(numeroPaso, { persistir = true, scroll = true } = {}) {
    pasoActual = numeroPaso;
    actualizarProgressUI(pasoActual);
    actualizarPasosUI(pasoActual);

    if (pasoActual === 2) {
      // Siempre recalcular desde el carrito real (primera carga y "Volver").
      refrescarTotalesDesdeCarrito();
    }
    if (pasoActual === 3) actualizarResumenConfirmacion();

    if (persistir) guardarPasoEnSesion(pasoActual);

    if (scroll) {
      const activo = document.getElementById(`paso-${pasoActual}`);
      activo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Navegación entre pasos con validación + persistencia.
   * @param {number} numeroPaso
   */
  window.irAPaso = async function irAPaso(numeroPaso) {
    const destino = Number(numeroPaso);
    if (!Number.isFinite(destino) || destino < PASO_MIN || destino > PASO_MAX) return;

    if (destino > pasoActual) {
      if (pasoActual === 1 && !validarCamposPasoEntrega()) return;
      if (pasoActual === 2 && !validarPasoPago()) return;
      if (destino > pasoActual + 1) return;

      if (pasoActual === 1 && typeof ENVIO_EN_CHECKOUT_ACTIVO !== 'undefined' && ENVIO_EN_CHECKOUT_ACTIVO) {
        await calcularEnvioDesdeCodigoPostal();
      }
    }

    aplicarPaso(destino, { persistir: true, scroll: true });
  };

  async function finalizarPedidoDesdePagina(event) {
    event.preventDefault();

    if (!validarCamposPasoEntrega()) {
      irAPaso(1);
      return;
    }
    if (!validarPasoPago()) {
      irAPaso(2);
      return;
    }

    const metodo = obtenerMetodoPagoSeleccionado();

    if (metodo === 'transferencia') {
      if (typeof procesarPedidoTransferencia === 'function') {
        await procesarPedidoTransferencia();
      }
      return;
    }

    if (typeof procesarPedido === 'function') {
      await procesarPedido(event);
    }
  }

  function enlazarControlesPasos() {
    document.querySelectorAll('[data-ir-paso]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const destino = Number(btn.getAttribute('data-ir-paso'));
        irAPaso(destino);
      });
    });

    document.querySelectorAll('input[name="metodo-pago"]').forEach((input) => {
      input.addEventListener('change', () => {
        // Recalcular siempre al cambiar el método (evita totales huérfanos).
        actualizarPreciosMetodoPago();
        if (typeof actualizarTotalCheckoutUI === 'function') {
          actualizarTotalCheckoutUI();
        }
        if (pasoActual === 3) actualizarResumenConfirmacion();
      });
    });

    const form = document.getElementById('checkout-form');
    form?.addEventListener('submit', finalizarPedidoDesdePagina);
  }

  function sincronizarTotalesPagina() {
    refrescarTotalesDesdeCarrito();
    const subtotalRow = document.getElementById('checkout-summary-subtotal-row');
    if (subtotalRow) subtotalRow.hidden = false;
  }

  /**
   * Punto de entrada llamado desde app.js (DOMContentLoaded, data-page=checkout).
   */
  window.inicializarPaginaCheckout = async function inicializarPaginaCheckout() {
    if (!esPaginaCheckout()) return;

    const sesion =
      typeof obtenerSesionUsuario === 'function' ? obtenerSesionUsuario() : null;

    if (!sesion?.email || sesion.rol === 'admin') {
      limpiarPasoGuardado();
      window.location.replace('index.html');
      return;
    }

    if (typeof cargarCarritoDeSesion === 'function') {
      cargarCarritoDeSesion();
    }

    if (!Array.isArray(carrito) || carrito.length === 0) {
      limpiarPasoGuardado();
      window.location.replace('index.html');
      return;
    }

    // Si el catálogo ya está cargado, reparar precios en 0 / mal parseados.
    if (typeof sincronizarPreciosCarritoDesdeCatalogo === 'function') {
      sincronizarPreciosCarritoDesdeCatalogo();
    }

    enlazarControlesPasos();
    enlazarCalculoEnvio();

    if (typeof prepararCheckoutModal === 'function') {
      await prepararCheckoutModal(sesion);
    } else {
      const emailEl = document.getElementById('checkout-cuenta-email');
      if (emailEl) emailEl.textContent = sesion.email;
      if (typeof renderizarResumenCheckout === 'function') renderizarResumenCheckout();
    }

    sincronizarTotalesPagina();

    // Si ya hay un CP cargado del perfil, calcular envío al iniciar
    const cpInicial = String(document.getElementById('checkout-codigo-postal')?.value || '').trim();
    if (/^\d{4}$/.test(cpInicial)) {
      await calcularEnvioDesdeCodigoPostal();
    }
    // Restaurar progreso tras refresh (si el paso guardado es > 1)
    const pasoGuardado = leerPasoGuardado();
    aplicarPaso(pasoGuardado > 1 ? pasoGuardado : PASO_MIN, {
      persistir: true,
      scroll: pasoGuardado > 1,
    });

    window.addEventListener('storage', () => {
      if (typeof cargarCarritoDeSesion === 'function') cargarCarritoDeSesion();
      if (!carrito.length) {
        limpiarPasoGuardado();
        window.location.replace('index.html');
        return;
      }
      refrescarTotalesDesdeCarrito();
    });
  };

  // Exponer limpieza para que app.js la llame al completar un pedido
  window.limpiarCheckoutPasoGuardado = limpiarPasoGuardado;
})();
