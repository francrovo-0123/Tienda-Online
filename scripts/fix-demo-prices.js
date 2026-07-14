/**
 * Corrige precios de prueba en el catálogo para la Tienda Demo.
 * Uso: node scripts/fix-demo-prices.js
 */

const path = require('path');
const Module = require('module');

const SERVER_ROOT = path.join(__dirname, '..', 'server');
process.env.NODE_PATH = [path.join(SERVER_ROOT, 'node_modules'), process.env.NODE_PATH || '']
  .filter(Boolean)
  .join(path.delimiter);
Module._initPaths();

require('dotenv').config({ path: path.join(SERVER_ROOT, '.env') });
const mongoose = require('mongoose');

/** Ajustes por id numérico del producto. */
const AJUSTES = [
  {
    id: 1783892971545,
    nombre: 'Camiseta Visitante',
    precio: 45000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783981998514,
    nombre: 'CAMISETA - AFA PREMATCH CLASSIC - MUNDIAL 2026',
    precio: 38000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783399120038,
    nombre: 'Boca juniors 24/25',
    precio: 55000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783392599185,
    nombre: 'Camiseta Boca juniors 25/26',
    precio: 58000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783393176829,
    nombre: 'Boca juniors 02/03',
    precio: 95000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783398850887,
    nombre: 'Boca juniors 09/10',
    precio: 89000,
    precioOferta: null,
    enOferta: false,
  },
  {
    id: 1783398965912,
    nombre: 'River plate 24/25',
    precio: 75000,
    precioOferta: 65000,
    enOferta: true,
  },
  {
    id: 1783398992971,
    nombre: 'River plate 98/99',
    precio: 70000,
    precioOferta: 59000,
    enOferta: true,
  },
];

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta MONGO_URI en server/.env');

  await mongoose.connect(uri, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 15000,
    bufferCommands: false,
  });

  const col = mongoose.connection.db.collection('productos');
  console.log(`=> Conectado a: ${mongoose.connection.name}\n`);

  for (const a of AJUSTES) {
    const actual = await col.findOne({ id: a.id }, { projection: { nombre: 1, precio: 1, precioOferta: 1, enOferta: 1 } });
    if (!actual) {
      console.log(`  ✗ No encontrado id=${a.id} (${a.nombre})`);
      continue;
    }

    await col.updateOne(
      { id: a.id },
      {
        $set: {
          precio: a.precio,
          precioOferta: a.precioOferta,
          enOferta: a.enOferta,
        },
      }
    );

    console.log(
      `  ✓ ${actual.nombre}\n` +
        `      ${actual.precio}` +
        (actual.precioOferta != null ? ` / oferta ${actual.precioOferta}` : '') +
        `  →  ${a.precio}` +
        (a.precioOferta != null ? ` / oferta ${a.precioOferta}` : '')
    );
  }

  console.log('\n=> Precios demo corregidos.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Error:', err.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});
