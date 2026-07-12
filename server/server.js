require('dotenv').config();

// Base de datos recomendada para MONGO_URI en .env: jerseys_store_db
// Ejemplo: mongodb+srv://usuario:contraseña@cluster.mongodb.net/jerseys_store_db

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET no está definido o tiene menos de 32 caracteres. El servidor no puede iniciarse de forma segura.');
  process.exit(1);
}

function logError(contexto, error, meta = {}) {
  const entrada = {
    timestamp: new Date().toISOString(),
    nivel: 'error',
    contexto,
    mensaje: error?.message || String(error),
    stack: error?.stack,
    ...meta,
  };
  console.error(JSON.stringify(entrada));
}

const MONGO_OPTIONS = {
  maxPoolSize: 5,
  minPoolSize: 1,
  serverSelectionTimeoutMS: 5000,
  bufferCommands: false,
};

let conexionDBPromise = null;
let inicializacionLocalCompleta = false;
const NOMBRE_TIENDA_DEFECTO = String(process.env.NOMBRE_TIENDA || 'Jerseys Store').trim();
const WHATSAPP_NUMERO = String(process.env.WHATSAPP_NUMERO || '').trim();
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_UPLOAD_PRESET = String(process.env.CLOUDINARY_UPLOAD_PRESET || '').trim();
const MP_ACCESS_TOKEN = String(process.env.MP_ACCESS_TOKEN || '').trim();
const MP_SANDBOX = String(process.env.MP_SANDBOX || 'true').toLowerCase() !== 'false';
const USE_NGROK = String(process.env.USE_NGROK || 'true').toLowerCase() === 'true';
const NGROK_AUTHTOKEN = String(process.env.NGROK_AUTHTOKEN || '').trim();

function resolverNgrokBin() {
  if (process.env.NGROK_BIN) {
    return String(process.env.NGROK_BIN).trim();
  }

  const candidatos = [
    path.join(process.env.APPDATA || '', 'npm', 'node_modules', 'ngrok', 'bin', 'ngrok.exe'),
    'ngrok',
  ];

  return candidatos.find((ruta) => ruta === 'ngrok' || fs.existsSync(ruta)) || 'ngrok';
}

const NGROK_BIN = resolverNgrokBin();
let APP_BASE_URL = String(process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
let WEBHOOK_BASE_URL = String(process.env.WEBHOOK_BASE_URL || APP_BASE_URL).replace(/\/$/, '');
const ZONA_HORARIA_TIENDA = 'America/Argentina/Buenos_Aires';

const mercadoPagoClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
const preferenceClient = new Preference(mercadoPagoClient);
const paymentClient = new Payment(mercadoPagoClient);
const ESTADOS_VENTA_VALIDA = [
  'Pendiente de pago',
  'Aprobado',
  'Preparación de pedido',
  'Enviado',
  'Entregado',
];
const ESTADOS_PEDIDO_ACTIVO = ['Pendiente de pago', 'pendiente_pago', 'Aprobado', 'Preparación de pedido'];

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.get('/favicon.ico', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.ico')));
app.get('/favicon.svg', (_req, res) => res.type('image/svg+xml').sendFile(path.join(PUBLIC_DIR, 'favicon.svg')));
app.get('/favicon.png', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'favicon.png')));

app.use(express.static(PUBLIC_DIR));

const productoItemPedidoSchema = new mongoose.Schema(
  {
    producto: { type: mongoose.Schema.Types.Mixed, required: true },
    cantidad: { type: Number, required: true },
    precio: { type: Number, required: true },
  },
  { _id: false }
);

const TALLES_DEFECTO = ['S', 'M', 'L', 'XL', 'XXL'];
const TALLES_PERMITIDOS = new Set(TALLES_DEFECTO);
const GENEROS_PERMITIDOS = ['hombre', 'mujer', 'ninos'];
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
const ESTADO_PEDIDO_INICIAL = 'Pendiente de pago';
const ESTADO_PEDIDO_MP_PENDIENTE = 'pendiente_pago';
const ESTADOS_PEDIDO_LEGACY = {
  Pendiente: 'Pendiente de pago',
  'En Preparación': 'Preparación de pedido',
  Listo: 'Entregado',
  pagado: 'Aprobado',
  confirmado: 'Aprobado',
};

const stockTallesSchema = new mongoose.Schema(
  {
    S: { type: Number, default: 0, min: 0 },
    M: { type: Number, default: 0, min: 0 },
    L: { type: Number, default: 0, min: 0 },
    XL: { type: Number, default: 0, min: 0 },
    XXL: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const productoSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  precioOferta: { type: Number, default: null },
  destacado: { type: Boolean, default: false },
  enOferta: { type: Boolean, default: false },
  categoria: { type: String, required: true },
  genero: {
    type: String,
    required: true,
    enum: GENEROS_PERMITIDOS,
    default: 'hombre',
  },
  imagenFrente: { type: String, default: '' },
  imagenEspalda: { type: String, default: '' },
  liga: { type: String, default: '' },
  stock: { type: Number, required: true, default: 10, min: 0 },
  stockTalles: { type: stockTallesSchema, default: () => ({ S: 0, M: 0, L: 0, XL: 0, XXL: 0 }) },
  activo: { type: Boolean, default: true },
  talles: { type: [String], default: () => [...TALLES_DEFECTO] },
  descripcion: { type: String, default: '' },
});

productoSchema.pre('save', function () {
  if (!this.id) {
    this.id = Date.now();
  }
});

productoSchema.index({ activo: 1, categoria: 1 });
productoSchema.index({ activo: 1, genero: 1 });
productoSchema.index({ activo: 1, destacado: 1 });
productoSchema.index({ activo: 1, enOferta: 1 });
productoSchema.index(
  { nombre: 'text', descripcion: 'text', liga: 'text' },
  { weights: { nombre: 10, descripcion: 1, liga: 5 } }
);

const pedidoSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  emailUsuario: { type: String, required: true, lowercase: true, trim: true, index: true },
  cliente: { type: String, required: true },
  telefono: { type: String, required: true },
  direccion: { type: String, default: '' },
  pago: { type: String, default: 'Efectivo' },
  productos: [productoItemPedidoSchema],
  total: { type: Number, default: 0 },
  estado: { type: String, default: ESTADO_PEDIDO_INICIAL },
  mercadopagoPreferenceId: { type: String, default: null },
  mercadopagoPaymentId: { type: String, default: null },
  expiraEn: { type: Date, default: null },
  fecha: { type: Date, default: Date.now },
});

pedidoSchema.index({ estado: 1, expiraEn: 1 });
pedidoSchema.index({ mercadopagoPreferenceId: 1 }, { sparse: true });
pedidoSchema.index({ emailUsuario: 1, fecha: -1 });

const usuarioSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  rol: { type: String, default: 'cliente' },
  verificado: { type: Boolean, default: false },
  codigoVerificacion: { type: String },
  codigoVerificacionExpira: { type: Date },
  nombre: { type: String, default: '', trim: true },
  telefono: { type: String, default: '', trim: true },
  direccion: { type: String, default: '', trim: true },
  preferencias: {
    emailsPromos: { type: Boolean, default: true },
    emailsPedidos: { type: Boolean, default: true },
  },
});

const mailTransport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const Producto = mongoose.model('Producto', productoSchema);
const Pedido = mongoose.model('Pedido', pedidoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);

const seccionSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  nombre: { type: String, required: true, unique: true, trim: true },
  escudo: { type: String, default: '', trim: true },
});

seccionSchema.pre('save', function () {
  if (!this.id) {
    this.id = Date.now();
  }
});

const Seccion = mongoose.model('Seccion', seccionSchema);

const configuracionSchema = new mongoose.Schema({
  nombreTienda: { type: String, default: 'Jerseys Store' },
  whatsappNumero: { type: String, default: '' },
  cloudinaryCloudName: { type: String, default: '' },
  cloudinaryUploadPreset: { type: String, default: '' },
  afipLink: { type: String, default: '' },
});

const Configuracion = mongoose.model('Configuracion', configuracionSchema);

const SECCIONES_BASE = [
  { id: 1, nombre: 'Remeras' },
  { id: 2, nombre: 'Camperas' },
  { id: 3, nombre: 'Pantalones' },
];

const PRODUCTOS_BASE = [
  {
    id: 1,
    nombre: 'Remera',
    precio: 8900,
    categoria: 'Remeras',
    genero: 'hombre',
    imagenFrente: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Remera+Frente',
    imagenEspalda: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Remera+Espalda',
    stock: 10,
    talles: [...TALLES_DEFECTO],
    descripcion: 'Remera de algodón premium.',
  },
  {
    id: 2,
    nombre: 'Campera',
    precio: 18900,
    categoria: 'Camperas',
    genero: 'hombre',
    imagenFrente: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Campera+Frente',
    imagenEspalda: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Campera+Espalda',
    stock: 10,
    talles: [...TALLES_DEFECTO],
    descripcion: 'Campera liviana de temporada.',
  },
  {
    id: 3,
    nombre: 'Pantalón',
    precio: 12800,
    categoria: 'Pantalones',
    genero: 'hombre',
    imagenFrente: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Pantalón+Frente',
    imagenEspalda: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Pantalón+Espalda',
    stock: 10,
    talles: [...TALLES_DEFECTO],
    descripcion: 'Pantalón de corte moderno.',
  },
];

function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generarIdPedido() {
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `#PED-${numero}`;
}

function normalizarEstadoPedido(estado) {
  const valor = String(estado || '').trim();
  if (ESTADOS_PEDIDO.includes(valor)) return valor;
  return ESTADOS_PEDIDO_LEGACY[valor] || ESTADO_PEDIDO_INICIAL;
}

function generarCodigoVerificacion() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generarExpiracionCodigo(minutos = 10) {
  return new Date(Date.now() + minutos * 60 * 1000);
}

async function verificarPassword(password, passwordAlmacenada) {
  if (!passwordAlmacenada) return false;

  const esHashBcrypt = /^\$2[aby]\$/.test(passwordAlmacenada);
  if (esHashBcrypt) {
    return bcrypt.compare(password, passwordAlmacenada);
  }

  return password === passwordAlmacenada;
}

function plantillaEmailVerificacion(codigo, nombreTienda) {
  const tienda = String(nombreTienda || NOMBRE_TIENDA_DEFECTO || 'Jerseys Store').trim();

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verificación de cuenta</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:#111827;padding:28px 32px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.5px;">${tienda}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h2 style="margin:0 0 12px;color:#111827;font-size:20px;">Verificá tu cuenta</h2>
              <p style="margin:0 0 24px;color:#4b5563;font-size:15px;line-height:1.6;">
                Usá el siguiente código para completar tu registro. El código vence en <strong>10 minutos</strong>.
              </p>
              <div style="text-align:center;margin:0 0 24px;">
                <span style="display:inline-block;padding:16px 32px;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">${codigo}</span>
              </div>
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;">
                Si no solicitaste este registro, podés ignorar este mensaje de forma segura.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">© ${tienda} — Mensaje automático, no responder.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function enviarCodigoVerificacion(email, codigo) {
  const config = await obtenerConfiguracionUnica();
  const nombreTienda = formatearConfiguracion(config).nombreTienda;

  await mailTransport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: `Tu código de verificación — ${nombreTienda}`,
    html: plantillaEmailVerificacion(codigo, nombreTienda),
    text: `Tu código de verificación en ${nombreTienda} es: ${codigo}. Vence en 10 minutos.`,
  });
}

function generarTokenAdmin(usuario) {
  return jwt.sign(
    { email: usuario.email, rol: usuario.rol },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function generarTokenCliente(usuario) {
  return jwt.sign(
    { email: usuario.email, rol: 'cliente' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function verificarJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere autenticación.' });
  }

  const token = authHeader.slice(7);

  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    logError('JWT_VERIFICACION', error, { ruta: req.path, metodo: req.method });
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Tu sesión expiró. Volvé a iniciar sesión.' });
    }
    return res.status(403).json({ error: 'Token inválido.' });
  }
}

function verificarClienteJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere autenticación.' });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const rol = payload?.rol;

    if (rol !== 'cliente' && rol !== 'admin') {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    req.usuario = payload;
    next();
  } catch (error) {
    logError('JWT_CLIENTE', error, { ruta: req.path, metodo: req.method });
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Tu sesión expiró. Volvé a iniciar sesión.' });
    }
    return res.status(403).json({ error: 'Token inválido.' });
  }
}

function esAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }

  next();
}

const verificarAdminJWT = [verificarJWT, esAdmin];

function sanitizarUsuario(usuario) {
  const datos = usuario.toObject ? usuario.toObject() : usuario;

  return {
    email: datos.email,
    rol: datos.rol,
    activo: datos.verificado,
    nombre: datos.nombre || '',
    telefono: datos.telefono || '',
    direccion: datos.direccion || '',
    preferencias: {
      emailsPromos: datos.preferencias?.emailsPromos !== false,
      emailsPedidos: datos.preferencias?.emailsPedidos !== false,
    },
  };
}

async function obtenerUsuarioCliente(email) {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return null;

  const usuario = await Usuario.findOne({ email: normalizado });
  if (!usuario || !usuario.verificado || usuario.rol === 'admin') return null;

  return usuario;
}

async function obtenerUsuarioVerificado(email) {
  const normalizado = normalizarEmail(email);
  if (!normalizado) return null;

  const usuario = await Usuario.findOne({ email: normalizado });
  if (!usuario || !usuario.verificado) return null;

  return usuario;
}

function normalizarStock(stock) {
  const valor = Number(stock);
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.floor(valor);
}

function obtenerObjetoStockTalles(stockTalles) {
  if (!stockTalles) return null;
  if (stockTalles instanceof Map) {
    return Object.fromEntries(stockTalles.entries());
  }
  if (typeof stockTalles.toObject === 'function') {
    return stockTalles.toObject();
  }
  if (typeof stockTalles === 'object') {
    return stockTalles;
  }
  return null;
}

function normalizarStockTalles(stockTalles, stockTotal = null, talles = null) {
  const base = { S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
  const origen = obtenerObjetoStockTalles(stockTalles);

  if (origen) {
    for (const talle of TALLES_DEFECTO) {
      base[talle] = normalizarStock(origen[talle] ?? origen[talle.toLowerCase()]);
    }
  }

  const sumaActual = TALLES_DEFECTO.reduce((acc, talle) => acc + base[talle], 0);
  if (sumaActual > 0) return base;

  if (stockTotal != null) {
    const tallesActivos = normalizarTalles(talles);
    const total = normalizarStock(stockTotal);
    if (tallesActivos.length === 1) {
      base[tallesActivos[0]] = total;
    } else if (tallesActivos.length > 1 && total > 0) {
      const porTalle = Math.floor(total / tallesActivos.length);
      let resto = total - porTalle * tallesActivos.length;
      for (const talle of tallesActivos) {
        base[talle] = porTalle + (resto > 0 ? 1 : 0);
        if (resto > 0) resto -= 1;
      }
    }
  }

  return base;
}

function sumarStockTalles(stockTalles) {
  const normalizado = normalizarStockTalles(stockTalles);
  return TALLES_DEFECTO.reduce((acc, talle) => acc + normalizarStock(normalizado[talle]), 0);
}

function tallesDesdeStockTalles(stockTalles) {
  const normalizado = normalizarStockTalles(stockTalles);
  const conStock = TALLES_DEFECTO.filter((talle) => normalizarStock(normalizado[talle]) > 0);
  return conStock.length ? conStock : [...TALLES_DEFECTO];
}

function normalizarTalles(talles) {
  if (!Array.isArray(talles)) return [...TALLES_DEFECTO];

  const normalizados = [...new Set(
    talles
      .map((talle) => String(talle).trim().toUpperCase())
      .filter((talle) => TALLES_PERMITIDOS.has(talle))
  )];

  return normalizados.length ? normalizados : [...TALLES_DEFECTO];
}

function parsearBooleano(valor, fallback = false) {
  if (typeof valor === 'boolean') return valor;
  if (valor === undefined || valor === null || valor === '') return fallback;
  if (typeof valor === 'number') return valor !== 0;
  const texto = String(valor).trim().toLowerCase();
  if (['true', '1', 'si', 'sí', 'yes', 'on'].includes(texto)) return true;
  if (['false', '0', 'no', 'off'].includes(texto)) return false;
  return fallback;
}

function resolverStockYTallesDesdeBody(body = {}, productoExistente = null) {
  const existente = productoExistente?.toObject
    ? productoExistente.toObject()
    : productoExistente || {};
  const tieneStockTallesEnBody =
    body.stockTalles !== undefined
    || body.stock_talles !== undefined
    || TALLES_DEFECTO.some((talle) => body[`stock_${talle}`] !== undefined || body[`stock${talle}`] !== undefined);

  let stockTalles;

  if (tieneStockTallesEnBody) {
    const desdeBody = body.stockTalles || body.stock_talles || {};
    const ensamblado = { ...normalizarStockTalles(existente.stockTalles) };

    for (const talle of TALLES_DEFECTO) {
      const valorDirecto =
        desdeBody[talle]
        ?? desdeBody[talle.toLowerCase()]
        ?? body[`stock_${talle}`]
        ?? body[`stock${talle}`];

      if (valorDirecto !== undefined) {
        ensamblado[talle] = normalizarStock(valorDirecto);
      }
    }

    stockTalles = normalizarStockTalles(ensamblado);
  } else if (body.stock !== undefined) {
    const talles = body.talles !== undefined
      ? normalizarTalles(parsearTallesDesdeBody(body.talles))
      : normalizarTalles(existente.talles);
    stockTalles = normalizarStockTalles(null, body.stock, talles);
  } else {
    stockTalles = normalizarStockTalles(
      existente.stockTalles,
      existente.stock,
      existente.talles
    );
  }

  const talles = body.talles !== undefined
    ? normalizarTalles(parsearTallesDesdeBody(body.talles))
    : tallesDesdeStockTalles(stockTalles);
  const stock = sumarStockTalles(stockTalles);

  return { stock, stockTalles, talles };
}

function normalizarGenero(genero) {
  const valor = String(genero || 'hombre').trim().toLowerCase();
  return GENEROS_PERMITIDOS.includes(valor) ? valor : 'hombre';
}

function normalizarPrecioOferta(precioOferta, precioBase) {
  const valor = Number(precioOferta);
  const base = Number(precioBase);

  if (!Number.isFinite(valor) || valor <= 0) return null;
  if (!Number.isFinite(base) || valor >= base) return null;

  return valor;
}

function normalizarImagenes(imagen) {
  if (Array.isArray(imagen)) {
    return imagen
      .flatMap((item) => normalizarImagenes(item))
      .filter(Boolean);
  }

  const texto = String(imagen || '').trim();
  if (!texto) return [];

  if (texto.includes(',http')) {
    return texto
      .split(/,(?=https?:\/\/)/)
      .map((url) => url.trim())
      .filter((url) => url.startsWith('http'));
  }

  return texto.startsWith('http') ? [texto] : [];
}

function resolverImagenesProducto(body = {}, productoExistente = null) {
  const datosExistentes = productoExistente?.toObject
    ? productoExistente.toObject()
    : productoExistente || {};

  let imagenFrente = String(body.imagenFrente || '').trim();
  let imagenEspalda = String(body.imagenEspalda || '').trim();

  if (!imagenFrente) {
    const legacy = normalizarImagenes(body.imagen || body.img || datosExistentes.img);
    imagenFrente = legacy[0] || String(datosExistentes.imagenFrente || '').trim();
    if (!imagenEspalda) {
      imagenEspalda = legacy[1] || String(datosExistentes.imagenEspalda || '').trim();
    }
  }

  if (!imagenFrente) {
    imagenFrente = String(datosExistentes.imagenFrente || '').trim();
  }

  if (!imagenEspalda) {
    imagenEspalda = String(datosExistentes.imagenEspalda || '').trim();
  }

  if (!imagenEspalda) {
    imagenEspalda = imagenFrente;
  }

  return { imagenFrente, imagenEspalda };
}

function obtenerImagenesDesdeDocumento(datos = {}) {
  const frenteDirecto = String(datos.imagenFrente || '').trim();
  const espaldaDirecta = String(datos.imagenEspalda || '').trim();
  const legacy = normalizarImagenes(datos.img);
  const imagenFrente = frenteDirecto || legacy[0] || '';
  const imagenEspalda = espaldaDirecta || legacy[1] || imagenFrente;

  return { imagenFrente, imagenEspalda };
}

function formatearSeccion(seccion) {
  const datos = seccion.toObject ? seccion.toObject() : seccion;

  return {
    id: datos.id,
    nombre: datos.nombre,
    escudo: String(datos.escudo || '').trim(),
  };
}

function formatearProducto(producto) {
  const datos = producto.toObject ? producto.toObject() : producto;
  const precioOferta = normalizarPrecioOferta(datos.precioOferta, datos.precio);
  const { imagenFrente, imagenEspalda } = obtenerImagenesDesdeDocumento(datos);
  const imagen = imagenEspalda && imagenEspalda !== imagenFrente
    ? [imagenFrente, imagenEspalda]
    : [imagenFrente].filter(Boolean);
  const stockTalles = normalizarStockTalles(datos.stockTalles, datos.stock, datos.talles);
  const stock = Math.max(normalizarStock(datos.stock ?? 0), sumarStockTalles(stockTalles));
  const destacado = Boolean(datos.destacado);
  const enOferta = Boolean(datos.enOferta);

  return {
    id: datos.id,
    nombre: datos.nombre,
    precio: datos.precio,
    precioOferta,
    precio_oferta: precioOferta,
    destacado,
    enOferta,
    en_oferta: enOferta,
    categoria: datos.categoria,
    genero: normalizarGenero(datos.genero),
    imagenFrente,
    imagenEspalda,
    imagen,
    stock,
    stockTalles,
    activo: datos.activo !== false,
    talles: normalizarTalles(datos.talles?.length ? datos.talles : tallesDesdeStockTalles(stockTalles)),
    descripcion: String(datos.descripcion || '').trim(),
    liga: String(datos.liga || '').trim(),
  };
}

function formatearItemPedido(item) {
  const producto = item.producto || {};

  return {
    id: producto.id,
    nombre: producto.nombre || producto,
    talle: producto.talle || null,
    precio: item.precio,
    imagen: normalizarImagenes(producto.imagen)[0]
      || String(producto.imagenFrente || '').trim()
      || obtenerImagenesDesdeDocumento(producto).imagenFrente,
    cantidad: item.cantidad,
  };
}

function formatearPedido(pedido) {
  const datos = pedido.toObject ? pedido.toObject() : pedido;

  return {
    id: datos.id,
    emailUsuario: normalizarEmail(datos.emailUsuario),
    cliente: {
      nombre: datos.cliente,
      telefono: datos.telefono,
      direccion: datos.direccion,
      email: normalizarEmail(datos.emailUsuario),
    },
    productos: (datos.productos || []).map(formatearItemPedido),
    total: datos.total,
    metodoPago: datos.pago,
    fecha: datos.fecha instanceof Date ? datos.fecha.toISOString() : datos.fecha,
    estado: normalizarEstadoPedido(datos.estado),
  };
}

function obtenerConfiguracionDesdeEnv() {
  return {
    nombreTienda: NOMBRE_TIENDA_DEFECTO || 'Jerseys Store',
    whatsappNumero: WHATSAPP_NUMERO.replace(/^\+/, ''),
    cloudinaryCloudName: CLOUDINARY_CLOUD_NAME,
    cloudinaryUploadPreset: CLOUDINARY_UPLOAD_PRESET,
  };
}

function formatearConfiguracion(config) {
  const datos = config?.toObject ? config.toObject() : config || {};

  return {
    nombreTienda: String(datos.nombreTienda || NOMBRE_TIENDA_DEFECTO || 'Jerseys Store').trim(),
    whatsappNumero: String(datos.whatsappNumero || '').replace(/^\+/, '').trim(),
    cloudinaryCloudName: String(datos.cloudinaryCloudName || '').trim(),
    cloudinaryUploadPreset: String(datos.cloudinaryUploadPreset || '').trim(),
    afipLink: String(datos.afipLink || '').trim(),
  };
}

async function obtenerConfiguracionUnica() {
  let config = await Configuracion.findOne();

  if (!config) {
    await inicializarConfiguracion();
    config = await Configuracion.findOne();
  }

  return config;
}

async function inicializarConfiguracion() {
  const total = await Configuracion.countDocuments();

  if (total > 0) {
    return;
  }

  await Configuracion.create(obtenerConfiguracionDesdeEnv());
  console.log('=> Éxito: Configuración inicial de la tienda creada desde .env.');
}

async function inicializarAdministrador() {
  const email = normalizarEmail(process.env.ADMIN_INICIAL_EMAIL);
  const password = String(process.env.ADMIN_INICIAL_PASS || '');
  const adminExistente = await Usuario.findOne({ rol: 'admin' });

  if (!email || !password) {
    if (adminExistente) {
      console.log(`=> Base de datos lista: Administrador verificado (${adminExistente.email}).`);
      return;
    }
    console.warn('=> Advertencia: No hay administrador y faltan ADMIN_INICIAL_EMAIL o ADMIN_INICIAL_PASS en .env.');
    return;
  }

  if (adminExistente) {
    const passwordCoincide = await verificarPassword(password, adminExistente.password);
    const emailCoincide = adminExistente.email === email;

    if (emailCoincide && passwordCoincide) {
      console.log(`=> Base de datos lista: Administrador verificado (${adminExistente.email}).`);
      return;
    }

    if (!emailCoincide) {
      const emailOcupado = await Usuario.findOne({
        email,
        _id: { $ne: adminExistente._id },
      });

      if (emailOcupado) {
        console.warn(
          `=> Advertencia: No se pudo actualizar el admin. El email ${email} ya está en uso por otra cuenta.`
        );
        return;
      }
    }

    adminExistente.email = email;
    adminExistente.password = await bcrypt.hash(password, 10);
    adminExistente.rol = 'admin';
    adminExistente.verificado = true;
    await adminExistente.save();

    console.log(`=> Éxito: Credenciales de administrador actualizadas desde .env (${email}).`);
    return;
  }

  const emailOcupado = await Usuario.findOne({ email });
  if (emailOcupado) {
    console.warn(
      `=> Advertencia: No se pudo crear el admin. El email ${email} ya está registrado como ${emailOcupado.rol}.`
    );
    return;
  }

  const passwordHasheada = await bcrypt.hash(password, 10);

  await new Usuario({
    email,
    password: passwordHasheada,
    rol: 'admin',
    verificado: true,
  }).save();

  console.log(`=> Éxito: Usuario administrador inicial creado de forma segura (${email}).`);
}

async function buscarProductoParaEliminar(idParam) {
  if (mongoose.isValidObjectId(idParam)) {
    return Producto.findByIdAndDelete(idParam);
  }

  return Producto.findOneAndDelete({ id: Number(idParam) });
}

async function buscarProductoParaActualizar(idParam, actualizacion) {
  if (mongoose.isValidObjectId(idParam)) {
    return Producto.findByIdAndUpdate(idParam, actualizacion, { new: true });
  }

  return Producto.findOneAndUpdate({ id: Number(idParam) }, actualizacion, { new: true });
}

async function buscarPedidoParaActualizar(idParam, actualizacion) {
  if (mongoose.isValidObjectId(idParam)) {
    return Pedido.findByIdAndUpdate(idParam, actualizacion, { new: true });
  }

  return Pedido.findOneAndUpdate({ id: idParam }, actualizacion, { new: true });
}

async function buscarProductoPorId(productoId) {
  const idParam = String(productoId ?? '').trim();
  if (!idParam) return null;

  if (mongoose.isValidObjectId(idParam)) {
    return Producto.findById(idParam);
  }

  const idNumerico = Number(idParam);
  if (Number.isFinite(idNumerico)) {
    return Producto.findOne({ id: idNumerico });
  }

  return null;
}

function obtenerPrecioEfectivoProducto(producto) {
  const precioOferta = normalizarPrecioOferta(producto.precioOferta, producto.precio);
  return precioOferta ?? Number(producto.precio);
}

async function revertirDecrementosStock(decrementos) {
  await Promise.all(
    decrementos.map(({ productoId, cantidad, talle }) => {
      const update = { $inc: { stock: cantidad } };
      if (talle && TALLES_PERMITIDOS.has(talle)) {
        update.$inc[`stockTalles.${talle}`] = cantidad;
      }
      return Producto.findByIdAndUpdate(productoId, update);
    })
  );
}

async function restaurarStockDesdePedido(pedido) {
  const decrementos = [];

  for (const item of pedido?.productos || []) {
    const productoId = item.producto?.id ?? item.producto;
    const producto = await buscarProductoPorId(productoId);
    if (!producto) continue;

    const talleRaw = item.producto?.talle ? String(item.producto.talle).trim().toUpperCase() : null;
    decrementos.push({
      productoId: String(producto._id),
      cantidad: Number(item.cantidad || 0),
      talle: talleRaw && TALLES_PERMITIDOS.has(talleRaw) ? talleRaw : null,
    });
  }

  await revertirDecrementosStock(decrementos);
}

async function limpiarPedidosExpirados() {
  const ahora = new Date();
  const pedidosExpirados = await Pedido.find({
    estado: ESTADO_PEDIDO_MP_PENDIENTE,
    expiraEn: { $ne: null, $lt: ahora },
  }).lean();

  if (!pedidosExpirados.length) {
    return 0;
  }

  const idsProducto = new Set();
  for (const pedido of pedidosExpirados) {
    for (const item of pedido.productos || []) {
      const productoId = item.producto?.id ?? item.producto;
      if (productoId != null) {
        idsProducto.add(String(productoId));
      }
    }
  }

  const objectIds = [];
  const numericIds = [];

  for (const id of idsProducto) {
    if (mongoose.isValidObjectId(id)) {
      objectIds.push(id);
    } else {
      const num = Number(id);
      if (Number.isFinite(num)) {
        numericIds.push(num);
      }
    }
  }

  const condiciones = [];
  if (objectIds.length) condiciones.push({ _id: { $in: objectIds } });
  if (numericIds.length) condiciones.push({ id: { $in: numericIds } });

  const productosEncontrados = condiciones.length
    ? await Producto.find({ $or: condiciones }).lean()
    : [];

  const productoPorClave = new Map();
  for (const producto of productosEncontrados) {
    productoPorClave.set(String(producto._id), producto);
    productoPorClave.set(String(producto.id), producto);
  }

  const incrementos = new Map();

  for (const pedido of pedidosExpirados) {
    for (const item of pedido.productos || []) {
      const productoId = item.producto?.id ?? item.producto;
      const producto = productoPorClave.get(String(productoId));
      if (!producto) continue;

      const clave = String(producto._id);
      incrementos.set(clave, (incrementos.get(clave) || 0) + Number(item.cantidad || 0));
    }
  }

  const operacionesProducto = [...incrementos.entries()].map(([productoId, cantidad]) => ({
    updateOne: {
      filter: { _id: productoId },
      update: { $inc: { stock: cantidad } },
    },
  }));

  const operacionesPedido = pedidosExpirados.map((pedido) => ({
    updateOne: {
      filter: { _id: pedido._id },
      update: { $set: { estado: 'cancelado' } },
    },
  }));

  if (operacionesProducto.length) {
    await Producto.bulkWrite(operacionesProducto);
  }

  if (operacionesPedido.length) {
    await Pedido.bulkWrite(operacionesPedido);
  }

  for (const pedido of pedidosExpirados) {
    console.log(`=> Pedido ${pedido.id} cancelado por expiración de pago (stock restaurado).`);
  }

  return pedidosExpirados.length;
}

async function validarItemsYReservarStock(items) {
  if (!Array.isArray(items) || !items.length) {
    return { error: 'Datos del pedido incompletos.', status: 400 };
  }

  const lineasValidadas = [];

  for (const item of items) {
    const productoId = item.productoId ?? item.id;
    const cantidad = Math.floor(Number(item.cantidad));
    const talle = item.talle ? String(item.talle).trim().toUpperCase() : null;

    if (!productoId || !Number.isFinite(cantidad) || cantidad <= 0) {
      return { error: 'Uno de los ítems del pedido es inválido.', status: 400 };
    }

    const producto = await buscarProductoPorId(productoId);

    if (!producto) {
      return { error: 'Uno de los productos del pedido ya no existe.', status: 400 };
    }

    if (producto.activo === false) {
      return {
        error: `«${producto.nombre}» ya no está disponible para la venta.`,
        status: 400,
      };
    }

    const tallesDisponibles = normalizarTalles(producto.talles);
    if (tallesDisponibles.length && (!talle || !tallesDisponibles.includes(talle))) {
      return {
        error: `Talle inválido para «${producto.nombre}». Talles disponibles: ${tallesDisponibles.join(', ')}.`,
        status: 400,
      };
    }

    const precioUnitario = obtenerPrecioEfectivoProducto(producto);
    if (!Number.isFinite(precioUnitario) || precioUnitario <= 0) {
      return { error: `Precio inválido para «${producto.nombre}».`, status: 400 };
    }

    lineasValidadas.push({
      producto,
      cantidad,
      talle,
      precioUnitario,
    });
  }

  const decrementosRealizados = [];

  for (const linea of lineasValidadas) {
    const productoIdStr = String(linea.producto._id);
    const cantidad = linea.cantidad;
    const talle = linea.talle;
    const filtro = {
      _id: productoIdStr,
      activo: { $ne: false },
      stock: { $gte: cantidad },
    };
    const update = { $inc: { stock: -cantidad } };

    if (talle && TALLES_PERMITIDOS.has(talle)) {
      const stockTallesActual = normalizarStockTalles(
        linea.producto.stockTalles,
        linea.producto.stock,
        linea.producto.talles
      );
      const usaStockPorTalle = TALLES_DEFECTO.some((t) => stockTallesActual[t] > 0);

      if (usaStockPorTalle) {
        filtro[`stockTalles.${talle}`] = { $gte: cantidad };
        update.$inc[`stockTalles.${talle}`] = -cantidad;
      }
    }

    const actualizado = await Producto.findOneAndUpdate(filtro, update, { new: true });

    if (!actualizado) {
      const productoActual = await Producto.findById(productoIdStr);
      const stockTallesActual = normalizarStockTalles(
        productoActual?.stockTalles,
        productoActual?.stock,
        productoActual?.talles
      );
      const disponible = talle && stockTallesActual[talle] > 0
        ? normalizarStock(stockTallesActual[talle])
        : normalizarStock(productoActual?.stock ?? 0);
      const nombreProducto = linea?.producto?.nombre || productoActual?.nombre || 'Producto';

      await revertirDecrementosStock(decrementosRealizados);

      return {
        error: `Stock insuficiente para «${nombreProducto}»${talle ? ` (talle ${talle})` : ''}. Disponible: ${disponible}, solicitado: ${cantidad}.`,
        status: 400,
      };
    }

    decrementosRealizados.push({
      productoId: productoIdStr,
      cantidad,
      talle: talle && TALLES_PERMITIDOS.has(talle) ? talle : null,
    });
  }

  const productosPedido = lineasValidadas.map(({ producto, cantidad, talle, precioUnitario }) => {
    const formateado = formatearProducto(producto);

    return {
      producto: {
        id: formateado.id,
        nombre: formateado.nombre,
        talle,
        imagen: formateado.imagenFrente || formateado.imagen[0] || '',
      },
      cantidad,
      precio: precioUnitario,
    };
  });

  const totalPedido = productosPedido.reduce(
    (acumulado, item) => acumulado + item.precio * item.cantidad,
    0
  );

  return {
    productosPedido,
    totalPedido,
    decrementosRealizados,
  };
}

function obtenerPaymentIdDesdeNotificacion(req) {
  const tipo = req.query?.type || req.query?.topic || req.body?.type || req.body?.topic;

  if (tipo !== 'payment') return null;

  const id = req.query?.['data.id']
    || req.query?.id
    || req.body?.data?.id;

  return id ? String(id) : null;
}

function obtenerInitPointMercadoPago(preferenceResponse) {
  const usarSandbox = MP_SANDBOX || MP_ACCESS_TOKEN.startsWith('TEST-');

  if (usarSandbox && preferenceResponse.sandbox_init_point) {
    return preferenceResponse.sandbox_init_point;
  }

  return preferenceResponse.init_point || preferenceResponse.sandbox_init_point;
}

function esUrlLocal(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  } catch {
    return true;
  }
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function obtenerUrlNgrokActiva() {
  const respuesta = await fetch('http://127.0.0.1:4040/api/tunnels');
  if (!respuesta.ok) return null;

  const datos = await respuesta.json();
  const tunel = (datos.tunnels || []).find((item) => item.public_url?.startsWith('https://'));
  return tunel?.public_url?.replace(/\/$/, '') || null;
}

async function iniciarTunelNgrok(puerto) {
  if (!NGROK_AUTHTOKEN) {
    throw new Error('Falta NGROK_AUTHTOKEN en .env');
  }

  let urlPublica = null;

  try {
    urlPublica = await obtenerUrlNgrokActiva();
  } catch {
    // ngrok aún no está levantado
  }

  if (!urlPublica) {
    await new Promise((resolve, reject) => {
      const proceso = spawn(NGROK_BIN, ['http', String(puerto), `--authtoken=${NGROK_AUTHTOKEN}`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });

      proceso.once('error', reject);
      proceso.unref();
      proceso.once('spawn', resolve);
    });

    for (let intento = 0; intento < 40; intento += 1) {
      await esperar(500);
      try {
        urlPublica = await obtenerUrlNgrokActiva();
        if (urlPublica) break;
      } catch {
        // seguir esperando
      }
    }
  }

  if (!urlPublica) {
    throw new Error('No se pudo obtener la URL pública de ngrok');
  }

  return urlPublica;
}

async function resolverCategoriaProducto(categoriaRaw) {
  const valor = String(categoriaRaw || '').trim();
  if (!valor) return null;

  if (/^\d+$/.test(valor)) {
    const seccion = await Seccion.findOne({ id: Number(valor) });
    if (seccion) return seccion.nombre;
  }

  const seccionPorNombre = await Seccion.findOne({
    nombre: { $regex: new RegExp(`^${valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });
  if (seccionPorNombre) return seccionPorNombre.nombre;

  return valor;
}

function parsearTallesDesdeBody(talles) {
  if (typeof talles === 'string') return [talles];
  return talles;
}

function obtenerClaveFechaLocal(fecha = new Date()) {
  return fecha.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA_TIENDA });
}

function construirVentasUltimos7Dias(ventasAgregadas) {
  const totalesPorDia = new Map(
    ventasAgregadas.map((item) => [String(item._id), Number(item.total) || 0])
  );
  const resultado = [];
  const hoy = new Date();

  for (let i = 6; i >= 0; i -= 1) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - i);
    const clave = obtenerClaveFechaLocal(fecha);

    resultado.push({
      fecha: clave,
      total: totalesPorDia.get(clave) || 0,
    });
  }

  return resultado;
}

async function ejecutarInicializacionLocal() {
  if (inicializacionLocalCompleta || process.env.VERCEL) {
    return;
  }

  inicializacionLocalCompleta = true;
  await inicializarAdministrador();
  await inicializarConfiguracion();
}

async function asegurarConexionDB() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!conexionDBPromise) {
    conexionDBPromise = mongoose
      .connect(process.env.MONGO_URI, MONGO_OPTIONS)
      .then(async () => {
        if (!process.env.VERCEL) {
          await ejecutarInicializacionLocal();
        }
      })
      .catch((error) => {
        conexionDBPromise = null;
        throw error;
      });
  }

  return conexionDBPromise;
}

app.use('/api', async (req, res, next) => {
  try {
    await asegurarConexionDB();
    next();
  } catch (error) {
    logError('MONGODB_CONEXION', error, { ruta: req.path, metodo: req.method });
    res.status(503).json({ error: 'Servicio no disponible.' });
  }
});

// ── Configuración pública ──

app.get('/api/config', async (_req, res) => {
  try {
    const config = await obtenerConfiguracionUnica();
    res.json(formatearConfiguracion(config));
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/config', verificarJWT, esAdmin, async (req, res) => {
  try {
    const nombreTienda = String(req.body?.nombreTienda || '').trim();
    const whatsappNumero = String(req.body?.whatsappNumero || '').replace(/^\+/, '').trim();
    const cloudinaryCloudName = String(req.body?.cloudinaryCloudName || '').trim();
    const cloudinaryUploadPreset = String(req.body?.cloudinaryUploadPreset || '').trim();
    const afipLink = String(req.body?.afipLink || '').trim();

    if (!nombreTienda) {
      return res.status(400).json({ error: 'El nombre de la tienda es obligatorio.' });
    }

    if (!whatsappNumero) {
      return res.status(400).json({ error: 'El número de WhatsApp es obligatorio.' });
    }

    let config = await Configuracion.findOne();

    if (!config) {
      config = new Configuracion();
    }

    config.nombreTienda = nombreTienda;
    config.whatsappNumero = whatsappNumero;
    config.cloudinaryCloudName = cloudinaryCloudName;
    config.cloudinaryUploadPreset = cloudinaryUploadPreset;
    config.afipLink = afipLink;
    await config.save();

    res.json({
      ok: true,
      mensaje: 'Configuración actualizada correctamente.',
      ...formatearConfiguracion(config),
    });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── Secciones ──

app.get('/api/secciones', async (_req, res) => {
  try {
    let secciones = await Seccion.find().sort({ id: 1 });

    if (secciones.length === 0) {
      secciones = await Seccion.insertMany(SECCIONES_BASE);
    }

    res.json(secciones.map(formatearSeccion));
  } catch (error) {
    console.error('Error al obtener secciones:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/secciones', verificarAdminJWT, async (req, res) => {
  try {
    const nombreLimpio = String(req.body?.nombre || '').trim();
    const escudo = String(req.body?.escudo || '').trim();

    if (!nombreLimpio) {
      return res.status(400).json({ error: 'El nombre de la sección es obligatorio.' });
    }

    const existe = await Seccion.findOne({
      nombre: { $regex: new RegExp(`^${nombreLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existe) {
      return res.status(400).json({ error: 'Ya existe una sección con ese nombre.' });
    }

    const nuevaSeccion = await new Seccion({ nombre: nombreLimpio, escudo }).save();
    res.status(201).json(formatearSeccion(nuevaSeccion));
  } catch (error) {
    console.error('Error al crear sección:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/secciones/:id', verificarAdminJWT, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombreLimpio = String(req.body?.nombre || '').trim();
    const escudoEnviado = req.body?.escudo;
    const escudo =
      escudoEnviado === undefined ? undefined : String(escudoEnviado || '').trim();

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID de sección inválido.' });
    }

    if (!nombreLimpio) {
      return res.status(400).json({ error: 'El nombre de la sección es obligatorio.' });
    }

    const seccion = await Seccion.findOne({ id });

    if (!seccion) {
      return res.status(404).json({ error: 'Sección no encontrada.' });
    }

    const nombreAnterior = seccion.nombre;
    const actualizacion = { nombre: nombreLimpio };

    if (escudo !== undefined) {
      actualizacion.escudo = escudo;
    }

    if (nombreAnterior.toLowerCase() === nombreLimpio.toLowerCase()) {
      if (nombreAnterior !== nombreLimpio || escudo !== undefined) {
        seccion.nombre = nombreLimpio;
        if (escudo !== undefined) seccion.escudo = escudo;
        await seccion.save();
        if (nombreAnterior !== nombreLimpio) {
          await Producto.updateMany(
            { categoria: nombreAnterior },
            { $set: { categoria: nombreLimpio } }
          );
        }
      }

      return res.json(formatearSeccion(seccion));
    }

    const existe = await Seccion.findOne({
      id: { $ne: id },
      nombre: { $regex: new RegExp(`^${nombreLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existe) {
      return res.status(400).json({ error: 'Ya existe una sección con ese nombre.' });
    }

    const actualizada = await Seccion.findOneAndUpdate(
      { id },
      actualizacion,
      { new: true, runValidators: true }
    );

    await Producto.updateMany(
      { categoria: nombreAnterior },
      { $set: { categoria: nombreLimpio } }
    );

    res.json(formatearSeccion(actualizada));
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una sección con ese nombre.' });
    }

    console.error('Error al actualizar sección:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/secciones/:id', verificarAdminJWT, async (req, res) => {
  try {
    const eliminada = await Seccion.findOneAndDelete({ id: Number(req.params.id) });

    if (!eliminada) {
      return res.status(404).json({ error: 'Sección no encontrada.' });
    }

    res.json(formatearSeccion(eliminada));
  } catch (error) {
    console.error('Error al eliminar sección:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── Productos ──

app.get('/api/productos', async (req, res) => {
  try {
    const incluirInactivos = req.query.todos === 'true';
    const filtro = incluirInactivos ? {} : { activo: { $ne: false } };

    if (parsearBooleano(req.query.destacado, null) === true) {
      filtro.destacado = true;
    }

    if (
      parsearBooleano(req.query.enOferta, null) === true
      || parsearBooleano(req.query.en_oferta, null) === true
    ) {
      filtro.enOferta = true;
    }

    let productos = await Producto.find(filtro);

    if (productos.length === 0 && incluirInactivos) {
      const total = await Producto.countDocuments();
      if (total === 0) {
        productos = await Producto.insertMany(PRODUCTOS_BASE);
      }
    } else if (productos.length === 0 && !incluirInactivos) {
      const total = await Producto.countDocuments();
      if (total === 0) {
        productos = await Producto.insertMany(PRODUCTOS_BASE);
      } else {
        productos = await Producto.find(filtro);
      }
    }

    res.json(productos.map(formatearProducto));
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/productos/buscar', async (req, res) => {
  try {
    const consulta = String(req.query.q || '').trim();

    if (consulta.length < 2) {
      return res.json([]);
    }

    const productos = await Producto.find({
      activo: { $ne: false },
      $text: { $search: consulta },
    })
      .select('id nombre precio precioOferta imagenFrente imagenEspalda img')
      .sort({ score: { $meta: 'textScore' } })
      .limit(5);

    res.json(
      productos.map((producto) => {
        const { imagenFrente } = obtenerImagenesDesdeDocumento(
          producto.toObject ? producto.toObject() : producto
        );

        return {
          id: producto.id,
          nombre: producto.nombre,
          precio: producto.precio,
          precioOferta: normalizarPrecioOferta(producto.precioOferta, producto.precio),
          imagenFrente,
        };
      })
    );
  } catch (error) {
    console.error('Error en búsqueda predictiva de productos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/productos/actualizar-precios-masivo', verificarAdminJWT, async (req, res) => {
  try {
    const porcentaje = Number(req.body?.porcentaje);
    const categoriaRaw = req.body?.categoria;

    if (!Number.isFinite(porcentaje) || porcentaje === 0) {
      return res.status(400).json({ error: 'El porcentaje debe ser un número distinto de cero.' });
    }

    const factor = 1 + porcentaje / 100;
    const filtro = {};

    if (categoriaRaw !== undefined && categoriaRaw !== null && String(categoriaRaw).trim() !== '') {
      const categoriaNombre = await resolverCategoriaProducto(categoriaRaw);
      if (!categoriaNombre) {
        return res.status(400).json({ error: 'La categoría indicada no es válida.' });
      }
      filtro.categoria = categoriaNombre;
    }

    const productos = await Producto.find(filtro);

    if (!productos.length) {
      return res.status(404).json({ error: 'No hay productos para actualizar con los criterios indicados.' });
    }

    await Promise.all(
      productos.map(async (producto) => {
        const precioBase = Number(producto.precio);
        const nuevoPrecio = Math.max(1, Math.round(precioBase * factor));
        const ofertaActual = Number(producto.precioOferta);

        producto.precio = nuevoPrecio;

        if (Number.isFinite(ofertaActual) && ofertaActual > 0) {
          producto.precioOferta = normalizarPrecioOferta(
            Math.max(1, Math.round(ofertaActual * factor)),
            nuevoPrecio
          );
        } else {
          producto.precioOferta = null;
        }

        return producto.save();
      })
    );

    const productosActualizados = await Producto.find(
      { id: { $in: productos.map((producto) => producto.id) } }
    );

    res.json({
      ok: true,
      actualizados: productosActualizados.length,
      porcentaje,
      productos: productosActualizados.map(formatearProducto),
    });
  } catch (error) {
    console.error('Error en actualización masiva de precios:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/productos/quitar-ofertas-masivo', verificarAdminJWT, async (req, res) => {
  try {
    const categoriaRaw = req.body?.categoria;
    const filtro = { precioOferta: { $ne: null } };

    if (categoriaRaw !== undefined && categoriaRaw !== null && String(categoriaRaw).trim() !== '') {
      const categoriaNombre = await resolverCategoriaProducto(categoriaRaw);
      if (!categoriaNombre) {
        return res.status(400).json({ error: 'La categoría indicada no es válida.' });
      }
      filtro.categoria = categoriaNombre;
    }

    const productos = await Producto.find(filtro);

    if (!productos.length) {
      return res.status(404).json({ error: 'No hay productos con descuento de oferta en los criterios indicados.' });
    }

    await Producto.updateMany(
      { id: { $in: productos.map((producto) => producto.id) } },
      { $set: { precioOferta: null } }
    );

    const productosActualizados = await Producto.find(
      { id: { $in: productos.map((producto) => producto.id) } }
    );

    res.json({
      ok: true,
      actualizados: productosActualizados.length,
      productos: productosActualizados.map(formatearProducto),
    });
  } catch (error) {
    console.error('Error al quitar ofertas masivamente:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.patch('/api/productos/:id/activo', verificarAdminJWT, async (req, res) => {
  try {
    const activo = req.body?.activo;

    if (typeof activo !== 'boolean') {
      return res.status(400).json({ error: 'El campo activo debe ser true o false.' });
    }

    const actualizado = await buscarProductoParaActualizar(req.params.id, { activo });

    if (!actualizado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(formatearProducto(actualizado));
  } catch (error) {
    console.error('Error al cambiar estado activo del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.patch('/api/productos/:id/portada', verificarAdminJWT, async (req, res) => {
  try {
    const actualizacion = {};

    if (req.body?.destacado !== undefined) {
      actualizacion.destacado = parsearBooleano(req.body.destacado);
    }

    if (req.body?.enOferta !== undefined || req.body?.en_oferta !== undefined) {
      actualizacion.enOferta = parsearBooleano(
        req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
      );
    }

    if (!Object.keys(actualizacion).length) {
      return res.status(400).json({
        error: 'Indicá al menos un campo de portada: destacado o enOferta.',
      });
    }

    const actualizado = await buscarProductoParaActualizar(req.params.id, actualizacion);

    if (!actualizado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(formatearProducto(actualizado));
  } catch (error) {
    console.error('Error al actualizar portada del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/productos', verificarAdminJWT, async (req, res) => {
  try {
    const { nombre, precio, precioOferta, precio_oferta, categoria, genero, descripcion } = req.body;
    const { imagenFrente, imagenEspalda } = resolverImagenesProducto(req.body);
    const categoriaNombre = await resolverCategoriaProducto(categoria);
    const { stock, stockTalles, talles } = resolverStockYTallesDesdeBody(req.body);

    if (!nombre || !categoriaNombre || !imagenFrente || !precio || Number(precio) <= 0) {
      return res.status(400).json({ error: 'Datos de producto incompletos o inválidos.' });
    }

    const precioNumerico = Number(precio);
    const ofertaRaw = precioOferta !== undefined ? precioOferta : precio_oferta;

    const nuevoProducto = await new Producto({
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: normalizarPrecioOferta(ofertaRaw, precioNumerico),
      destacado: parsearBooleano(req.body.destacado),
      enOferta: parsearBooleano(
        req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
      ),
      categoria: categoriaNombre,
      genero: normalizarGenero(genero),
      imagenFrente,
      imagenEspalda,
      stock,
      stockTalles,
      talles,
      descripcion: String(descripcion || '').trim(),
    }).save();

    res.status(201).json(formatearProducto(nuevoProducto));
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/productos/:id', verificarAdminJWT, async (req, res) => {
  try {
    const { nombre, precio, precioOferta, precio_oferta, categoria, genero, descripcion } = req.body;
    const productoExistente = await buscarProductoPorId(req.params.id);
    const { imagenFrente, imagenEspalda } = resolverImagenesProducto(req.body, productoExistente);
    const categoriaNombre = await resolverCategoriaProducto(categoria);
    const { stock, stockTalles, talles } = resolverStockYTallesDesdeBody(req.body, productoExistente);

    if (!nombre || !categoriaNombre || !imagenFrente || !precio || Number(precio) <= 0) {
      return res.status(400).json({ error: 'Datos de producto incompletos o inválidos.' });
    }

    const precioNumerico = Number(precio);
    const ofertaRaw = precioOferta !== undefined ? precioOferta : precio_oferta;
    const actualizacion = {
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: normalizarPrecioOferta(ofertaRaw, precioNumerico),
      categoria: categoriaNombre,
      genero: normalizarGenero(genero),
      imagenFrente,
      imagenEspalda,
      stock,
      stockTalles,
      talles,
      descripcion: String(descripcion || '').trim(),
    };

    if (req.body.destacado !== undefined) {
      actualizacion.destacado = parsearBooleano(req.body.destacado);
    }

    if (req.body.enOferta !== undefined || req.body.en_oferta !== undefined) {
      actualizacion.enOferta = parsearBooleano(
        req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
      );
    }

    const actualizado = await buscarProductoParaActualizar(req.params.id, actualizacion);

    if (!actualizado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(formatearProducto(actualizado));
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/productos/:id', verificarAdminJWT, async (req, res) => {
  try {
    const eliminado = await buscarProductoParaEliminar(req.params.id);

    if (!eliminado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(formatearProducto(eliminado));
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── Pedidos ──

app.get('/api/pedidos', verificarAdminJWT, async (_req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ fecha: -1 });
    res.json(pedidos.map(formatearPedido));
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/pedidos/mios', verificarClienteJWT, async (req, res) => {
  try {
    const email = normalizarEmail(req.usuario.email);

    const usuario = await obtenerUsuarioVerificado(email);
    if (!usuario) {
      return res.status(403).json({ error: 'Cuenta no válida o no verificada.' });
    }

    const pedidos = await Pedido.find({ emailUsuario: email }).sort({ fecha: -1 });
    res.json(pedidos.map(formatearPedido));
  } catch (error) {
    console.error('Error al obtener pedidos del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/pedidos', verificarClienteJWT, async (req, res) => {
  try {
    const { cliente, items, metodoPago } = req.body;
    const email = normalizarEmail(req.usuario.email);

    const usuario = await obtenerUsuarioVerificado(email);
    if (!usuario) {
      return res.status(403).json({ error: 'Tu cuenta no está verificada. Iniciá sesión para comprar.' });
    }

    if (!cliente?.nombre || !cliente?.telefono) {
      return res.status(400).json({ error: 'Datos del pedido incompletos.' });
    }

    const resultadoItems = await validarItemsYReservarStock(items);
    if (resultadoItems.error) {
      return res.status(resultadoItems.status).json({ error: resultadoItems.error });
    }

    const { productosPedido, totalPedido, decrementosRealizados } = resultadoItems;

    let nuevoPedido;

    try {
      nuevoPedido = await new Pedido({
        id: generarIdPedido(),
        emailUsuario: email,
        cliente: String(cliente.nombre).trim(),
        telefono: String(cliente.telefono).trim(),
        direccion: String(cliente.direccion || '').trim(),
        pago: metodoPago || 'Efectivo',
        productos: productosPedido,
        total: totalPedido,
        estado: ESTADO_PEDIDO_INICIAL,
        fecha: new Date(),
      }).save();
    } catch (saveError) {
      await revertirDecrementosStock(decrementosRealizados);
      throw saveError;
    }

    res.status(201).json(formatearPedido(nuevoPedido));
  } catch (error) {
    logError('CREAR_PEDIDO', error, {
      emailUsuario: normalizarEmail(req.usuario?.email),
    });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/pagar', verificarClienteJWT, async (req, res) => {
  try {
    if (!MP_ACCESS_TOKEN) {
      return res.status(503).json({ error: 'Mercado Pago no está configurado. Contactá a la tienda.' });
    }

    const { cliente, items } = req.body;
    const email = normalizarEmail(req.usuario.email);

    const usuario = await obtenerUsuarioVerificado(email);
    if (!usuario) {
      return res.status(403).json({ error: 'Tu cuenta no está verificada. Iniciá sesión para comprar.' });
    }

    if (!cliente?.nombre || !cliente?.telefono) {
      return res.status(400).json({ error: 'Datos del pedido incompletos.' });
    }

    const resultadoItems = await validarItemsYReservarStock(items);
    if (resultadoItems.error) {
      return res.status(resultadoItems.status).json({ error: resultadoItems.error });
    }

    const { productosPedido, totalPedido, decrementosRealizados } = resultadoItems;
    const pedidoId = generarIdPedido();
    const nombreCliente = String(cliente.nombre).trim();
    const partesNombre = nombreCliente.split(/\s+/).filter(Boolean);
    const payerName = partesNombre[0] || nombreCliente;
    const payerSurname = partesNombre.slice(1).join(' ') || 'Cliente';

    const itemsMercadoPago = productosPedido.map((item) => ({
      title: item.producto.talle
        ? `${item.producto.nombre} — Talle ${item.producto.talle}`
        : item.producto.nombre,
      quantity: item.cantidad,
      unit_price: item.precio,
      currency_id: 'ARS',
    }));

    const preferenceBody = {
      items: itemsMercadoPago,
      payer: {
        email,
        name: payerName,
        surname: payerSurname,
      },
      back_urls: {
        success: `${APP_BASE_URL}/pago-exitoso.html`,
        failure: `${APP_BASE_URL}/pago-fallido.html`,
        pending: `${APP_BASE_URL}/pago-pendiente.html`,
      },
      external_reference: pedidoId,
    };

    // auto_return en sandbox/ngrok suele provocar bucles de redirección (ERR_TOO_MANY_REDIRECTS).
    // Solo habilitarlo en producción con dominio propio estable.
    const puedeUsarAutoReturn = !esUrlLocal(APP_BASE_URL) && !MP_SANDBOX;
    if (puedeUsarAutoReturn) {
      preferenceBody.auto_return = 'approved';
    }

    // En local, Mercado Pago no puede alcanzar localhost: exponé el backend con ngrok
    // (ej. ngrok http 3000) y definí WEBHOOK_BASE_URL en .env.
    if (!esUrlLocal(WEBHOOK_BASE_URL)) {
      preferenceBody.notification_url = `${WEBHOOK_BASE_URL}/api/webhooks/mercadopago`;
    }

    let preferenceResponse;

    try {
      preferenceResponse = await preferenceClient.create({ body: preferenceBody });
    } catch (mpError) {
      await revertirDecrementosStock(decrementosRealizados);
      logError('CREAR_PEDIDO_MP_PREFERENCE', mpError, {
        emailUsuario: email,
        pedidoId,
      });
      return res.status(502).json({ error: 'No se pudo iniciar el pago con Mercado Pago. Intentá nuevamente.' });
    }

    const initPoint = obtenerInitPointMercadoPago(preferenceResponse);

    if (!initPoint || !preferenceResponse.id) {
      await revertirDecrementosStock(decrementosRealizados);
      return res.status(502).json({ error: 'Mercado Pago no devolvió una URL de pago válida.' });
    }

    try {
      await new Pedido({
        id: pedidoId,
        emailUsuario: email,
        cliente: nombreCliente,
        telefono: String(cliente.telefono).trim(),
        direccion: String(cliente.direccion || '').trim(),
        pago: 'Mercado Pago',
        productos: productosPedido,
        total: totalPedido,
        estado: ESTADO_PEDIDO_MP_PENDIENTE,
        mercadopagoPreferenceId: String(preferenceResponse.id),
        expiraEn: new Date(Date.now() + 30 * 60 * 1000),
        fecha: new Date(),
      }).save();
    } catch (saveError) {
      await revertirDecrementosStock(decrementosRealizados);
      throw saveError;
    }

    res.status(201).json({
      ok: true,
      pedidoId,
      preferenceId: preferenceResponse.id,
      init_point: initPoint,
    });
  } catch (error) {
    logError('CREAR_PEDIDO_MP', error, {
      emailUsuario: normalizarEmail(req.usuario?.email),
    });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/webhooks/mercadopago', manejarWebhookMercadoPago);
app.get('/api/webhooks/mercadopago', manejarWebhookMercadoPago);

async function manejarWebhookMercadoPago(req, res) {
  try {
    const paymentId = obtenerPaymentIdDesdeNotificacion(req);

    if (!paymentId) {
      return res.sendStatus(200);
    }

    if (!MP_ACCESS_TOKEN) {
      console.warn('Webhook de Mercado Pago recibido sin MP_ACCESS_TOKEN configurado.');
      return res.sendStatus(200);
    }

    let paymentData;

    try {
      paymentData = await paymentClient.get({ id: paymentId });
    } catch (mpError) {
      logError('WEBHOOK_MP_CONSULTA', mpError, { paymentId });
      return res.sendStatus(200);
    }

    const estadoPago = String(paymentData?.status || '').toLowerCase();
    const preferenceId = paymentData?.preference_id
      ? String(paymentData.preference_id)
      : null;
    const externalReference = paymentData?.external_reference
      ? String(paymentData.external_reference)
      : null;

    let pedido = null;

    if (preferenceId) {
      pedido = await Pedido.findOne({ mercadopagoPreferenceId: preferenceId });
    }

    if (!pedido && externalReference) {
      pedido = await Pedido.findOne({ id: externalReference });
    }

    if (!pedido) {
      console.warn(`Webhook MP: pedido no encontrado (payment ${paymentId}).`);
      return res.sendStatus(200);
    }

    if (pedido.estado === 'Aprobado' || pedido.estado === 'cancelado') {
      return res.sendStatus(200);
    }

    if (estadoPago === 'approved') {
      const montoPagado = Number(paymentData.transaction_amount);
      const montoPedido = Number(pedido.total);

      if (!Number.isFinite(montoPagado) || Math.abs(montoPagado - montoPedido) > 0.01) {
        logError('WEBHOOK_MP_FRAUDE_MONTO', new Error('Monto de pago no coincide con el pedido'), {
          pedidoId: pedido.id,
          paymentId,
          montoPagado,
          montoPedido,
          emailUsuario: pedido.emailUsuario,
        });
        return res.sendStatus(200);
      }

      pedido.estado = 'Aprobado';
      pedido.mercadopagoPaymentId = paymentId;
      await pedido.save();
      return res.sendStatus(200);
    }

    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(estadoPago)) {
      await restaurarStockDesdePedido(pedido);
      pedido.estado = 'cancelado';
      pedido.mercadopagoPaymentId = paymentId;
      await pedido.save();
      return res.sendStatus(200);
    }

    return res.sendStatus(200);
  } catch (error) {
    logError('WEBHOOK_MP', error, {
      paymentId: obtenerPaymentIdDesdeNotificacion(req),
    });
    return res.sendStatus(200);
  }
}

// ── Cron externo (cron-job.org) ──

app.get('/api/cron/limpiar-stock', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  try {
    const pedidosLimpiados = await limpiarPedidosExpirados();

    return res.status(200).json({
      ok: true,
      mensaje: 'Limpieza de stock completada correctamente.',
      pedidosLimpiados,
    });
  } catch (error) {
    console.error('Error en cron limpiar-stock:', error);
    return res.status(500).json({ error: 'Error al ejecutar la limpieza de pedidos expirados.' });
  }
});

// ── Estadísticas del administrador ──

app.get('/api/admin/stats', verificarAdminJWT, async (_req, res) => {
  try {
    const inicioSemana = new Date();
    inicioSemana.setHours(0, 0, 0, 0);
    inicioSemana.setDate(inicioSemana.getDate() - 6);

    const [facturacionHistorica, pedidosActivos, ventasPorDia] = await Promise.all([
      Pedido.aggregate([
        { $match: { estado: { $in: ESTADOS_VENTA_VALIDA } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      Pedido.countDocuments({ estado: { $in: ESTADOS_PEDIDO_ACTIVO } }),
      Pedido.aggregate([
        {
          $match: {
            fecha: { $gte: inicioSemana },
            estado: { $in: ESTADOS_VENTA_VALIDA },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$fecha',
                timezone: ZONA_HORARIA_TIENDA,
              },
            },
            total: { $sum: '$total' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      totalFacturado: facturacionHistorica[0]?.total || 0,
      pedidosActivos,
      ventasUltimos7Dias: construirVentasUltimos7Dias(ventasPorDia),
    });
  } catch (error) {
    console.error('Error al obtener estadísticas del administrador:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/pedidos/cambiar-estado', verificarAdminJWT, async (req, res) => {
  try {
    const { id, nuevoEstado } = req.body;

    if (!id || !nuevoEstado) {
      return res.status(400).json({ error: 'ID y nuevo estado son requeridos.' });
    }

    const estadoEntrada = String(nuevoEstado).trim();
    const estadoNormalizado = normalizarEstadoPedido(estadoEntrada);

    if (!ESTADOS_PEDIDO.includes(estadoEntrada) && !ESTADOS_PEDIDO_LEGACY[estadoEntrada]) {
      return res.status(400).json({
        error: `Estado inválido. Usá uno de: ${ESTADOS_PEDIDO.join(', ')}.`,
      });
    }

    const pedido = await buscarPedidoParaActualizar(id, { estado: estadoNormalizado });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    res.json({ ok: true, pedido: formatearPedido(pedido) });
  } catch (error) {
    console.error('Error al cambiar estado del pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ── Contacto ──

app.post('/api/contacto', async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const email = normalizarEmail(req.body?.email);
    const mensaje = String(req.body?.mensaje || '').trim();

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios.' });
    }

    const adminEmail = normalizarEmail(process.env.ADMIN_INICIAL_EMAIL);

    if (!adminEmail) {
      return res.status(503).json({ error: 'El formulario de contacto no está disponible en este momento.' });
    }

    const asunto = '📩 Nuevo mensaje de contacto - Jerseys Store';
    const cuerpoTexto = [
      'Nuevo mensaje de contacto desde la tienda.',
      '',
      `Nombre: ${nombre}`,
      `Correo: ${email}`,
      '',
      'Mensaje:',
      mensaje,
    ].join('\n');

    const cuerpoHtml = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.6;">
        <h2 style="margin:0 0 16px;color:#111827;">Nuevo mensaje de contacto</h2>
        <p style="margin:0 0 8px;"><strong>Nombre:</strong> ${nombre}</p>
        <p style="margin:0 0 8px;"><strong>Correo:</strong> <a href="mailto:${email}">${email}</a></p>
        <p style="margin:16px 0 8px;"><strong>Mensaje:</strong></p>
        <p style="margin:0;padding:12px 16px;background:#f3f4f6;border-radius:8px;white-space:pre-wrap;">${mensaje.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
      </div>
    `;

    await mailTransport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: adminEmail,
      replyTo: email,
      subject: asunto,
      text: cuerpoTexto,
      html: cuerpoHtml,
    });

    res.json({ ok: true, mensaje: 'Mensaje enviado correctamente.' });
  } catch (error) {
    console.error('Error al enviar mensaje de contacto:', error);
    res.status(503).json({ error: 'No se pudo enviar el mensaje. Intentá nuevamente más tarde.' });
  }
});

// ── Autenticación ──

app.post('/api/auth/registro', async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    const existe = await Usuario.findOne({ email });

    if (existe) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
    }

    const codigoVerificacion = generarCodigoVerificacion();
    const codigoVerificacionExpira = generarExpiracionCodigo(10);
    const passwordHasheada = await bcrypt.hash(password, 10);

    const nuevoUsuario = await new Usuario({
      email,
      password: passwordHasheada,
      rol: 'cliente',
      verificado: false,
      codigoVerificacion,
      codigoVerificacionExpira,
    }).save();

    try {
      await enviarCodigoVerificacion(email, codigoVerificacion);
    } catch (mailError) {
      await Usuario.findByIdAndDelete(nuevoUsuario._id);
      console.error('Error al enviar email de verificación:', mailError);
      return res.status(503).json({ error: 'No se pudo enviar el código de verificación. Intentá nuevamente.' });
    }

    res.status(201).json({
      ok: true,
      mensaje: 'Registro iniciado. Revisá tu correo para obtener el código de verificación.',
      usuario: sanitizarUsuario(nuevoUsuario),
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/confirmar', async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const codigo = String(req.body.codigo || '').trim();

    if (!email || !codigo) {
      return res.status(400).json({ error: 'Email y código son requeridos.' });
    }

    const usuario = await Usuario.findOne({ email });

    if (!usuario) {
      return res.status(401).json({ error: 'Código inválido o expirado.' });
    }

    if (usuario.verificado) {
      if (usuario.rol === 'admin') {
        const token = generarTokenAdmin(usuario);
        return res.json({ token, usuario: sanitizarUsuario(usuario) });
      }

      const token = generarTokenCliente(usuario);
      return res.json({ token, usuario: sanitizarUsuario(usuario) });
    }

    const codigoValido = usuario.codigoVerificacion === codigo;
    const noExpirado = usuario.codigoVerificacionExpira && usuario.codigoVerificacionExpira > new Date();

    if (!codigoValido || !noExpirado) {
      return res.status(401).json({ error: 'Código inválido o expirado.' });
    }

    usuario.verificado = true;
    usuario.codigoVerificacion = undefined;
    usuario.codigoVerificacionExpira = undefined;
    await usuario.save();

    if (usuario.rol === 'admin') {
      const token = generarTokenAdmin(usuario);
      return res.json({
        token,
        usuario: sanitizarUsuario(usuario),
      });
    }

    const token = generarTokenCliente(usuario);
    return res.json({
      token,
      usuario: sanitizarUsuario(usuario),
    });
  } catch (error) {
    console.error('Error al confirmar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');

    const usuario = await Usuario.findOne({ email });

    if (!usuario || !(await verificarPassword(password, usuario.password))) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (!usuario.verificado) {
      return res.status(403).json({ error: 'Cuenta no verificada. Completá el registro primero.' });
    }

    if (usuario.rol === 'admin') {
      const token = generarTokenAdmin(usuario);
      return res.json({
        token,
        usuario: sanitizarUsuario(usuario),
      });
    }

    const token = generarTokenCliente(usuario);
    res.json({ token, usuario: sanitizarUsuario(usuario) });
  } catch (error) {
    logError('LOGIN', error, {
      emailUsuario: normalizarEmail(req.body?.email),
    });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.get('/api/auth/perfil', verificarClienteJWT, async (req, res) => {
  try {
    const usuario = await obtenerUsuarioVerificado(req.usuario.email);
    if (!usuario) {
      return res.status(403).json({ error: 'Cuenta no válida o no verificada.' });
    }

    res.json({ usuario: sanitizarUsuario(usuario) });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/auth/perfil', verificarClienteJWT, async (req, res) => {
  try {
    const usuario = await obtenerUsuarioVerificado(req.usuario.email);

    if (!usuario) {
      return res.status(403).json({ error: 'Cuenta no válida o no verificada.' });
    }

    if (req.body.nombre !== undefined) {
      usuario.nombre = String(req.body.nombre || '').trim().slice(0, 120);
    }

    if (req.body.telefono !== undefined) {
      usuario.telefono = String(req.body.telefono || '').trim().slice(0, 30);
    }

    if (req.body.direccion !== undefined) {
      usuario.direccion = String(req.body.direccion || '').trim().slice(0, 300);
    }

    if (req.body.preferencias && typeof req.body.preferencias === 'object') {
      if (typeof req.body.preferencias.emailsPromos === 'boolean') {
        usuario.preferencias = usuario.preferencias || {};
        usuario.preferencias.emailsPromos = req.body.preferencias.emailsPromos;
      }
      if (typeof req.body.preferencias.emailsPedidos === 'boolean') {
        usuario.preferencias = usuario.preferencias || {};
        usuario.preferencias.emailsPedidos = req.body.preferencias.emailsPedidos;
      }
    }

    await usuario.save();
    res.json({ usuario: sanitizarUsuario(usuario) });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/auth/password', verificarClienteJWT, async (req, res) => {
  try {
    const passwordActual = String(req.body.passwordActual || '');
    const passwordNueva = String(req.body.passwordNueva || '');

    if (passwordNueva.length < 6) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const usuario = await obtenerUsuarioCliente(req.usuario.email);
    if (!usuario) {
      return res.status(403).json({ error: 'Cuenta no válida o no verificada.' });
    }

    if (!(await verificarPassword(passwordActual, usuario.password))) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta.' });
    }

    usuario.password = await bcrypt.hash(passwordNueva, 10);
    await usuario.save();

    res.json({ ok: true });
  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

async function iniciarServidor() {
  try {
    await asegurarConexionDB();
    console.log('  ✓ MongoDB conectado');

    await new Promise((resolve) => {
      app.listen(PORT, resolve);
    });

    if (USE_NGROK) {
      try {
        const urlPublica = await iniciarTunelNgrok(PORT);
        APP_BASE_URL = urlPublica;
        WEBHOOK_BASE_URL = urlPublica;
        console.log(`  ✓ Túnel ngrok     →  ${urlPublica}`);
      } catch (ngrokError) {
        console.warn(`  ⚠ ngrok no disponible: ${ngrokError.message}`);
        console.warn('    Mercado Pago usará localhost (sin auto_return ni webhooks).');
      }
    }

    console.log('');
    console.log('  Jerseys Store');
    console.log('  ─────────────────────────────────');
    console.log(`  Servidor activo  →  http://localhost:${PORT}`);
    if (!esUrlLocal(APP_BASE_URL)) {
      console.log(`  Tienda pública   →  ${APP_BASE_URL}`);
    }
    console.log('');
  } catch (error) {
    logError('MONGODB_INICIO', error);
    process.exit(1);
  }
}

if (process.env.VERCEL) {
  module.exports = app;
} else {
  iniciarServidor();
}
