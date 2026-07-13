/**
 * Reset de base de datos para el lanzamiento de Fútbol Global Store.
 *
 * Vacía pedidos, cupones, productos y datos de prueba;
 * conserva usuarios con rol 'admin' (y emails admin configurados).
 *
 * Uso (desde /server):
 *   node scripts/resetDb.js
 *   npm run reset-db
 *
 * En producción (NODE_ENV=production) exige confirmar escribiendo:
 *   SÍ, ELIMINAR TODO
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const readline = require('readline');
const mongoose = require('mongoose');

const EMAIL_ADMIN_PROTEGIDO = 'admin@jerseysstore.com';
const FRASE_CONFIRMACION_PRODUCCION = 'SÍ, ELIMINAR TODO';

const MONGO_OPTIONS = {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 15000,
  bufferCommands: false,
};

const COLECCIONES_LOG_AUDITORIA = [
  'logs',
  'log',
  'auditorias',
  'auditoria',
  'auditlogs',
  'auditlog',
  'audits',
];

function normalizarEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function obtenerMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || '';
}

function obtenerEmailsProtegidos() {
  const emails = new Set([EMAIL_ADMIN_PROTEGIDO]);
  const desdeEnv = [
    process.env.ADMIN_INICIAL_EMAIL,
    process.env.ADMIN_EMAIL,
    process.env.MONGODB_ADMIN_EMAIL,
  ];
  for (const valor of desdeEnv) {
    const email = normalizarEmail(valor);
    if (email) emails.add(email);
  }
  return [...emails];
}

function preguntar(pregunta) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(pregunta, (respuesta) => {
      rl.close();
      resolve(String(respuesta || '').trim());
    });
  });
}

async function confirmarSiProduccion() {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  console.error('');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║  ALERTA: NODE_ENV=production                               ║');
  console.error('║  Este script BORRARÁ datos de la base en vivo.             ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error(`Para continuar, escribí exactamente: ${FRASE_CONFIRMACION_PRODUCCION}`);
  console.error('(cualquier otra respuesta cancela la operación)');
  console.error('');

  const respuesta = await preguntar('Confirmación: ');
  if (respuesta !== FRASE_CONFIRMACION_PRODUCCION) {
    throw new Error(
      'Operación cancelada. Confirmación inválida (producción protegida).'
    );
  }

  console.log('=> Confirmación aceptada. Continuando con el reset...\n');
}

function modeloMinimo(nombre, campos = {}) {
  return (
    mongoose.models[nombre] ||
    mongoose.model(nombre, new mongoose.Schema(campos, { strict: false }))
  );
}

async function vaciarColeccionSiExiste(nombreColeccion) {
  const colecciones = await mongoose.connection.db
    .listCollections({ name: nombreColeccion })
    .toArray();

  if (colecciones.length === 0) {
    return { existe: false, eliminados: 0 };
  }

  const resultado = await mongoose.connection.db
    .collection(nombreColeccion)
    .deleteMany({});
  return { existe: true, eliminados: resultado.deletedCount || 0 };
}

async function resetDb() {
  await confirmarSiProduccion();

  const mongoUri = obtenerMongoUri();
  if (!mongoUri) {
    throw new Error(
      'Definí MONGODB_URI (o MONGO_URI) en server/.env antes de ejecutar el reset.'
    );
  }

  console.log('=> Conectando a MongoDB...');
  await mongoose.connect(mongoUri, MONGO_OPTIONS);
  console.log(`=> Conectado a: ${mongoose.connection.name}\n`);

  const Producto = modeloMinimo('Producto');
  const Pedido = modeloMinimo('Pedido');
  const Cupon = modeloMinimo('Cupon');
  const Contador = modeloMinimo('Contador');
  const RegistroPendiente = modeloMinimo('RegistroPendiente');
  const Usuario = modeloMinimo('Usuario', { email: String, rol: String });

  const emailsProtegidos = obtenerEmailsProtegidos();

  const adminConservado = await Usuario.findOne({
    $or: [{ email: { $in: emailsProtegidos } }, { rol: 'admin' }],
  })
    .select('email rol')
    .lean();

  if (!adminConservado) {
    throw new Error(
      `Abortado: no se encontró ningún admin (rol: 'admin' o emails: ${emailsProtegidos.join(
        ', '
      )}). No se eliminó nada.`
    );
  }

  console.log(
    `=> Admin a conservar: ${adminConservado.email} (rol: ${adminConservado.rol || 'n/d'})`
  );
  console.log('=> Iniciando limpieza...\n');

  const resultadoPedidos = await Pedido.deleteMany({});
  const pedidosEliminados = resultadoPedidos.deletedCount || 0;

  const resultadoCupones = await Cupon.deleteMany({});
  const cuponesEliminados = resultadoCupones.deletedCount || 0;

  const resultadoProductos = await Producto.deleteMany({});
  const productosEliminados = resultadoProductos.deletedCount || 0;

  const resultadoContadores = await Contador.deleteMany({});
  const contadoresEliminados = resultadoContadores.deletedCount || 0;

  const resultadoRegistrosPendientes = await RegistroPendiente.deleteMany({});
  const registrosPendientesEliminados =
    resultadoRegistrosPendientes.deletedCount || 0;

  const filtroUsuariosNoAdmin = {
    rol: { $ne: 'admin' },
    email: { $nin: emailsProtegidos },
  };
  const resultadoUsuarios = await Usuario.deleteMany(filtroUsuariosNoAdmin);
  const usuariosEliminados = resultadoUsuarios.deletedCount || 0;

  const adminsRestantes = await Usuario.countDocuments({
    $or: [{ rol: 'admin' }, { email: { $in: emailsProtegidos } }],
  });

  const logsEliminados = {};
  const nombresEnDb = (
    await mongoose.connection.db.listCollections().toArray()
  ).map((c) => c.name.toLowerCase());

  for (const nombre of COLECCIONES_LOG_AUDITORIA) {
    if (!nombresEnDb.includes(nombre)) continue;
    const { eliminados } = await vaciarColeccionSiExiste(nombre);
    logsEliminados[nombre] = eliminados;
  }

  console.log('════════════════════════════════════════');
  console.log('  RESET COMPLETADO — resumen');
  console.log('════════════════════════════════════════');
  console.log(`  Pedido                 : ${pedidosEliminados} eliminados`);
  console.log(`  Cupon                  : ${cuponesEliminados} eliminados`);
  console.log(`  Producto               : ${productosEliminados} eliminados`);
  console.log(`  Contador               : ${contadoresEliminados} eliminados`);
  console.log(
    `  RegistroPendiente      : ${registrosPendientesEliminados} eliminados`
  );
  console.log(`  Usuario (no admin)     : ${usuariosEliminados} eliminados`);
  console.log(`  Usuarios admin intactos: ${adminsRestantes}`);

  const entradasLog = Object.entries(logsEliminados);
  if (entradasLog.length === 0) {
    console.log('  Logs / auditorías      : (no había colecciones)');
  } else {
    for (const [nombre, cantidad] of entradasLog) {
      console.log(`  ${nombre.padEnd(22)} : ${cantidad} eliminados`);
    }
  }

  console.log('════════════════════════════════════════');
  console.log(`=> Admin intacto: ${adminConservado.email}`);
  console.log('=> Podés cargar productos de cero desde el panel.\n');

  return {
    ok: true,
    pedidosEliminados,
    cuponesEliminados,
    productosEliminados,
    contadoresEliminados,
    registrosPendientesEliminados,
    usuariosEliminados,
    adminsRestantes,
    logsEliminados,
    adminConservado: adminConservado.email,
  };
}

resetDb()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('');
    console.error('Error en resetDb:', error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
