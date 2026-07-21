/**
 * [M6] Retorno unificado de Mercado Pago (pago-resultado.html).
 * Solo consulta (GET). La actualización de estado la hace el webhook.
 *
 * Estados soportados (query `status` / `collection_status` / alias legacy):
 *   success | approved  → polling de confirmación
 *   failure | rejected | cancelled | null → mensaje de rechazo
 *   pending | in_process → mensaje de pendiente
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const externalReference = String(params.get('external_reference') || '').trim();

  const statusEl = document.getElementById('pago-retorno-status');
  const detailEl = document.getElementById('pago-retorno-detail');
  const ctaEl = document.getElementById('pago-retorno-cta');
  const cardEl = document.getElementById('pago-card');

  const POLL_INTERVAL_MS = 2000;
  const POLL_MAX_MS = 45000;
  const ESTADOS_PREPARACION = new Set([
    'listo_empaquetar',
    'PREPARACIÓN',
    'PREPARACION',
    'preparacion',
  ]);

  const MENSAJES = {
    success: {
      titulo: 'Procesando tu pago…',
      detalle: 'Esperá un momento mientras verificamos la confirmación del pago.',
      cta: 'Ver mis pedidos',
      href: 'cuenta.html#pedidos',
    },
    failure: {
      titulo: 'Pago no realizado',
      detalle: 'El pago fue rechazado o cancelado. Podés volver a la tienda e intentar nuevamente.',
      cta: 'Volver a la tienda',
      href: 'index.html',
    },
    pending: {
      titulo: 'Pago pendiente',
      detalle:
        'Tu pago está en proceso de acreditación. Cuando se confirme, el pedido pasará a preparación y lo vas a ver en Mis pedidos.',
      cta: 'Ver mis pedidos',
      href: 'cuenta.html#pedidos',
    },
  };

  function normalizarEstadoRetorno(crudo) {
    const valor = String(crudo || '').trim().toLowerCase();
    if (!valor) return '';

    if (
      valor === 'success' ||
      valor === 'approved' ||
      valor === 'exito' ||
      valor === 'éxito'
    ) {
      return 'success';
    }

    if (
      valor === 'failure' ||
      valor === 'fail' ||
      valor === 'rejected' ||
      valor === 'cancelled' ||
      valor === 'canceled' ||
      valor === 'null' ||
      valor === 'falla' ||
      valor === 'fallido'
    ) {
      return 'failure';
    }

    if (
      valor === 'pending' ||
      valor === 'in_process' ||
      valor === 'in_mediation' ||
      valor === 'pendiente'
    ) {
      return 'pending';
    }

    return '';
  }

  function resolverEstado() {
    const desdeDataset = normalizarEstadoRetorno(document.body?.dataset?.pagoRetorno);
    if (desdeDataset) return desdeDataset;

    // Preferir `resultado=` (nuestro) sobre `status=` (MP: approved/rejected/…).
    const desdeQuery =
      normalizarEstadoRetorno(params.get('resultado')) ||
      normalizarEstadoRetorno(params.get('collection_status')) ||
      normalizarEstadoRetorno(params.get('status'));

    return desdeQuery || 'success';
  }

  const estadoRetorno = resolverEstado();
  document.body.dataset.pagoRetorno = estadoRetorno;
  if (cardEl) cardEl.dataset.estado = estadoRetorno;

  function setMensaje(titulo, detalle) {
    if (statusEl) statusEl.textContent = titulo;
    if (detailEl) detailEl.textContent = detalle;
  }

  function aplicarPlantilla(estado) {
    const msg = MENSAJES[estado] || MENSAJES.success;
    setMensaje(msg.titulo, msg.detalle);
    if (ctaEl) {
      ctaEl.textContent = msg.cta;
      ctaEl.setAttribute('href', msg.href);
    }
    if (cardEl) cardEl.dataset.estado = estado;
    document.title = `${msg.titulo} — Jersey Store`;
  }

  function headersApi() {
    return {
      ...( /\.ngrok(-free)?\.(app|dev|io)$/i.test(window.location.hostname)
        ? { 'ngrok-skip-browser-warning': 'true' }
        : {}),
    };
  }

  try {
    sessionStorage.removeItem('checkout_paso');
  } catch {
    // noop
  }

  if (typeof window.limpiarCheckoutPasoGuardado === 'function') {
    window.limpiarCheckoutPasoGuardado();
  }

  aplicarPlantilla(estadoRetorno);

  if (estadoRetorno === 'failure' || estadoRetorno === 'pending') {
    return;
  }

  function pedidoEnPreparacion(pedido) {
    const estado = String(pedido?.estado || '').trim();
    return ESTADOS_PREPARACION.has(estado);
  }

  async function fetchPedidosMios() {
    const respuesta = await fetch(`${window.location.origin}/api/pedidos/mios`, {
      method: 'GET',
      credentials: 'include',
      headers: headersApi(),
    });

    if (respuesta.status === 401 || respuesta.status === 403) {
      return { auth: false, pedidos: [] };
    }

    if (!respuesta.ok) {
      throw new Error(`No se pudo consultar el pedido (${respuesta.status}).`);
    }

    const datos = await respuesta.json().catch(() => []);
    return {
      auth: true,
      pedidos: Array.isArray(datos) ? datos : [],
    };
  }

  async function consultarEstadoPedido() {
    const mpStatus = String(
      params.get('status') || params.get('collection_status') || ''
    ).trim().toLowerCase();

    if (!externalReference) {
      setMensaje(
        'Pago recibido',
        'No pudimos identificar el pedido en la URL. Revisá Mis pedidos en unos minutos; la confirmación la procesa Mercado Pago automáticamente.'
      );
      return;
    }

    // Si MP mandó un status explícito distinto de approved y no vinimos por alias success
    if (mpStatus && mpStatus !== 'approved' && mpStatus !== 'success') {
      const normalizado = normalizarEstadoRetorno(mpStatus);
      if (normalizado === 'failure' || normalizado === 'pending') {
        aplicarPlantilla(normalizado);
        return;
      }
      setMensaje(
        'Pago no confirmado',
        `Mercado Pago devolvió estado “${mpStatus}”. Si el dinero se debitó, el pedido se actualizará cuando llegue la notificación del webhook.`
      );
      return;
    }

    setMensaje(
      'Pago recibido',
      'Estamos esperando la confirmación automática del pago. No cierres esta página…'
    );

    const inicio = Date.now();

    while (Date.now() - inicio < POLL_MAX_MS) {
      try {
        const { auth, pedidos } = await fetchPedidosMios();

        if (!auth) {
          setMensaje(
            '¡Pago aprobado!',
            'Tu pago fue recibido. Iniciá sesión y revisá Mis pedidos: la confirmación la procesa el servidor automáticamente.'
          );
          if (cardEl) cardEl.dataset.estado = 'success';
          return;
        }

        const pedido = pedidos.find(
          (p) => String(p?.id || '').trim() === externalReference
        );

        if (pedido && pedidoEnPreparacion(pedido)) {
          setMensaje(
            '¡Pago aprobado!',
            'Tu pedido ya está en PREPARACIÓN. Podés seguirlo en Mis pedidos.'
          );
          if (cardEl) cardEl.dataset.estado = 'success';
          return;
        }

        if (pedido) {
          setMensaje(
            'Pago recibido',
            'Tu pago está siendo verificado. El pedido pasará a preparación en cuanto llegue la confirmación…'
          );
        }
      } catch {
        // Seguir reintentando hasta el timeout; el webhook es la fuente de verdad.
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setMensaje(
      'Pago recibido',
      'Recibimos el retorno de Mercado Pago. La confirmación puede demorar unos minutos; revisá Mis pedidos en breve.'
    );
  }

  consultarEstadoPedido();
})();
