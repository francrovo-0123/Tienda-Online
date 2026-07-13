const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Base de datos recomendada para MONGO_URI en .env: jerseys_store_db
// Ejemplo: mongodb+srv://usuario:contraseña@cluster.mongodb.net/jerseys_store_db

const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { spawn } = require('child_process');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
const {
  verificarConexionSmtp,
  enviarCodigoVerificacion,
  enviarBienvenida,
  enviarConfirmacionCompra,
  enviarMensajeContacto,
  enviarMailDespacho,
} = require('./mailService');

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET no está definido o tiene menos de 32 caracteres. El servidor no puede iniciarse de forma segura.');
  // En local abortamos; en Vercel dejamos que el runtime reporte el error por request.
  if (!process.env.VERCEL) {
    process.exit(1);
  }
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
const NOMBRE_TIENDA_DEFECTO = String(process.env.NOMBRE_TIENDA || 'Jersey Store').trim();
const WHATSAPP_NUMERO = String(process.env.WHATSAPP_NUMERO || '').trim();
const CLOUDINARY_CLOUD_NAME = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const CLOUDINARY_UPLOAD_PRESET = String(process.env.CLOUDINARY_UPLOAD_PRESET || '').trim();
const MP_ACCESS_TOKEN = String(process.env.MP_ACCESS_TOKEN || '').trim();
const MP_SANDBOX = String(process.env.MP_SANDBOX || '').toLowerCase() === 'true';
/** Secret de firma de webhooks (panel MP → Webhooks → Configurar notificaciones). */
const MP_WEBHOOK_SECRET = String(process.env.MP_WEBHOOK_SECRET || '').trim();
const USE_NGROK = String(process.env.USE_NGROK || '').toLowerCase() === 'true';
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
const ESTADOS_VENTA_VALIDA = ['listo_empaquetar', 'despachado', 'entregado'];
const ESTADOS_PEDIDO_ACTIVO = ['pendiente_pago', 'listo_empaquetar'];

/**
 * [ALTO-02] CORS restringido a la URL oficial de la tienda (APP_BASE_URL).
 * Sin Origin (cron, webhooks server-to-server, herramientas) se permite;
 * orígenes de navegador distintos al de la tienda se rechazan.
 * APP_BASE_URL puede actualizarse en runtime (p. ej. ngrok).
 */
function origenPermitido(origin) {
  if (!origin) return true;

  const permitido = String(APP_BASE_URL || '').replace(/\/$/, '');
  const solicitado = String(origin).replace(/\/$/, '');

  return Boolean(permitido) && solicitado === permitido;
}

app.use(cors({
  origin(origin, callback) {
    if (origenPermitido(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Confiar en el primer proxy (Vercel, Cloudflare, Nginx) para leer la IP real del cliente.
// Sin esto, express-rate-limit vería la IP del proxy y podría bloquear a muchos usuarios a la vez.
app.set('trust proxy', 1);

// Rate limiting por IP (fuerza bruta / spam en auth y contacto).
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
});

/** Más estricto que limitadorAuth: OTP de 6 dígitos es adivinable por fuerza bruta. */
const limitadorOtp = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Esperá unos minutos e intentá de nuevo.' },
});

const limitadorContacto = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados mensajes. Esperá unos minutos e intentá de nuevo.' },
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
/** Estados del panel de administración (flujo de fulfillment). */
const ESTADOS_PEDIDO = ['pendiente_pago', 'listo_empaquetar', 'despachado', 'entregado'];
/** Incluye cancelado para expiración / rechazo de Mercado Pago. */
const ESTADOS_PEDIDO_SCHEMA = [...ESTADOS_PEDIDO, 'cancelado'];
const ESTADO_PEDIDO_INICIAL = 'pendiente_pago';
const ESTADO_PEDIDO_MP_PENDIENTE = 'pendiente_pago';
const ESTADOS_PEDIDO_LEGACY = {
  'Pendiente de pago': 'pendiente_pago',
  Pendiente: 'pendiente_pago',
  Aprobado: 'listo_empaquetar',
  'Preparación de pedido': 'listo_empaquetar',
  'En Preparación': 'listo_empaquetar',
  Enviado: 'despachado',
  Entregado: 'entregado',
  Listo: 'entregado',
  pagado: 'listo_empaquetar',
  confirmado: 'listo_empaquetar',
  Rechazado: 'cancelado',
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
  stock: { type: Number, required: true, default: 0, min: 0 },
  stockTalles: { type: stockTallesSchema, default: () => ({ S: 0, M: 0, L: 0, XL: 0, XXL: 0 }) },
  ventasContador: { type: Number, default: 0, min: 0 },
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
  numeroPedido: { type: String, unique: true, required: true, trim: true, index: true },
  emailUsuario: { type: String, required: true, lowercase: true, trim: true, index: true },
  cliente: { type: String, required: true },
  telefono: { type: String, required: true },
  direccion: { type: String, default: '' },
  localidad: { type: String, default: '', trim: true },
  provincia: { type: String, default: '', trim: true },
  codigoPostal: { type: String, default: '', trim: true },
  pago: { type: String, default: 'Efectivo' },
  productos: [productoItemPedidoSchema],
  total: { type: Number, default: 0 },
  estado: {
    type: String,
    enum: ESTADOS_PEDIDO_SCHEMA,
    default: ESTADO_PEDIDO_INICIAL,
    required: true,
  },
  mercadopagoPreferenceId: { type: String, default: null },
  mercadopagoPaymentId: { type: String, default: null },
  codigoSeguimiento: { type: String, default: null, trim: true },
  expiraEn: { type: Date, default: null },
  fecha: { type: Date, default: Date.now },
});

pedidoSchema.index({ estado: 1, expiraEn: 1 });
pedidoSchema.index({ mercadopagoPreferenceId: 1 }, { sparse: true });
pedidoSchema.index({ emailUsuario: 1, fecha: -1 });

const contadorSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const cuponSchema = new mongoose.Schema(
  {
    codigo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    descuentoPorcentaje: {
      type: Number,
      required: true,
      min: [1, 'El descuento debe ser al menos 1%'],
      max: [100, 'El descuento no puede superar 100%'],
    },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

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
  localidad: { type: String, default: '', trim: true },
  provincia: { type: String, default: '', trim: true },
  codigoPostal: { type: String, default: '', trim: true },
  preferencias: {
    emailsPromos: { type: Boolean, default: true },
    emailsPedidos: { type: Boolean, default: true },
  },
});

const registroPendienteSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  codigoVerificacion: { type: String, required: true },
  codigoVerificacionExpira: { type: Date, required: true },
  creadoEn: { type: Date, default: Date.now },
});

// Expira automáticamente ~1 hora después de la caducidad del código (libera el email).
registroPendienteSchema.index(
  { codigoVerificacionExpira: 1 },
  { expireAfterSeconds: 3600 }
);

const Producto = mongoose.model('Producto', productoSchema);
const Pedido = mongoose.model('Pedido', pedidoSchema);
const Contador = mongoose.model('Contador', contadorSchema);
const Cupon = mongoose.model('Cupon', cuponSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);
const RegistroPendiente = mongoose.model('RegistroPendiente', registroPendienteSchema);

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
  nombreTienda: { type: String, default: 'Jersey Store' },
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

/** Extrae y limpia los campos de entrega del body de checkout/perfil. */
function extraerDatosDireccionCliente(cliente = {}) {
  return {
    direccion: String(cliente.direccion || '').trim().slice(0, 300),
    localidad: String(cliente.localidad || '').trim().slice(0, 120),
    provincia: String(cliente.provincia || '').trim().slice(0, 80),
    codigoPostal: String(cliente.codigoPostal || '').trim().toUpperCase().slice(0, 12),
  };
}

function validarDatosEntregaCliente(cliente = {}) {
  const datos = extraerDatosDireccionCliente(cliente);

  if (!datos.direccion) {
    return { error: 'La dirección de entrega es obligatoria.', status: 400 };
  }
  if (!datos.localidad) {
    return { error: 'La localidad es obligatoria.', status: 400 };
  }
  if (!datos.provincia) {
    return { error: 'La provincia es obligatoria.', status: 400 };
  }
  if (!datos.codigoPostal || !/^[A-Z]?\d{4}[A-Z]{0,3}$/i.test(datos.codigoPostal)) {
    return { error: 'Ingresá un código postal válido (ej: 1406 o C1406ABC).', status: 400 };
  }

  return { datos };
}

function generarIdPedido() {
  const numero = Math.floor(1000 + Math.random() * 9000);
  return `#PED-${numero}`;
}

/** Número corto y amigable (ej: "1001") mediante contador atómico en MongoDB. */
async function generarNumeroPedido() {
  const contador = await Contador.findByIdAndUpdate(
    'pedido',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return String(1000 + contador.seq);
}

function normalizarEstadoPedido(estado) {
  const valor = String(estado || '').trim();
  if (ESTADOS_PEDIDO_SCHEMA.includes(valor)) return valor;
  return ESTADOS_PEDIDO_LEGACY[valor] || ESTADO_PEDIDO_INICIAL;
}

function generarCodigoVerificacion() {
  // crypto.randomInt es CSPRNG; evita Math.random() (predecible) en OTPs.
  return String(crypto.randomInt(100000, 1000000));
}

function generarExpiracionCodigo(minutos = 10) {
  return new Date(Date.now() + minutos * 60 * 1000);
}

async function verificarPassword(password, passwordAlmacenada) {
  if (!password || !passwordAlmacenada) return false;

  const esHashBcrypt = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordAlmacenada);
  if (!esHashBcrypt) return false;

  return bcrypt.compare(password, passwordAlmacenada);
}

async function obtenerNombreTienda() {
  try {
    const config = await obtenerConfiguracionUnica();
    return formatearConfiguracion(config).nombreTienda;
  } catch {
    return NOMBRE_TIENDA_DEFECTO || 'Jersey Store';
  }
}

/**
 * Envía confirmación de compra sin alterar el flujo de checkout/webhook.
 * Si el SMTP falla, solo se registra el error.
 */
async function notificarConfirmacionCompraSegura(pedido, usuario) {
  try {
    if (usuario?.preferencias?.emailsPedidos === false) {
      return;
    }

    const nombreTienda = await obtenerNombreTienda();
    await enviarConfirmacionCompra(pedido, nombreTienda);
  } catch (error) {
    logError('EMAIL_CONFIRMACION_COMPRA', error, {
      pedidoId: pedido?.id,
      emailUsuario: pedido?.emailUsuario,
    });
  }
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
    const payload = jwt.verify(token, JWT_SECRET);

    if (!payload || typeof payload !== 'object' || !payload.email || !payload.rol) {
      return res.status(403).json({ error: 'Token inválido.' });
    }

    req.usuario = payload;
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

// Auditoría: rol debe ser estrictamente 'admin' (403 a clientes con JWT válido).
function esAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({
      error: 'Acceso denegado. Se requiere rol de administrador.',
    });
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
    localidad: datos.localidad || '',
    provincia: datos.provincia || '',
    codigoPostal: datos.codigoPostal || '',
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

function formatearCupon(cupon) {
  const datos = cupon.toObject ? cupon.toObject() : cupon;

  return {
    id: String(datos._id),
    codigo: String(datos.codigo || '').toUpperCase(),
    descuentoPorcentaje: Number(datos.descuentoPorcentaje),
    activo: datos.activo !== false,
    createdAt: datos.createdAt || null,
    updatedAt: datos.updatedAt || null,
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
    numeroPedido: datos.numeroPedido || null,
    emailUsuario: normalizarEmail(datos.emailUsuario),
    cliente: {
      nombre: datos.cliente,
      telefono: datos.telefono,
      direccion: datos.direccion,
      localidad: datos.localidad || '',
      provincia: datos.provincia || '',
      codigoPostal: datos.codigoPostal || '',
      email: normalizarEmail(datos.emailUsuario),
    },
    productos: (datos.productos || []).map(formatearItemPedido),
    total: datos.total,
    metodoPago: datos.pago,
    fecha: datos.fecha instanceof Date ? datos.fecha.toISOString() : datos.fecha,
    estado: normalizarEstadoPedido(datos.estado),
    codigoSeguimiento: datos.codigoSeguimiento
      ? String(datos.codigoSeguimiento).trim()
      : null,
  };
}

function obtenerConfiguracionDesdeEnv() {
  return {
    nombreTienda: NOMBRE_TIENDA_DEFECTO || 'Jersey Store',
    whatsappNumero: WHATSAPP_NUMERO.replace(/^\+/, ''),
    cloudinaryCloudName: CLOUDINARY_CLOUD_NAME,
    cloudinaryUploadPreset: CLOUDINARY_UPLOAD_PRESET,
  };
}

function formatearConfiguracion(config) {
  const datos = config?.toObject ? config.toObject() : config || {};

  return {
    nombreTienda: String(datos.nombreTienda || NOMBRE_TIENDA_DEFECTO || 'Jersey Store').trim(),
    whatsappNumero: String(datos.whatsappNumero || '').replace(/^\+/, '').trim(),
    cloudinaryCloudName: String(datos.cloudinaryCloudName || '').trim(),
    cloudinaryUploadPreset: String(datos.cloudinaryUploadPreset || '').trim(),
    afipLink: String(datos.afipLink || '').trim(),
  };
}

async function migrarNombreTiendaSiCorresponde(config) {
  if (!config) return;

  const nombreNuevo = NOMBRE_TIENDA_DEFECTO || 'Jersey Store';
  const nombreActual = String(config.nombreTienda || '').trim();

  if (nombreActual === nombreNuevo) {
    return;
  }

  // Forzar rebrand: el logo lee este valor desde /api/config
  config.nombreTienda = nombreNuevo;
  await config.save();
  console.log(`=> Nombre de tienda actualizado a ${nombreNuevo} (antes: ${nombreActual || 'vacío'}).`);
}

async function obtenerConfiguracionUnica() {
  let config = await Configuracion.findOne();

  if (!config) {
    await inicializarConfiguracion();
    config = await Configuracion.findOne();
  }

  await migrarNombreTiendaSiCorresponde(config);
  return config;
}

async function inicializarConfiguracion() {
  const total = await Configuracion.countDocuments();

  if (total === 0) {
    await Configuracion.create(obtenerConfiguracionDesdeEnv());
    console.log('=> Éxito: Configuración inicial de la tienda creada desde .env.');
    return;
  }

  const config = await Configuracion.findOne();
  await migrarNombreTiendaSiCorresponde(config);
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

/**
 * Tras una venta confirmada: incrementa atómicamente ventasContador por cada ítem.
 * Usa $inc para evitar condiciones de carrera entre webhooks/checkouts concurrentes.
 */
async function incrementarVentasContadorDesdePedido(pedido) {
  const actualizaciones = [];

  for (const item of pedido?.productos || []) {
    const productoId = item.producto?.id ?? item.producto;
    const cantidad = Math.floor(Number(item.cantidad || 0));
    if (productoId == null || !Number.isFinite(cantidad) || cantidad <= 0) continue;

    const idStr = String(productoId);
    let filtro = null;

    if (mongoose.isValidObjectId(idStr)) {
      filtro = { _id: idStr };
    } else {
      const num = Number(idStr);
      if (Number.isFinite(num)) filtro = { id: num };
    }

    if (!filtro) continue;

    actualizaciones.push(
      Producto.updateOne(filtro, { $inc: { ventasContador: cantidad } })
    );
  }

  if (actualizaciones.length) {
    await Promise.all(actualizaciones);
  }
}

/**
 * Tras una compra aprobada: si el stock del modelo quedó en 0, desactiva el producto.
 * El stock ya se reservó en /api/pagar o /api/pedidos; aquí solo se confirma la desactivación.
 */
async function desactivarProductosSinStockDesdePedido(pedido) {
  const idsMongo = new Set();
  const idsNumericos = new Set();

  for (const item of pedido?.productos || []) {
    const productoId = item.producto?.id ?? item.producto;
    if (productoId == null) continue;

    const idStr = String(productoId);
    if (mongoose.isValidObjectId(idStr)) {
      idsMongo.add(idStr);
    } else {
      const num = Number(idStr);
      if (Number.isFinite(num)) idsNumericos.add(num);
    }
  }

  const condiciones = [];
  if (idsMongo.size) condiciones.push({ _id: { $in: [...idsMongo] } });
  if (idsNumericos.size) condiciones.push({ id: { $in: [...idsNumericos] } });
  if (!condiciones.length) return 0;

  const resultado = await Producto.updateMany(
    {
      $or: condiciones,
      stock: { $lte: 0 },
      activo: { $ne: false },
    },
    { $set: { activo: false } }
  );

  const desactivados = resultado.modifiedCount || 0;
  if (desactivados > 0) {
    console.log(`=> ${desactivados} producto(s) desactivado(s) por stock agotado (pedido ${pedido.id}).`);
  }

  return desactivados;
}

async function limpiarPedidosExpirados() {
  const ahora = new Date();
  const pedidosExpirados = await Pedido.find({
    estado: ESTADO_PEDIDO_MP_PENDIENTE,
    expiraEn: { $ne: null, $lt: ahora },
  }).select('_id').lean();

  if (!pedidosExpirados.length) {
    return 0;
  }

  let cancelados = 0;

  // Claim atómico por pedido: solo quien gana el findOneAndUpdate (estado sigue
  // siendo pendiente_pago) restaura stock. Si un webhook aprobó o canceló
  // milisegundos antes, el update no matchea y se salta sin tocar inventario.
  for (const candidato of pedidosExpirados) {
    const pedidoCancelado = await Pedido.findOneAndUpdate(
      {
        _id: candidato._id,
        estado: ESTADO_PEDIDO_MP_PENDIENTE,
      },
      { $set: { estado: 'cancelado' } },
      { new: true }
    );

    if (!pedidoCancelado) continue;

    await restaurarStockDesdePedido(pedidoCancelado);
    cancelados += 1;
    console.log(`=> Pedido ${pedidoCancelado.id} cancelado por expiración de pago (stock restaurado).`);
  }

  return cancelados;
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

    if (producto.activo === false || normalizarStock(producto.stock) <= 0) {
      return {
        error: `No hay unidades disponibles de «${producto.nombre}».`,
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

      if (productoActual?.activo === false || disponible <= 0) {
        return {
          error: `No hay unidades disponibles de «${nombreProducto}».`,
          status: 400,
        };
      }

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

/** Redondeo a 2 decimales para montos ARS. */
function redondearMonto(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

/**
 * Extrae el código de cupón del body sin confiar en montos ni porcentajes del cliente.
 * Acepta: codigoCupon | cupon (string) | cupon.codigo
 */
function extraerCodigoCuponDelBody(body) {
  const raw = body?.codigoCupon ?? body?.cupon;
  if (raw && typeof raw === 'object') {
    return String(raw.codigo || '').trim().toUpperCase();
  }
  return String(raw || '').trim().toUpperCase();
}

/**
 * Revalida el cupón en DB. Si no hay código, no aplica descuento.
 * Nunca usa descuentoPorcentaje ni totales enviados por el frontend.
 */
async function resolverCuponParaCheckout(codigoRaw) {
  const codigo = String(codigoRaw || '').trim().toUpperCase();

  if (!codigo) {
    return { ok: true, cupon: null };
  }

  const cupon = await Cupon.findOne({ codigo });

  // Misma respuesta genérica que /api/cupones/validar (anti-enumeración).
  if (!cupon || cupon.activo === false) {
    return {
      ok: false,
      status: 400,
      error: 'El código de cupón ingresado no es válido o ya ha expirado',
    };
  }

  const descuentoPorcentaje = Number(cupon.descuentoPorcentaje);
  if (
    !Number.isInteger(descuentoPorcentaje)
    || descuentoPorcentaje < 1
    || descuentoPorcentaje > 100
  ) {
    return {
      ok: false,
      status: 400,
      error: 'El código de cupón ingresado no es válido o ya ha expirado',
    };
  }

  return {
    ok: true,
    cupon: {
      codigo: cupon.codigo,
      descuentoPorcentaje,
    },
  };
}

/**
 * Aplica el % del cupón al total calculado en servidor (totalPedido / totalCompra).
 * El frontend no define el precio final.
 */
function aplicarDescuentoCuponAlTotal(totalBase, cupon) {
  const totalSinDescuento = redondearMonto(totalBase);

  if (!cupon) {
    return {
      totalSinDescuento,
      totalFinal: totalSinDescuento,
      descuentoMonto: 0,
    };
  }

  const totalFinal = Math.max(
    0,
    redondearMonto(totalSinDescuento * (1 - cupon.descuentoPorcentaje / 100))
  );

  return {
    totalSinDescuento,
    totalFinal,
    descuentoMonto: redondearMonto(totalSinDescuento - totalFinal),
  };
}

/**
 * Construye ítems de Checkout Pro cuyo importe coincide exactamente con totalFinal
 * (transaction_amount efectivo de la preferencia).
 */
function construirItemsMercadoPago(productosPedido, totalFinal) {
  const itemsBase = productosPedido.map((item) => ({
    title: item.producto.talle
      ? `${item.producto.nombre} — Talle ${item.producto.talle}`
      : item.producto.nombre,
    quantity: item.cantidad,
    unit_price: redondearMonto(item.precio),
    currency_id: 'ARS',
  }));

  const totalSinDescuento = redondearMonto(
    itemsBase.reduce((acum, item) => acum + item.unit_price * item.quantity, 0)
  );
  const montoObjetivo = redondearMonto(totalFinal);

  if (itemsBase.length === 0 || Math.abs(montoObjetivo - totalSinDescuento) < 0.005) {
    return itemsBase;
  }

  if (montoObjetivo <= 0) {
    return [{
      title: 'Pedido con cupón 100% OFF',
      quantity: 1,
      unit_price: 0,
      currency_id: 'ARS',
    }];
  }

  const factor = montoObjetivo / totalSinDescuento;
  const items = itemsBase.map((item) => ({
    ...item,
    unit_price: redondearMonto(item.unit_price * factor),
  }));

  // Corrige deriva de redondeo en el último ítem para igualar totalFinal.
  const sumaParcial = redondearMonto(
    items.slice(0, -1).reduce((acum, item) => acum + item.unit_price * item.quantity, 0)
  );
  const ultimo = items[items.length - 1];
  ultimo.unit_price = redondearMonto((montoObjetivo - sumaParcial) / ultimo.quantity);

  if (ultimo.unit_price < 0) {
    return [{
      title: 'Compra Jerseys Store',
      quantity: 1,
      unit_price: montoObjetivo,
      currency_id: 'ARS',
    }];
  }

  return items;
}

function obtenerPaymentIdDesdeNotificacion(req) {
  const tipo = req.query?.type || req.query?.topic || req.body?.type || req.body?.topic;

  if (tipo !== 'payment') return null;

  const id = req.query?.['data.id']
    || req.query?.id
    || req.body?.data?.id;

  return id ? String(id) : null;
}

/** Ventana máxima de antigüedad del webhook MP (anti-replay). */
const WEBHOOK_MP_TOLERANCIA_MS = 300_000; // 5 minutos

/**
 * [ALTO-03] Valida x-signature de webhooks de Mercado Pago (HMAC-SHA256)
 * y rechaza notificaciones fuera de la ventana de 5 minutos (anti-replay).
 * Manifest oficial: id:{data.id};request-id:{x-request-id};ts:{ts};
 * @returns {{ ok: true } | { ok: false, motivo: 'sin_secret'|'firma'|'expirada', diferenciaMs?: number }}
 * @see https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
 */
function validarFirmaWebhookMercadoPago(req) {
  if (!MP_WEBHOOK_SECRET) {
    console.warn('Webhook MP rechazado: MP_WEBHOOK_SECRET no configurado.');
    return { ok: false, motivo: 'sin_secret' };
  }

  const xSignature = String(req.headers['x-signature'] || '').trim();
  if (!xSignature) {
    return { ok: false, motivo: 'firma' };
  }

  const partesFirma = {};
  for (const parte of xSignature.split(',')) {
    const [clave, ...resto] = parte.trim().split('=');
    if (clave && resto.length > 0) {
      partesFirma[clave.trim()] = resto.join('=').trim();
    }
  }

  const ts = partesFirma.ts;
  const hashRecibido = partesFirma.v1;

  if (!ts || !hashRecibido) {
    return { ok: false, motivo: 'firma' };
  }

  // Solo data.id del query forma parte del manifest oficial de MP.
  const dataIdRaw = req.query?.['data.id'];
  const dataId = dataIdRaw != null && String(dataIdRaw).length > 0
    ? String(dataIdRaw).toLowerCase()
    : null;

  const xRequestId = req.headers['x-request-id']
    ? String(req.headers['x-request-id']).trim()
    : null;

  const manifestParts = [];
  if (dataId) manifestParts.push(`id:${dataId}`);
  if (xRequestId) manifestParts.push(`request-id:${xRequestId}`);
  manifestParts.push(`ts:${ts}`);
  const manifest = `${manifestParts.join(';')};`;

  const hashCalculado = crypto
    .createHmac('sha256', MP_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  const bufRecibido = Buffer.from(hashRecibido, 'utf8');
  const bufCalculado = Buffer.from(hashCalculado, 'utf8');

  if (bufRecibido.length !== bufCalculado.length) {
    return { ok: false, motivo: 'firma' };
  }

  if (!crypto.timingSafeEqual(bufRecibido, bufCalculado)) {
    return { ok: false, motivo: 'firma' };
  }

  // Anti-replay: solo tras firma válida se confía en ts (ms, doc oficial MP).
  const tsMs = Number(ts);
  if (!Number.isFinite(tsMs)) {
    return { ok: false, motivo: 'firma' };
  }

  const diferenciaMs = Math.abs(Date.now() - tsMs);
  if (diferenciaMs > WEBHOOK_MP_TOLERANCIA_MS) {
    return { ok: false, motivo: 'expirada', diferenciaMs };
  }

  return { ok: true };
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

function obtenerInicioMesActual() {
  const [anio, mes] = obtenerClaveFechaLocal().split('-').map(Number);
  const mesPad = String(mes).padStart(2, '0');
  return new Date(`${anio}-${mesPad}-01T00:00:00.000-03:00`);
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

// Catálogo público. ?todos=true expone inactivos → solo admin JWT (antes era público).
app.get('/api/productos', async (req, res) => {
  try {
    const incluirInactivos = req.query.todos === 'true';

    if (incluirInactivos) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Acceso denegado. Se requiere autenticación de administrador.',
        });
      }

      try {
        const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
        if (payload?.rol !== 'admin') {
          return res.status(403).json({
            error: 'Acceso denegado. Se requiere rol de administrador.',
          });
        }
        req.usuario = payload;
      } catch (error) {
        if (error?.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Tu sesión expiró. Volvé a iniciar sesión.' });
        }
        return res.status(403).json({ error: 'Token inválido.' });
      }
    }

    // Catálogo público: solo modelos activos con stock disponible.
    const filtro = incluirInactivos
      ? {}
      : { activo: { $ne: false }, stock: { $gt: 0 } };

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
      stock: { $gt: 0 },
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

    // Sin precio de oferta, el flag de portada también debe limpiarse.
    await Producto.updateMany(
      { id: { $in: productos.map((producto) => producto.id) } },
      { $set: { precioOferta: null, enOferta: false } }
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
    const productoExistente = await buscarProductoPorId(req.params.id);

    if (!productoExistente) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    if (req.body?.destacado !== undefined) {
      actualizacion.destacado = parsearBooleano(req.body.destacado);
    }

    if (req.body?.enOferta !== undefined || req.body?.en_oferta !== undefined) {
      const marcarEnOferta = parsearBooleano(
        req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
      );

      // No permitir flag de portada sin precio_oferta válido (evita desync).
      if (marcarEnOferta) {
        const ofertaValida = normalizarPrecioOferta(
          productoExistente.precioOferta,
          productoExistente.precio
        );
        if (ofertaValida === null) {
          return res.status(400).json({
            error:
              'Para marcar «En Oferta» primero definí un precio_oferta menor al precio regular en el formulario del producto.',
          });
        }
      }

      actualizacion.enOferta = marcarEnOferta;
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
    const precioOfertaNormalizado = normalizarPrecioOferta(ofertaRaw, precioNumerico);

    // Si no hay oferta válida, forzar enOferta=false y precioOferta=null.
    let enOferta = parsearBooleano(
      req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
    );
    if (precioOfertaNormalizado === null) {
      enOferta = false;
    } else if (
      req.body.enOferta === undefined
      && req.body.en_oferta === undefined
    ) {
      enOferta = true;
    }

    const nuevoProducto = await new Producto({
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: precioOfertaNormalizado,
      destacado: parsearBooleano(req.body.destacado),
      enOferta,
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
    const precioOfertaNormalizado = normalizarPrecioOferta(ofertaRaw, precioNumerico);

    const actualizacion = {
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: precioOfertaNormalizado,
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

    // Sin precio_oferta → null + enOferta false (antes el flag quedaba huérfano).
    if (precioOfertaNormalizado === null) {
      actualizacion.enOferta = false;
    } else if (req.body.enOferta !== undefined || req.body.en_oferta !== undefined) {
      actualizacion.enOferta = parsearBooleano(
        req.body.enOferta !== undefined ? req.body.enOferta : req.body.en_oferta
      );
    } else {
      actualizacion.enOferta = true;
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

    const validacionEntrega = validarDatosEntregaCliente(cliente);
    if (validacionEntrega.error) {
      return res.status(validacionEntrega.status).json({ error: validacionEntrega.error });
    }
    const datosEntrega = validacionEntrega.datos;

    // Revalidar cupón en servidor antes de tocar stock; no confiar en totales del cliente.
    const resultadoCupon = await resolverCuponParaCheckout(extraerCodigoCuponDelBody(req.body));
    if (!resultadoCupon.ok) {
      return res.status(resultadoCupon.status).json({ error: resultadoCupon.error });
    }

    const resultadoItems = await validarItemsYReservarStock(items);
    if (resultadoItems.error) {
      return res.status(resultadoItems.status).json({ error: resultadoItems.error });
    }

    const { productosPedido, totalPedido, decrementosRealizados } = resultadoItems;
    const { totalFinal } = aplicarDescuentoCuponAlTotal(totalPedido, resultadoCupon.cupon);

    let nuevoPedido;

    try {
      const numeroPedido = await generarNumeroPedido();
      nuevoPedido = await new Pedido({
        id: generarIdPedido(),
        numeroPedido,
        emailUsuario: email,
        cliente: String(cliente.nombre).trim(),
        telefono: String(cliente.telefono).trim(),
        direccion: datosEntrega.direccion,
        localidad: datosEntrega.localidad,
        provincia: datosEntrega.provincia,
        codigoPostal: datosEntrega.codigoPostal,
        pago: metodoPago || 'Efectivo',
        productos: productosPedido,
        total: totalFinal,
        // Efectivo / tradicional: listo para armar de inmediato (no espera confirmación de pago).
        estado: 'listo_empaquetar',
        fecha: new Date(),
      }).save();
    } catch (saveError) {
      await revertirDecrementosStock(decrementosRealizados);
      throw saveError;
    }

    res.status(201).json(formatearPedido(nuevoPedido));

    // Pedido confirmado (efectivo u otro): contador de ventas + desactivar stock 0.
    setImmediate(async () => {
      try {
        await incrementarVentasContadorDesdePedido(nuevoPedido);
      } catch (ventasError) {
        logError('PEDIDO_VENTAS_CONTADOR', ventasError, { pedidoId: nuevoPedido.id });
      }
      try {
        await desactivarProductosSinStockDesdePedido(nuevoPedido);
      } catch (stockError) {
        logError('PEDIDO_DESACTIVAR_SIN_STOCK', stockError, { pedidoId: nuevoPedido.id });
      }
      notificarConfirmacionCompraSegura(nuevoPedido, usuario);
    });
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

    const validacionEntrega = validarDatosEntregaCliente(cliente);
    if (validacionEntrega.error) {
      return res.status(validacionEntrega.status).json({ error: validacionEntrega.error });
    }
    const datosEntrega = validacionEntrega.datos;

    // Revalidar cupón en servidor antes de tocar stock; no confiar en totales del cliente.
    const resultadoCupon = await resolverCuponParaCheckout(extraerCodigoCuponDelBody(req.body));
    if (!resultadoCupon.ok) {
      return res.status(resultadoCupon.status).json({ error: resultadoCupon.error });
    }

    const resultadoItems = await validarItemsYReservarStock(items);
    if (resultadoItems.error) {
      return res.status(resultadoItems.status).json({ error: resultadoItems.error });
    }

    const { productosPedido, totalPedido, decrementosRealizados } = resultadoItems;
    const { totalFinal } = aplicarDescuentoCuponAlTotal(totalPedido, resultadoCupon.cupon);
    const pedidoId = generarIdPedido();
    const nombreCliente = String(cliente.nombre).trim();
    const partesNombre = nombreCliente.split(/\s+/).filter(Boolean);
    const payerName = partesNombre[0] || nombreCliente;
    const payerSurname = partesNombre.slice(1).join(' ') || 'Cliente';

    // Ítems MP con precios DB + descuento de cupón revalidado (transaction_amount efectivo).
    const itemsMercadoPago = construirItemsMercadoPago(productosPedido, totalFinal);

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
      const numeroPedido = await generarNumeroPedido();
      await new Pedido({
        id: pedidoId,
        numeroPedido,
        emailUsuario: email,
        cliente: nombreCliente,
        telefono: String(cliente.telefono).trim(),
        direccion: datosEntrega.direccion,
        localidad: datosEntrega.localidad,
        provincia: datosEntrega.provincia,
        codigoPostal: datosEntrega.codigoPostal,
        pago: 'Mercado Pago',
        productos: productosPedido,
        total: totalFinal,
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
    // [ALTO-03] Sin firma válida / fuera de ventana no se procesa el estado del pedido.
    const resultadoFirma = validarFirmaWebhookMercadoPago(req);
    if (!resultadoFirma.ok) {
      if (resultadoFirma.motivo === 'expirada') {
        logError('WEBHOOK_MP_REPLAY', new Error('Webhook MP fuera de la ventana de 5 minutos'), {
          diferenciaMs: resultadoFirma.diferenciaMs,
          toleranciaMs: WEBHOOK_MP_TOLERANCIA_MS,
        });
        return res.sendStatus(401);
      }

      logError('WEBHOOK_MP_FIRMA_INVALIDA', new Error('Firma x-signature inválida o ausente'), {
        tieneXSignature: Boolean(req.headers['x-signature']),
        tieneSecret: Boolean(MP_WEBHOOK_SECRET),
        motivo: resultadoFirma.motivo,
      });
      return res.sendStatus(401);
    }

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

    if (pedido.estado === 'listo_empaquetar' || pedido.estado === 'cancelado' || pedido.estado === 'despachado' || pedido.estado === 'entregado') {
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

      // Claim atómico: solo el primer webhook concurrente confirma la venta
      // (evita incrementar ventasContador dos veces ante notificaciones duplicadas).
      const pedidoAprobado = await Pedido.findOneAndUpdate(
        {
          _id: pedido._id,
          estado: { $nin: ['cancelado', 'listo_empaquetar', 'despachado', 'entregado'] },
        },
        {
          $set: {
            estado: 'listo_empaquetar',
            mercadopagoPaymentId: paymentId,
          },
        },
        { new: true }
      );

      if (!pedidoAprobado) {
        return res.sendStatus(200);
      }

      try {
        await incrementarVentasContadorDesdePedido(pedidoAprobado);
      } catch (ventasError) {
        logError('WEBHOOK_MP_VENTAS_CONTADOR', ventasError, {
          pedidoId: pedidoAprobado.id,
          paymentId,
        });
      }

      // Compra confirmada: si algún modelo quedó sin stock, desactivarlo automáticamente.
      try {
        await desactivarProductosSinStockDesdePedido(pedidoAprobado);
      } catch (stockError) {
        logError('WEBHOOK_MP_DESACTIVAR_SIN_STOCK', stockError, {
          pedidoId: pedidoAprobado.id,
          paymentId,
        });
      }

      setImmediate(async () => {
        try {
          const usuarioPedido = await Usuario.findOne({
            email: normalizarEmail(pedidoAprobado.emailUsuario),
          });
          await notificarConfirmacionCompraSegura(pedidoAprobado, usuarioPedido);
        } catch (mailError) {
          logError('EMAIL_CONFIRMACION_COMPRA_MP', mailError, {
            pedidoId: pedidoAprobado.id,
            emailUsuario: pedidoAprobado.emailUsuario,
          });
        }
      });

      return res.sendStatus(200);
    }

    if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(estadoPago)) {
      // Claim atómico: solo el primer webhook concurrente pasa de un estado no terminal
      // a 'cancelado'. Evita restaurar stock dos veces ante notificaciones duplicadas.
      const pedidoCancelado = await Pedido.findOneAndUpdate(
        {
          _id: pedido._id,
          estado: { $nin: ['cancelado', 'listo_empaquetar', 'despachado', 'entregado'] },
        },
        {
          $set: {
            estado: 'cancelado',
            mercadopagoPaymentId: paymentId,
          },
        },
        { new: true }
      );

      if (!pedidoCancelado) {
        // Ya estaba en estado terminal; no volver a sumar stock.
        return res.sendStatus(200);
      }

      await restaurarStockDesdePedido(pedidoCancelado);
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

app.get('/api/admin/metricas', verificarAdminJWT, async (req, res) => {
  try {
    const inicioMes = obtenerInicioMesActual();
    const ahora = new Date();

    const [facturacionMes, pendientesContador, topProductos] = await Promise.all([
      Pedido.aggregate([
        {
          $match: {
            estado: { $in: ESTADOS_VENTA_VALIDA },
            fecha: { $gte: inicioMes, $lte: ahora },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$total' },
          },
        },
      ]),
      Pedido.countDocuments({ estado: 'listo_empaquetar' }),
      Producto.find()
        .sort({ ventasContador: -1 })
        .limit(3)
        .select({ nombre: 1, stock: 1, _id: 0 })
        .lean(),
    ]);

    return res.json({
      totalFacturado: facturacionMes[0]?.total || 0,
      pendientesContador,
      topProductos,
    });
  } catch (error) {
    logError('ADMIN_METRICAS', error, { ruta: req.path, metodo: req.method });
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

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

app.post('/api/admin/cupones', verificarAdminJWT, async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();
    const porcentajeRaw = req.body?.descuentoPorcentaje ?? req.body?.porcentaje;
    const descuentoPorcentaje = Number(porcentajeRaw);

    if (!codigo) {
      return res.status(400).json({ error: 'El código del cupón es obligatorio.' });
    }

    if (
      porcentajeRaw === undefined
      || porcentajeRaw === null
      || porcentajeRaw === ''
      || !Number.isInteger(descuentoPorcentaje)
      || descuentoPorcentaje < 1
      || descuentoPorcentaje > 100
    ) {
      return res.status(400).json({
        error: 'El porcentaje de descuento debe ser un número entero entre 1 y 100.',
      });
    }

    const existente = await Cupon.findOne({ codigo });
    if (existente) {
      return res.status(409).json({ error: 'Ya existe un cupón con ese código.' });
    }

    const nuevoCupon = await new Cupon({
      codigo,
      descuentoPorcentaje,
      activo: parsearBooleano(req.body?.activo, true),
    }).save();

    res.status(201).json(formatearCupon(nuevoCupon));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'Ya existe un cupón con ese código.' });
    }
    logError('ADMIN_CREAR_CUPON', error, { ruta: req.path, metodo: req.method });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/cupones/validar', limitadorAuth, async (req, res) => {
  try {
    const codigo = String(req.body?.codigo || '').trim().toUpperCase();

    if (!codigo) {
      return res.status(400).json({ error: 'Debés ingresar un código de cupón.' });
    }

    const cupon = await Cupon.findOne({ codigo });

    // Misma respuesta genérica si no existe o está inactivo: evita enumeración por status/mensaje.
    if (!cupon || cupon.activo === false) {
      return res.status(400).json({
        error: 'El código de cupón ingresado no es válido o ya ha expirado',
      });
    }

    res.json({
      valido: true,
      codigo: cupon.codigo,
      descuentoPorcentaje: Number(cupon.descuentoPorcentaje),
    });
  } catch (error) {
    logError('VALIDAR_CUPON', error, { ruta: req.path, metodo: req.method });
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

    if (!ESTADOS_PEDIDO.includes(estadoNormalizado)) {
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

app.post('/api/admin/pedidos/:id/notificar-despacho', verificarAdminJWT, async (req, res) => {
  try {
    const idParam = String(req.params.id || '').trim();

    if (!idParam) {
      return res.status(400).json({ error: 'ID de pedido requerido.' });
    }

    const codigoSeguimientoRaw = req.body?.codigoSeguimiento;
    let codigoSeguimiento = null;

    // Solo string/number: evita persistir "[object Object]" u otros tipos inesperados.
    if (typeof codigoSeguimientoRaw === 'string' || typeof codigoSeguimientoRaw === 'number') {
      const sanitizado = String(codigoSeguimientoRaw).trim().slice(0, 120);
      if (codigoSeguimientoRaw !== '' && !sanitizado) {
        return res.status(400).json({ error: 'El código de seguimiento no es válido.' });
      }
      codigoSeguimiento = sanitizado || null;
    }
    // Objeto, boolean, array, etc. → se desestima (null).

    const pedidoExistente = mongoose.isValidObjectId(idParam)
      ? await Pedido.findById(idParam)
      : await Pedido.findOne({ id: idParam });

    if (!pedidoExistente) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const emailComprador = normalizarEmail(pedidoExistente.emailUsuario);
    const nombreComprador = String(pedidoExistente.cliente || '').trim();
    // Usar el código amigable visible en la UI (no el id interno de Mongo/documento).
    const numeroPedido = String(pedidoExistente.numeroPedido || '').trim();

    if (!emailComprador) {
      return res.status(400).json({ error: 'El pedido no tiene un email de comprador válido.' });
    }

    if (!numeroPedido) {
      return res.status(400).json({ error: 'El pedido no tiene un número de pedido válido.' });
    }

    const trackingParaMail = String(
      codigoSeguimiento || pedidoExistente.codigoSeguimiento || ''
    ).trim();
    const nombreTienda = await obtenerNombreTienda();

    // Primero el mail: si Brevo falla, el pedido sigue en listo_empaquetar y se puede reintentar.
    await enviarMailDespacho(
      emailComprador,
      nombreComprador,
      numeroPedido,
      nombreTienda,
      trackingParaMail || undefined
    );

    const actualizacion = { estado: 'despachado' };
    if (codigoSeguimiento) {
      actualizacion.codigoSeguimiento = codigoSeguimiento;
    }

    const pedido = await buscarPedidoParaActualizar(idParam, actualizacion);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    return res.status(200).json({
      ok: true,
      mensaje: `Notificación de despacho enviada a ${emailComprador}. El pedido ${numeroPedido} quedó marcado como despachado.`,
      pedido: formatearPedido(pedido),
    });
  } catch (error) {
    logError('ADMIN_NOTIFICAR_DESPACHO', error, {
      pedidoId: req.params?.id,
      admin: req.usuario?.email,
    });
    return res.status(500).json({ error: 'No se pudo notificar el despacho. Intentá nuevamente.' });
  }
});

/**
 * Etiqueta de envío imprimible (HTML).
 * Acepta JWT por Authorization Bearer o ?token= (necesario para window.open / Ctrl+P).
 */
function verificarAdminJWTEtiqueta(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    token = String(req.query?.token || '').trim() || null;
  }

  if (!token) {
    return res.status(401).send(htmlErrorEtiqueta('Acceso denegado. Se requiere autenticación de administrador.'));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    if (!payload || typeof payload !== 'object' || !payload.email || payload.rol !== 'admin') {
      return res.status(403).send(htmlErrorEtiqueta('Acceso denegado. Se requiere rol de administrador.'));
    }

    req.usuario = payload;
    next();
  } catch (error) {
    logError('JWT_ETIQUETA_ENVIO', error, { ruta: req.path });
    if (error?.name === 'TokenExpiredError') {
      return res.status(401).send(htmlErrorEtiqueta('Tu sesión expiró. Volvé a iniciar sesión en el panel.'));
    }
    return res.status(403).send(htmlErrorEtiqueta('Token inválido.'));
  }
}

function escapeHtmlEtiqueta(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Intenta separar calle / localidad / provincia / CP desde el texto libre de checkout. */
function parsearDireccionEnvio(direccionCruda) {
  const texto = String(direccionCruda || '').trim();
  if (!texto) {
    return { calle: '—', localidad: '—', provincia: '—', codigoPostal: '—' };
  }

  const cpMatch = texto.match(/\b(?:CP|C\.?P\.?)?:?\s*([A-Za-z]?\d{4}[A-Za-z]{0,3})\b/i)
    || texto.match(/\b([A-Za-z]\d{4}[A-Za-z]{3})\b/)
    || texto.match(/\b(\d{4})\b/);
  const codigoPostal = cpMatch ? String(cpMatch[1]).toUpperCase() : '—';

  let resto = texto;
  if (cpMatch) {
    resto = texto
      .replace(cpMatch[0], ' ')
      .replace(/\b(?:CP|C\.?P\.?)\b:?/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const partes = resto
    .split(/[,;|]+|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (partes.length >= 3) {
    return {
      calle: partes.slice(0, -2).join(', ') || '—',
      localidad: partes[partes.length - 2] || '—',
      provincia: partes[partes.length - 1] || '—',
      codigoPostal,
    };
  }

  if (partes.length === 2) {
    return {
      calle: partes[0],
      localidad: partes[1],
      provincia: '—',
      codigoPostal,
    };
  }

  return {
    calle: texto,
    localidad: '—',
    provincia: '—',
    codigoPostal,
  };
}

function htmlErrorEtiqueta(mensaje) {
  const msg = escapeHtmlEtiqueta(mensaje);
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Etiqueta de envío</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; color: #111; }
  </style>
</head>
<body>
  <p>${msg}</p>
</body>
</html>`;
}

/** Prioriza campos estructurados; cae al parser para pedidos viejos (solo texto libre). */
function obtenerDireccionEtiqueta(pedido) {
  const calle = String(pedido.direccion || '').trim();
  const localidad = String(pedido.localidad || '').trim();
  const provincia = String(pedido.provincia || '').trim();
  const codigoPostal = String(pedido.codigoPostal || '').trim();

  if (localidad || provincia || codigoPostal) {
    return {
      calle: calle || '—',
      localidad: localidad || '—',
      provincia: provincia || '—',
      codigoPostal: codigoPostal || '—',
    };
  }

  return parsearDireccionEnvio(calle);
}

function construirHtmlEtiquetaEnvio(pedido, nombreTienda) {
  const tienda = escapeHtmlEtiqueta(nombreTienda || 'Fútbol Global Store');
  const numero = escapeHtmlEtiqueta(pedido.numeroPedido || pedido.id || '—');
  const nombre = escapeHtmlEtiqueta(String(pedido.cliente || '').trim() || '—');
  const telefono = escapeHtmlEtiqueta(String(pedido.telefono || '').trim() || '—');
  const direccionParseada = obtenerDireccionEtiqueta(pedido);
  const calle = escapeHtmlEtiqueta(direccionParseada.calle);
  const localidad = escapeHtmlEtiqueta(direccionParseada.localidad);
  const provincia = escapeHtmlEtiqueta(direccionParseada.provincia);
  const codigoPostal = escapeHtmlEtiqueta(direccionParseada.codigoPostal);

  const items = (pedido.productos || []).map((item) => {
    const producto = item.producto || {};
    const nombreProducto = typeof producto === 'string'
      ? producto
      : (producto.nombre || 'Producto');
    const talle = typeof producto === 'object' && producto.talle
      ? ` - Talle ${producto.talle}`
      : '';
    const cantidad = Number(item.cantidad) || 1;
    return `<li>${escapeHtmlEtiqueta(`${cantidad}x ${nombreProducto}${talle}`)}</li>`;
  }).join('');

  const detallePaquete = items || '<li>Sin ítems</li>';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Etiqueta #${numero} — ${tienda}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    @page {
      size: 100mm 150mm;
      margin: 0;
    }

    html, body {
      width: 100mm;
      min-height: 150mm;
      background: #e8e8e8;
      font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      color: #111;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .toolbar {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 10;
      display: flex;
      gap: 8px;
    }

    .toolbar button {
      font: 600 13px/1 inherit;
      padding: 10px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      background: #111;
      color: #fff;
    }

    .toolbar button:hover { background: #333; }

    .label {
      width: 100mm;
      height: 150mm;
      margin: 16px auto;
      padding: 8mm 7mm 6mm;
      background: #fff;
      border: 1px solid #ccc;
      display: flex;
      flex-direction: column;
      gap: 5mm;
    }

    .label__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 4mm;
      padding-bottom: 4mm;
      border-bottom: 2px solid #111;
    }

    .label__store {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      line-height: 1.2;
      max-width: 58%;
    }

    .label__order {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .label__to {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 2mm;
    }

    .label__name {
      font-size: 20px;
      font-weight: 800;
      line-height: 1.15;
      margin-bottom: 3mm;
      word-break: break-word;
    }

    .label__fields {
      display: grid;
      gap: 2.5mm;
      flex: 1;
    }

    .label__row {
      display: grid;
      grid-template-columns: 28mm 1fr;
      gap: 2mm;
      align-items: start;
      font-size: 12px;
      line-height: 1.35;
    }

    .label__row dt {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #666;
      padding-top: 1px;
    }

    .label__row dd {
      font-weight: 600;
      word-break: break-word;
    }

    .label__package {
      margin-top: auto;
      padding: 3.5mm;
      border: 1.5px solid #111;
      border-radius: 2px;
    }

    .label__package-title {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 2mm;
    }

    .label__package ul {
      list-style: none;
      font-size: 11px;
      line-height: 1.45;
      font-weight: 500;
    }

    .label__package li + li { margin-top: 1mm; }

    @media print {
      html, body {
        width: 100mm;
        height: 150mm;
        min-height: 0;
        margin: 0;
        padding: 0;
        background: #fff;
      }

      .toolbar { display: none !important; }

      .label {
        margin: 0;
        border: none;
        width: 100mm;
        height: 150mm;
        page-break-after: avoid;
        page-break-inside: avoid;
      }
    }

    @media screen {
      body { padding-bottom: 24px; }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.print()">Imprimir etiqueta</button>
  </div>

  <article class="label" aria-label="Etiqueta de envío">
    <header class="label__header">
      <div class="label__store">${tienda}</div>
      <div class="label__order">#${numero}</div>
    </header>

    <section>
      <p class="label__to">Destinatario</p>
      <h1 class="label__name">${nombre}</h1>
      <dl class="label__fields">
        <div class="label__row">
          <dt>Teléfono</dt>
          <dd>${telefono}</dd>
        </div>
        <div class="label__row">
          <dt>Dirección</dt>
          <dd>${calle}</dd>
        </div>
        <div class="label__row">
          <dt>Localidad</dt>
          <dd>${localidad}</dd>
        </div>
        <div class="label__row">
          <dt>Provincia</dt>
          <dd>${provincia}</dd>
        </div>
        <div class="label__row">
          <dt>Cód. Postal</dt>
          <dd>${codigoPostal}</dd>
        </div>
      </dl>
    </section>

    <footer class="label__package">
      <p class="label__package-title">Detalle del paquete</p>
      <ul>${detallePaquete}</ul>
    </footer>
  </article>
</body>
</html>`;
}

app.get('/api/admin/pedidos/:id/etiqueta-envio', verificarAdminJWTEtiqueta, async (req, res) => {
  try {
    const idParam = String(req.params.id || '').trim();

    if (!idParam) {
      return res.status(400).send(htmlErrorEtiqueta('ID de pedido requerido.'));
    }

    const pedido = mongoose.isValidObjectId(idParam)
      ? await Pedido.findById(idParam)
      : await Pedido.findOne({
          $or: [{ id: idParam }, { numeroPedido: idParam }],
        });

    if (!pedido) {
      return res.status(404).send(htmlErrorEtiqueta('Pedido no encontrado.'));
    }

    const nombreTienda = await obtenerNombreTienda();
    const html = construirHtmlEtiquetaEnvio(pedido, nombreTienda || 'Fútbol Global Store');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(html);
  } catch (error) {
    logError('ADMIN_ETIQUETA_ENVIO', error, {
      pedidoId: req.params?.id,
      admin: req.usuario?.email,
    });
    return res.status(500).send(htmlErrorEtiqueta('No se pudo generar la etiqueta de envío.'));
  }
});

// ── Contacto ──

app.post('/api/contacto', limitadorContacto, async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim();
    const email = normalizarEmail(req.body?.email);
    const mensaje = String(req.body?.mensaje || '').trim();

    if (!nombre || !email || !mensaje) {
      return res.status(400).json({ error: 'Nombre, email y mensaje son obligatorios.' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'El formato del email no es válido.' });
    }

    const adminEmail = normalizarEmail(process.env.ADMIN_INICIAL_EMAIL);

    if (!adminEmail) {
      return res.status(503).json({ error: 'El formulario de contacto no está disponible en este momento.' });
    }

    const nombreTienda = await obtenerNombreTienda();

    await enviarMensajeContacto({
      nombre,
      email,
      mensaje,
      adminEmail,
      nombreTienda,
    });

    res.json({ ok: true, mensaje: 'Mensaje enviado correctamente.' });
  } catch (error) {
    console.error('Error al enviar mensaje de contacto:', error);
    res.status(503).json({ error: 'No se pudo enviar el mensaje. Intentá nuevamente más tarde.' });
  }
});

// ── Autenticación ──

app.post('/api/auth/registro', limitadorAuth, async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'El formato del email no es válido.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    const usuarioExistente = await Usuario.findOne({ email });

    if (usuarioExistente?.verificado) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
    }

    // Libera emails de registros incompletos del flujo anterior (Usuario sin verificar).
    if (usuarioExistente && !usuarioExistente.verificado) {
      await Usuario.deleteOne({ _id: usuarioExistente._id });
    }

    const codigoVerificacion = generarCodigoVerificacion();
    const codigoVerificacionExpira = generarExpiracionCodigo(10);
    const passwordHasheada = await bcrypt.hash(password, 10);

    // 1) Persistir pendiente ANTES de enviar el mail (rollback si el envío falla).
    await RegistroPendiente.findOneAndUpdate(
      { email },
      {
        email,
        password: passwordHasheada,
        codigoVerificacion,
        codigoVerificacionExpira,
        creadoEn: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // 2) await obligatorio: no devolver 201 si Nodemailer/Brevo falló.
    try {
      const nombreTienda = await obtenerNombreTienda();
      await enviarCodigoVerificacion(email, codigoVerificacion, nombreTienda);
    } catch (mailError) {
      await RegistroPendiente.deleteOne({ email });
      logError('EMAIL_VERIFICACION_REGISTRO', mailError, {
        email,
        code: mailError?.code,
        command: mailError?.command,
        response: mailError?.response,
        responseCode: mailError?.responseCode,
      });
      return res.status(503).json({
        error: 'No se pudo enviar el código de verificación. Intentá nuevamente.',
      });
    }

    res.status(201).json({
      ok: true,
      mensaje: 'Registro iniciado. Revisá tu correo para obtener el código de verificación.',
      email,
    });
  } catch (error) {
    logError('AUTH_REGISTRO', error, { email: normalizarEmail(req.body?.email) });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/confirmar', limitadorOtp, async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const codigo = String(req.body.codigo || '').trim();

    if (!email || !codigo) {
      return res.status(400).json({ error: 'Email y código son requeridos.' });
    }

    const usuarioExistente = await Usuario.findOne({ email });

    if (usuarioExistente?.verificado) {
      return res.status(409).json({
        error: 'Esta cuenta ya se encuentra verificada. Por favor, iniciá sesión directamente.',
      });
    }

    const pendiente = await RegistroPendiente.findOne({ email });

    if (!pendiente) {
      return res.status(401).json({ error: 'Código inválido o expirado.' });
    }

    // Comparación en tiempo constante: evita filtrar bytes correctos por timing.
    const bufEsperado = Buffer.from(String(pendiente.codigoVerificacion), 'utf8');
    const bufRecibido = Buffer.from(codigo, 'utf8');
    const codigoValido =
      bufEsperado.length === bufRecibido.length &&
      crypto.timingSafeEqual(bufEsperado, bufRecibido);
    const noExpirado =
      pendiente.codigoVerificacionExpira && pendiente.codigoVerificacionExpira > new Date();

    if (!codigoValido || !noExpirado) {
      return res.status(401).json({ error: 'Código inválido o expirado.' });
    }

    let usuario;

    try {
      usuario = await new Usuario({
        email: pendiente.email,
        password: pendiente.password,
        rol: 'cliente',
        verificado: true,
      }).save();
    } catch (createError) {
      if (createError?.code === 11000) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese email.' });
      }
      throw createError;
    }

    await RegistroPendiente.deleteOne({ _id: pendiente._id });

    setImmediate(async () => {
      try {
        const nombreTienda = await obtenerNombreTienda();
        await enviarBienvenida(email, nombreTienda);
      } catch (mailError) {
        logError('EMAIL_BIENVENIDA', mailError, { email });
      }
    });

    const token = generarTokenCliente(usuario);
    return res.json({
      token,
      usuario: sanitizarUsuario(usuario),
    });
  } catch (error) {
    logError('AUTH_CONFIRMAR', error, { email: normalizarEmail(req.body?.email) });
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', limitadorAuth, async (req, res) => {
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

    if (req.body.localidad !== undefined) {
      usuario.localidad = String(req.body.localidad || '').trim().slice(0, 120);
    }

    if (req.body.provincia !== undefined) {
      usuario.provincia = String(req.body.provincia || '').trim().slice(0, 80);
    }

    if (req.body.codigoPostal !== undefined) {
      usuario.codigoPostal = String(req.body.codigoPostal || '').trim().toUpperCase().slice(0, 12);
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

    if (passwordNueva.length < 8) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
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

    await verificarConexionSmtp();

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
    console.log('  Jersey Store');
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
