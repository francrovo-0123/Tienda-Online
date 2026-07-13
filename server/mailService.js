const nodemailer = require('nodemailer');

const NOMBRE_TIENDA_DEFECTO = String(process.env.NOMBRE_TIENDA || 'Jersey Store').trim();

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function obtenerPuertoSmtp() {
  const puerto = Number(process.env.SMTP_PORT);
  return Number.isFinite(puerto) && puerto > 0 ? puerto : 587;
}

function construirOpcionesTransporte() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();
  const port = obtenerPuertoSmtp();

  if (!host || !user || !pass) {
    throw new Error(
      'SMTP incompleto: definí SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS en el archivo .env.'
    );
  }

  const opciones = {
    host,
    port,
    auth: { user, pass },
  };

  // 465 = SSL implícito; 587/2525 = STARTTLS
  if (port === 465) {
    opciones.secure = true;
  } else {
    opciones.secure = false;
    opciones.requireTLS = true;
  }

  return opciones;
}

let transporter = null;

function obtenerTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(construirOpcionesTransporte());
  }
  return transporter;
}

function formatearRemitente(nombreTienda) {
  const nombre = String(nombreTienda || NOMBRE_TIENDA_DEFECTO || 'Jersey Store').trim();
  const user = String(process.env.SMTP_USER || '').trim();

  if (!user) {
    throw new Error('SMTP_USER no está definido. El remitente debe coincidir con la cuenta SMTP autenticada.');
  }

  // Obligatorio: from = cuenta autenticada (Gmail/Outlook rechazan remitentes distintos).
  return `"${nombre.replace(/"/g, '')}" <${user}>`;
}

async function verificarConexionSmtp() {
  try {
    const transport = obtenerTransporter();
    await transport.verify();
    console.log(`  ✓ SMTP verificado  →  ${process.env.SMTP_HOST}:${obtenerPuertoSmtp()}`);
    return true;
  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('ERROR SMTP: No se pudo verificar la conexión al servidor de correo.');
    console.error(`  Host: ${process.env.SMTP_HOST || '(no definido)'}`);
    console.error(`  Port: ${process.env.SMTP_PORT || '(no definido)'}`);
    console.error(`  User: ${process.env.SMTP_USER || '(no definido)'}`);
    console.error(`  Detalle: ${error?.message || error}`);
    if (error?.response) {
      console.error(`  Respuesta servidor: ${error.response}`);
    }
    if (error?.code) {
      console.error(`  Código: ${error.code}`);
    }
    console.error('  Revisá SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS en .env.');
    console.error('  Gmail: usá una Contraseña de aplicación (no la contraseña normal).');
    console.error('═══════════════════════════════════════════════════════════');
    return false;
  }
}

/**
 * Envía un correo. Nunca lanza: captura errores para no tumbar el proceso ni el checkout.
 * @returns {{ ok: boolean, info?: object, error?: Error }}
 */
async function enviarMail({ to, subject, html, text, replyTo, nombreTienda }) {
  try {
    const transport = obtenerTransporter();
    const from = formatearRemitente(nombreTienda);

    const info = await transport.sendMail({
      from,
      to,
      subject,
      html,
      text,
      replyTo: replyTo || undefined,
    });

    return { ok: true, info };
  } catch (error) {
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        nivel: 'error',
        contexto: 'SMTP_SEND_MAIL',
        mensaje: error?.message || String(error),
        code: error?.code,
        response: error?.response,
        to,
        subject,
      })
    );
    return { ok: false, error };
  }
}

function envoltorioPlantilla({ nombreTienda, titulo, cuerpoHtml }) {
  const tienda = escapeHtml(nombreTienda || NOMBRE_TIENDA_DEFECTO);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(titulo)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:#111827;padding:28px 32px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${tienda}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${cuerpoHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">&copy; ${tienda} &mdash; Mensaje automático, no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function plantillaVerificacion(codigo, nombreTienda) {
  const codigoSeguro = escapeHtml(codigo);
  const cuerpoHtml = `
    <h1 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Verificá tu cuenta</h1>
    <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
      Usá el siguiente código para completar tu registro. El código vence en <strong>10 minutos</strong>.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;padding:16px 32px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">${codigoSeguro}</span>
    </div>
    <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
      Si no solicitaste este registro, podés ignorar este mensaje de forma segura.
    </p>`;

  return envoltorioPlantilla({
    nombreTienda,
    titulo: 'Verificación de cuenta',
    cuerpoHtml,
  });
}

function plantillaBienvenida(nombreTienda, email) {
  const tienda = escapeHtml(nombreTienda || NOMBRE_TIENDA_DEFECTO);
  const cuerpoHtml = `
    <h1 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Bienvenido a ${tienda}</h1>
    <p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:1.6;">
      Tu cuenta <strong>${escapeHtml(email)}</strong> ya está verificada.
    </p>
    <p style="margin:0;color:#4b5563;font-size:15px;line-height:1.6;">
      Ya podés iniciar sesión, explorar el catálogo y realizar pedidos desde la tienda.
    </p>`;

  return envoltorioPlantilla({
    nombreTienda,
    titulo: `Bienvenido a ${nombreTienda || NOMBRE_TIENDA_DEFECTO}`,
    cuerpoHtml,
  });
}

function formatearMonedaArs(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '$0';
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(numero);
}

function plantillaConfirmacionCompra(pedido, nombreTienda) {
  const tienda = nombreTienda || NOMBRE_TIENDA_DEFECTO;
  const items = Array.isArray(pedido?.productos) ? pedido.productos : [];

  const filasItems = items
    .map((item) => {
      const producto = item?.producto || {};
      const nombre = escapeHtml(producto.nombre || 'Producto');
      const talle = producto.talle ? ` — Talle ${escapeHtml(producto.talle)}` : '';
      const cantidad = Number(item?.cantidad) || 1;
      const precio = formatearMonedaArs(item?.precio);

      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;">${nombre}${talle}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#4b5563;font-size:14px;text-align:center;">${cantidad}</td>
        <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;text-align:right;">${precio}</td>
      </tr>`;
    })
    .join('');

  const cuerpoHtml = `
    <h1 style="margin:0 0 12px;color:#111827;font-size:20px;font-weight:700;">Confirmación de compra</h1>
    <p style="margin:0 0 20px;color:#4b5563;font-size:15px;line-height:1.6;">
      Recibimos tu pedido correctamente. Detalle a continuación:
    </p>
    <p style="margin:0 0 8px;color:#111827;font-size:14px;"><strong>Pedido:</strong> ${escapeHtml(pedido?.id)}</p>
    <p style="margin:0 0 8px;color:#111827;font-size:14px;"><strong>Cliente:</strong> ${escapeHtml(pedido?.cliente)}</p>
    <p style="margin:0 0 20px;color:#111827;font-size:14px;"><strong>Pago:</strong> ${escapeHtml(pedido?.pago || '—')}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
      <tr>
        <th align="left" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Producto</th>
        <th align="center" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Cant.</th>
        <th align="right" style="padding:0 0 8px;color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Precio</th>
      </tr>
      ${filasItems || '<tr><td colspan="3" style="padding:10px 0;color:#6b7280;font-size:14px;">Sin items</td></tr>'}
    </table>
    <p style="margin:0;color:#111827;font-size:18px;font-weight:700;text-align:right;">
      Total: ${formatearMonedaArs(pedido?.total)}
    </p>
    <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.5;">
      Te avisaremos cuando el estado de tu pedido cambie. Gracias por comprar en ${escapeHtml(tienda)}.
    </p>`;

  return envoltorioPlantilla({
    nombreTienda: tienda,
    titulo: `Confirmación de compra ${pedido?.id || ''}`.trim(),
    cuerpoHtml,
  });
}

function plantillaContacto({ nombre, email, mensaje, nombreTienda }) {
  const cuerpoHtml = `
    <h1 style="margin:0 0 16px;color:#111827;font-size:20px;font-weight:700;">Nuevo mensaje de contacto</h1>
    <p style="margin:0 0 8px;color:#111827;font-size:14px;"><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
    <p style="margin:0 0 16px;color:#111827;font-size:14px;"><strong>Correo:</strong> ${escapeHtml(email)}</p>
    <p style="margin:0 0 8px;color:#111827;font-size:14px;"><strong>Mensaje:</strong></p>
    <p style="margin:0;padding:12px 16px;background:#f3f4f6;border-radius:8px;color:#374151;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(mensaje)}</p>`;

  return envoltorioPlantilla({
    nombreTienda,
    titulo: 'Nuevo mensaje de contacto',
    cuerpoHtml,
  });
}

async function enviarCodigoVerificacion(email, codigo, nombreTienda) {
  const tienda = nombreTienda || NOMBRE_TIENDA_DEFECTO;
  const resultado = await enviarMail({
    to: email,
    nombreTienda: tienda,
    subject: `Tu código de verificación — ${tienda}`,
    html: plantillaVerificacion(codigo, tienda),
    text: `Tu código de verificación en ${tienda} es: ${codigo}. Vence en 10 minutos.`,
  });

  if (!resultado.ok) {
    throw resultado.error || new Error('No se pudo enviar el email de verificación.');
  }

  return resultado;
}

async function enviarBienvenida(email, nombreTienda) {
  const tienda = nombreTienda || NOMBRE_TIENDA_DEFECTO;
  return enviarMail({
    to: email,
    nombreTienda: tienda,
    subject: `Bienvenido a ${tienda}`,
    html: plantillaBienvenida(tienda, email),
    text: `Bienvenido a ${tienda}. Tu cuenta ${email} ya está verificada. Ya podés iniciar sesión y realizar pedidos.`,
  });
}

async function enviarConfirmacionCompra(pedido, nombreTienda) {
  const tienda = nombreTienda || NOMBRE_TIENDA_DEFECTO;
  const email = String(pedido?.emailUsuario || '').trim();

  if (!email) {
    console.error('[SMTP_SEND_MAIL] Confirmación de compra sin emailUsuario.');
    return { ok: false, error: new Error('Pedido sin emailUsuario.') };
  }

  const itemsTexto = (pedido?.productos || [])
    .map((item) => {
      const producto = item?.producto || {};
      const talle = producto.talle ? ` (Talle ${producto.talle})` : '';
      return `- ${producto.nombre || 'Producto'}${talle} x${item?.cantidad || 1}: ${formatearMonedaArs(item?.precio)}`;
    })
    .join('\n');

  return enviarMail({
    to: email,
    nombreTienda: tienda,
    subject: `Confirmación de compra ${pedido.id} — ${tienda}`,
    html: plantillaConfirmacionCompra(pedido, tienda),
    text: [
      `Confirmación de compra — ${tienda}`,
      `Pedido: ${pedido.id}`,
      `Cliente: ${pedido.cliente || ''}`,
      `Pago: ${pedido.pago || ''}`,
      '',
      'Productos:',
      itemsTexto,
      '',
      `Total: ${formatearMonedaArs(pedido.total)}`,
    ].join('\n'),
  });
}

async function enviarMensajeContacto({ nombre, email, mensaje, adminEmail, nombreTienda }) {
  const tienda = nombreTienda || NOMBRE_TIENDA_DEFECTO;
  const resultado = await enviarMail({
    to: adminEmail,
    replyTo: email,
    nombreTienda: tienda,
    subject: `Nuevo mensaje de contacto — ${tienda}`,
    html: plantillaContacto({ nombre, email, mensaje, nombreTienda: tienda }),
    text: [
      'Nuevo mensaje de contacto desde la tienda.',
      '',
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      '',
      'Mensaje:',
      mensaje,
    ].join('\n'),
  });

  if (!resultado.ok) {
    throw resultado.error || new Error('No se pudo enviar el mensaje de contacto.');
  }

  return resultado;
}

module.exports = {
  verificarConexionSmtp,
  enviarMail,
  enviarCodigoVerificacion,
  enviarBienvenida,
  enviarConfirmacionCompra,
  enviarMensajeContacto,
  formatearRemitente,
};
