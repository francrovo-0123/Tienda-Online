/**
 * Limpieza one-shot de usuarios de prueba.
 * Conserva siempre al administrador (admin@jerseysstore.com y cualquier rol: admin).
 *
 * Uso (desde /server):
 *   node scripts/limpiar-usuarios-prueba.js
 *   npm run limpiar-usuarios
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');

const EMAIL_ADMIN_PROTEGIDO = 'admin@jerseysstore.com';

const MONGO_OPTIONS = {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 10000,
  bufferCommands: false,
};

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function obtenerEmailsProtegidos() {
  const emails = new Set([EMAIL_ADMIN_PROTEGIDO]);
  const emailEnv = normalizarEmail(process.env.ADMIN_INICIAL_EMAIL);
  if (emailEnv) emails.add(emailEnv);
  return [...emails];
}

async function limpiarUsuariosPrueba() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI no está definido en .env');
  }

  await mongoose.connect(mongoUri, MONGO_OPTIONS);

  // Modelos mínimos (misma colección que server.js); strict:false evita conflictos de schema.
  const Usuario =
    mongoose.models.Usuario ||
    mongoose.model(
      'Usuario',
      new mongoose.Schema(
        {
          email: String,
          rol: String,
        },
        { strict: false }
      )
    );

  const Pedido =
    mongoose.models.Pedido ||
    mongoose.model(
      'Pedido',
      new mongoose.Schema(
        {
          emailUsuario: String,
        },
        { strict: false }
      )
    );

  const emailsProtegidos = obtenerEmailsProtegidos();

  // Filtro estricto: nunca borrar el admin por email ni por rol.
  const filtroUsuariosPrueba = {
    email: { $nin: emailsProtegidos },
    rol: { $ne: 'admin' },
  };

  const usuariosAEliminar = await Usuario.find(filtroUsuariosPrueba).select('email').lean();
  const emailsAEliminar = usuariosAEliminar.map((u) => normalizarEmail(u.email)).filter(Boolean);

  const adminConservado = await Usuario.findOne({
    $or: [{ email: { $in: emailsProtegidos } }, { rol: 'admin' }],
  })
    .select('email rol')
    .lean();

  if (!adminConservado) {
    throw new Error(
      `Abortado: no se encontró la cuenta admin protegida (${EMAIL_ADMIN_PROTEGIDO}). No se eliminó nada.`
    );
  }

  let pedidosEliminados = 0;
  if (emailsAEliminar.length > 0) {
    const resultadoPedidos = await Pedido.deleteMany({
      emailUsuario: { $in: emailsAEliminar },
    });
    pedidosEliminados = resultadoPedidos.deletedCount || 0;
  }

  // Equivalente seguro a: Usuario.deleteMany({ email: { $ne: "admin@jerseysstore.com" } })
  const resultadoUsuarios = await Usuario.deleteMany(filtroUsuariosPrueba);
  const usuariosEliminados = resultadoUsuarios.deletedCount || 0;

  const resumen = {
    ok: true,
    mensaje: `Se eliminaron ${usuariosEliminados} usuarios de prueba`,
    usuariosEliminados,
    pedidosEliminados,
    adminConservado: adminConservado.email,
    emailsProtegidos,
  };

  console.log(JSON.stringify(resumen, null, 2));
  console.log(`=> ${resumen.mensaje}. Admin intacto: ${resumen.adminConservado}`);
  if (pedidosEliminados > 0) {
    console.log(`=> También se eliminaron ${pedidosEliminados} pedidos asociados a esos emails.`);
  }

  return resumen;
}

limpiarUsuariosPrueba()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Error al limpiar usuarios de prueba:', error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
