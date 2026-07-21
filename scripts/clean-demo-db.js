/**
 * Preparación de "Tienda Demo" para reuniones comerciales.
 *
 * Qué hace:
 *  1. Conserva estrictamente usuarios con rol 'admin' (y emails admin de .env).
 *  2. Vacía pedidos + reinicia el contador de números de pedido (historial en $0).
 *  3. Elimina productos de prueba (placeholders / nombres incoherentes) y
 *     reestablece stock de talles/variantes de los productos reales.
 *  4. Reemplaza cupones por cupones demo profesionales (BIENVENIDO10).
 *  5. Limpia clientes de prueba y registros pendientes (no toca Seccion).
 *
 * Uso (desde la raíz del repo):
 *   node scripts/clean-demo-db.js
 *   node scripts/clean-demo-db.js --dry-run
 *   npm run clean-demo
 *
 * En producción (NODE_ENV=production) exige confirmar escribiendo:
 *   SÍ, PREPARAR DEMO
 *
 * Variables opcionales en server/.env:
 *   DEMO_STOCK_POR_VARIANTE=15
 */

const path = require('path');
const readline = require('readline');
const Module = require('module');

const SERVER_ROOT = path.join(__dirname, '..', 'server');
const SERVER_NODE_MODULES = path.join(SERVER_ROOT, 'node_modules');

// Resuelve dependencias instaladas en /server aunque el script viva en /scripts.
const originalNodePath = process.env.NODE_PATH || '';
process.env.NODE_PATH = [SERVER_NODE_MODULES, originalNodePath]
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });

const mongoose = require('mongoose');

const EMAIL_ADMIN_PROTEGIDO = 'admin@jerseysstore.com';
const FRASE_CONFIRMACION_PRODUCCION = 'SÍ, PREPARAR DEMO';
const STOCK_POR_VARIANTE = Math.max(
  1,
  Math.floor(Number(process.env.DEMO_STOCK_POR_VARIANTE) || 15)
);
const TALLES_ROPA_DEFECTO = ['S', 'M', 'L', 'XL', 'XXL'];

const CUPONES_DEMO = [
  {
    codigo: 'BIENVENIDO10',
    descuentoPorcentaje: 10,
    activo: true,
    tipoFiltro: 'todos',
    referenciaId: null,
  },
];

/** Nombres genéricos del seed automático (PRODUCTOS_BASE en server.js). */
const NOMBRES_SEMILLA = new Set(['remera', 'campera', 'pantalón', 'pantalon']);

/**
 * Patrones de nombres incoherentes / de prueba.
 * No incluye marcas reales (Boca, River, AFA, etc.).
 */
const PATRONES_PRODUCTO_PRUEBA = [
  /^test[\s_-]/i,
  /\btest\b/i,
  /^prueba[\s_-]/i,
  /\bprueba\b/i,
  /^demo[\s_-]/i,
  /\bdemo\b/i,
  /^asdf/i,
  /^qwerty/i,
  /^xxx+/i,
  /^lorem\b/i,
  /^foo\b/i,
  /^bar\b/i,
  /^sample\b/i,
  /^producto\s*\d*$/i,
  /^sin\s*nombre/i,
  /^n\/?a$/i,
  /^new\s*product/i,
  /^untitled/i,
];

const MONGO_OPTIONS = {
  maxPoolSize: 5,
  serverSelectionTimeoutMS: 15000,
  bufferCommands: false,
};

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || args.has('-n');

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
  for (const valor of [
    process.env.ADMIN_INICIAL_EMAIL,
    process.env.ADMIN_EMAIL,
    process.env.MONGODB_ADMIN_EMAIL,
  ]) {
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
  if (process.env.NODE_ENV !== 'production') return;

  console.error('');
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║  ALERTA: NODE_ENV=production                               ║');
  console.error('║  Este script limpiará pedidos, clientes y cupones en vivo. ║');
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

  console.log('=> Confirmación aceptada. Continuando...\n');
}

function modeloMinimo(nombre, campos = {}) {
  return (
    mongoose.models[nombre] ||
    mongoose.model(nombre, new mongoose.Schema(campos, { strict: false }))
  );
}

function imagenEsPlaceholder(url) {
  const u = String(url || '').toLowerCase();
  return (
    u.includes('placehold.co') ||
    u.includes('placeholder.com') ||
    u.includes('via.placeholder') ||
    u.includes('dummyimage.com') ||
    u.includes('/placeholder')
  );
}

/**
 * Heurística segura: solo elimina productos claramente de prueba.
 * Los catálogos reales (Cloudinary + nombres de clubes) se conservan.
 */
function esProductoDePrueba(producto) {
  const nombre = String(producto.nombre || '').trim();
  const nombreNorm = nombre.toLowerCase();
  const imagenFrente = producto.imagenFrente || '';
  const imagenEspalda = producto.imagenEspalda || '';

  if (imagenEsPlaceholder(imagenFrente) || imagenEsPlaceholder(imagenEspalda)) {
    return true;
  }

  // Seed automático: ids 1–3 con nombres genéricos Remera/Campera/Pantalón.
  const idNum = Number(producto.id);
  if (
    Number.isFinite(idNum) &&
    idNum >= 1 &&
    idNum <= 3 &&
    NOMBRES_SEMILLA.has(nombreNorm)
  ) {
    return true;
  }

  if (!nombre || nombreNorm.length < 2) return true;

  for (const patron of PATRONES_PRODUCTO_PRUEBA) {
    if (patron.test(nombre)) return true;
  }

  return false;
}

function clavesDesdeStockTalles(stockTalles) {
  if (!stockTalles) return [];
  if (stockTalles instanceof Map) return [...stockTalles.keys()].map(String);
  if (typeof stockTalles.toObject === 'function') {
    return Object.keys(stockTalles.toObject());
  }
  if (typeof stockTalles === 'object') {
    return Object.keys(stockTalles);
  }
  return [];
}

/** Reconstruye stockTalles con N unidades por variante y stock total coherente. */
function armarStockDemo(producto) {
  let claves = clavesDesdeStockTalles(producto.stockTalles);

  if (claves.length === 0 && Array.isArray(producto.talles) && producto.talles.length) {
    claves = producto.talles.map((t) => String(t).trim()).filter(Boolean);
  }

  if (claves.length === 0) {
    claves = [...TALLES_ROPA_DEFECTO];
  }

  const stockTalles = {};
  for (const clave of claves) {
    stockTalles[clave] = STOCK_POR_VARIANTE;
  }

  return {
    stockTalles,
    stock: claves.length * STOCK_POR_VARIANTE,
    ventasContador: 0,
  };
}

async function cleanDemoDb() {
  await confirmarSiProduccion();

  const mongoUri = obtenerMongoUri();
  if (!mongoUri) {
    throw new Error(
      'Definí MONGO_URI (o MONGODB_URI) en server/.env antes de ejecutar el script.'
    );
  }

  if (DRY_RUN) {
    console.log('=> MODO DRY-RUN: no se escribirá nada en la base.\n');
  }

  console.log('=> Conectando a MongoDB...');
  await mongoose.connect(mongoUri, MONGO_OPTIONS);
  console.log(`=> Conectado a: ${mongoose.connection.name}`);
  console.log(`=> Stock demo por variante: ${STOCK_POR_VARIANTE}\n`);

  const Producto = modeloMinimo('Producto');
  const Pedido = modeloMinimo('Pedido');
  const Cupon = modeloMinimo('Cupon');
  const RegistroPendiente = modeloMinimo('RegistroPendiente');
  const Usuario = modeloMinimo('Usuario', { email: String, rol: String });

  const emailsProtegidos = obtenerEmailsProtegidos();

  const admins = await Usuario.find({
    $or: [{ email: { $in: emailsProtegidos } }, { rol: 'admin' }],
  })
    .select('email rol')
    .lean();

  if (!admins.length) {
    throw new Error(
      `Abortado: no se encontró ningún admin (rol: 'admin' o emails: ${emailsProtegidos.join(
        ', '
      )}). No se modificó nada.`
    );
  }

  console.log('=> Admins protegidos (intactos):');
  for (const admin of admins) {
    console.log(`   • ${admin.email} (${admin.rol || 'n/d'})`);
  }
  console.log('');

  // ── 1) Pedidos + contador ──────────────────────────────────────────
  const pedidosAntes = await Pedido.countDocuments();
  if (!DRY_RUN) {
    await Pedido.deleteMany({});
    // Contador._id es String ('pedido') en server.js — borrar por colección nativa.
    await mongoose.connection.db.collection('contadors').deleteMany({ _id: 'pedido' });
  }
  console.log(`=> Pedidos vaciados: ${pedidosAntes}`);
  console.log('=> Contador de pedidos reiniciado (próximo número ~1001)');

  // ── 2) Productos de prueba + stock ─────────────────────────────────
  const todosProductos = await Producto.find({}).lean();
  const dePrueba = todosProductos.filter(esProductoDePrueba);
  const aConservar = todosProductos.filter((p) => !esProductoDePrueba(p));

  if (dePrueba.length) {
    console.log(`\n=> Productos de prueba a eliminar (${dePrueba.length}):`);
    for (const p of dePrueba) {
      console.log(`   • [${p.id}] ${p.nombre}`);
    }
    if (!DRY_RUN) {
      await Producto.deleteMany({
        _id: { $in: dePrueba.map((p) => p._id) },
      });
    }
  } else {
    console.log('\n=> No se detectaron productos de prueba (catálogo real intacto).');
  }

  let stockActualizados = 0;
  console.log(
    `\n=> Reestableciendo stock a ${STOCK_POR_VARIANTE} u/variante en ${aConservar.length} productos...`
  );
  for (const producto of aConservar) {
    const patch = armarStockDemo(producto);
    if (!DRY_RUN) {
      await Producto.updateOne(
        { _id: producto._id },
        {
          $set: {
            stockTalles: patch.stockTalles,
            stock: patch.stock,
            ventasContador: 0,
            activo: true,
          },
        }
      );
    }
    stockActualizados += 1;
  }
  console.log(`=> Stock reestablecido en ${stockActualizados} productos.`);

  // ── 3) Cupones demo ────────────────────────────────────────────────
  const cuponesAntes = await Cupon.countDocuments();
  if (!DRY_RUN) {
    await Cupon.deleteMany({});
    if (CUPONES_DEMO.length) {
      await Cupon.insertMany(CUPONES_DEMO);
    }
  }
  console.log(`\n=> Cupones anteriores eliminados: ${cuponesAntes}`);
  console.log(
    `=> Cupones demo sembrados: ${CUPONES_DEMO.map((c) => c.codigo).join(', ') || '(ninguno)'}`
  );
  console.log(
    '   (Nota: el -10% por transferencia bancaria es del checkout, no un cupón.)'
  );

  // ── 4) Clientes de prueba / registros pendientes ───────────────────
  const filtroClientes = {
    rol: { $ne: 'admin' },
    email: { $nin: emailsProtegidos },
  };
  const clientesAntes = await Usuario.countDocuments(filtroClientes);
  const pendientesAntes = await RegistroPendiente.countDocuments();

  if (!DRY_RUN) {
    await Usuario.deleteMany(filtroClientes);
    await RegistroPendiente.deleteMany({});
  }

  const adminsRestantes = await Usuario.countDocuments({
    $or: [{ rol: 'admin' }, { email: { $in: emailsProtegidos } }],
  });

  console.log(`\n=> Usuarios cliente eliminados: ${clientesAntes}`);
  console.log(`=> Registros pendientes eliminados: ${pendientesAntes}`);
  console.log(`=> Usuarios admin intactos: ${adminsRestantes}`);
  console.log('=> Seccion: sin cambios.');

  console.log('\n════════════════════════════════════════');
  console.log('  TIENDA DEMO LISTA');
  console.log('════════════════════════════════════════');
  if (DRY_RUN) {
    console.log('  (dry-run: no se persistió ningún cambio)');
  } else {
    console.log('  Pedidos = 0 | Cupón demo = BIENVENIDO10');
    console.log(`  Catálogo: ${aConservar.length} productos con stock demo`);
  }
  console.log('');
  console.log('  Frontend (antes de la reunión):');
  console.log('  Abrí la tienda → F12 → consola → limpiarCarritoDemo()');
  console.log('════════════════════════════════════════\n');

  return {
    ok: true,
    dryRun: DRY_RUN,
    pedidosEliminados: pedidosAntes,
    productosPruebaEliminados: dePrueba.length,
    productosConservados: aConservar.length,
    stockActualizados,
    cuponesDemo: CUPONES_DEMO.map((c) => c.codigo),
    clientesEliminados: clientesAntes,
    adminsRestantes,
    admins: admins.map((a) => a.email),
  };
}

cleanDemoDb()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('');
    console.error('Error en clean-demo-db:', error.message || error);
    try {
      await mongoose.disconnect();
    } catch (_) {
      /* ignore */
    }
    process.exit(1);
  });
