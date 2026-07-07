require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');

const app = express();
const PORT = 3000;
const ADMIN_EMAIL = 'admin@comercio.com';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fieldSize: 15 * 1024 * 1024, fileSize: 15 * 1024 * 1024 },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

const productoSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  nombre: { type: String, required: true },
  precio: { type: Number, required: true },
  precioOferta: { type: Number, default: null },
  categoria: { type: String, required: true },
  genero: {
    type: String,
    required: true,
    enum: GENEROS_PERMITIDOS,
    default: 'hombre',
  },
  img: { type: String, required: true },
  stock: { type: Number, required: true, default: 10, min: 0 },
  talles: { type: [String], default: () => [...TALLES_DEFECTO] },
  descripcion: { type: String, default: '' },
});

productoSchema.pre('save', function () {
  if (!this.id) {
    this.id = Date.now();
  }
});

const pedidoSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  cliente: { type: String, required: true },
  telefono: { type: String, required: true },
  direccion: { type: String, default: '' },
  pago: { type: String, default: 'Efectivo' },
  productos: [productoItemPedidoSchema],
  total: { type: Number, default: 0 },
  estado: { type: String, default: 'Pendiente' },
  fecha: { type: Date, default: Date.now },
});

const usuarioSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  rol: { type: String, default: 'cliente' },
  verificado: { type: Boolean, default: false },
  codigoVerificacion: { type: String },
});

const Producto = mongoose.model('Producto', productoSchema);
const Pedido = mongoose.model('Pedido', pedidoSchema);
const Usuario = mongoose.model('Usuario', usuarioSchema);

const seccionSchema = new mongoose.Schema({
  id: { type: Number, unique: true },
  nombre: { type: String, required: true, unique: true, trim: true },
});

seccionSchema.pre('save', function () {
  if (!this.id) {
    this.id = Date.now();
  }
});

const Seccion = mongoose.model('Seccion', seccionSchema);

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
    img: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Remera',
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
    img: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Campera',
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
    img: 'https://placehold.co/600x800/f5f5f5/1a1a1a?text=Pantalón',
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

function generarCodigoVerificacion() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function sanitizarUsuario(usuario) {
  const datos = usuario.toObject ? usuario.toObject() : usuario;

  return {
    email: datos.email,
    rol: datos.rol,
    activo: datos.verificado,
  };
}

function normalizarStock(stock) {
  const valor = Number(stock);
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.floor(valor);
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

function formatearSeccion(seccion) {
  const datos = seccion.toObject ? seccion.toObject() : seccion;

  return {
    id: datos.id,
    nombre: datos.nombre,
  };
}

function formatearProducto(producto) {
  const datos = producto.toObject ? producto.toObject() : producto;
  const precioOferta = normalizarPrecioOferta(datos.precioOferta, datos.precio);

  return {
    id: datos.id,
    nombre: datos.nombre,
    precio: datos.precio,
    precioOferta,
    categoria: datos.categoria,
    genero: normalizarGenero(datos.genero),
    imagen: datos.img,
    stock: normalizarStock(datos.stock ?? 10),
    talles: normalizarTalles(datos.talles),
    descripcion: String(datos.descripcion || '').trim(),
  };
}

function formatearItemPedido(item) {
  const producto = item.producto || {};

  return {
    id: producto.id,
    nombre: producto.nombre || producto,
    talle: producto.talle || null,
    precio: item.precio,
    imagen: producto.imagen,
    cantidad: item.cantidad,
  };
}

function formatearPedido(pedido) {
  const datos = pedido.toObject ? pedido.toObject() : pedido;

  return {
    id: datos.id,
    cliente: {
      nombre: datos.cliente,
      telefono: datos.telefono,
      direccion: datos.direccion,
    },
    productos: (datos.productos || []).map(formatearItemPedido),
    total: datos.total,
    metodoPago: datos.pago,
    fecha: datos.fecha instanceof Date ? datos.fecha.toISOString() : datos.fecha,
    estado: datos.estado,
  };
}

async function asegurarAdminInicial() {
  const adminExistente = await Usuario.findOne({ email: ADMIN_EMAIL });

  if (!adminExistente) {
    await new Usuario({
      email: ADMIN_EMAIL,
      password: 'admin',
      rol: 'admin',
      verificado: true,
    }).save();
  }
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

function resolverImagenProducto(req) {
  if (req.file?.buffer) {
    const mimeType = req.file.mimetype || 'image/jpeg';
    const base64 = req.file.buffer.toString('base64');
    return `data:${mimeType};base64,${base64}`;
  }

  return String(req.body?.imagen || '').trim();
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

app.post('/api/secciones', async (req, res) => {
  try {
    const nombreLimpio = String(req.body?.nombre || '').trim();

    if (!nombreLimpio) {
      return res.status(400).json({ error: 'El nombre de la sección es obligatorio.' });
    }

    const existe = await Seccion.findOne({
      nombre: { $regex: new RegExp(`^${nombreLimpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });

    if (existe) {
      return res.status(400).json({ error: 'Ya existe una sección con ese nombre.' });
    }

    const nuevaSeccion = await new Seccion({ nombre: nombreLimpio }).save();
    res.status(201).json(formatearSeccion(nuevaSeccion));
  } catch (error) {
    console.error('Error al crear sección:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/secciones/:id', async (req, res) => {
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

app.get('/api/productos', async (_req, res) => {
  try {
    let productos = await Producto.find();

    if (productos.length === 0) {
      productos = await Producto.insertMany(PRODUCTOS_BASE);
    }

    res.json(productos.map(formatearProducto));
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/productos', (req, res, next) => {
  upload.single('imagen')(req, res, (error) => {
    if (error) {
      console.error('Error detallado:', error);
      return res.status(400).json({ error: 'No se pudo procesar la imagen del producto.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const stock = parseInt(req.body.stock, 10) || 0;
    const talles = parsearTallesDesdeBody(req.body.talles);
    const { nombre, precio, precioOferta, categoria, genero, descripcion } = req.body;
    const imagen = resolverImagenProducto(req);
    const categoriaNombre = await resolverCategoriaProducto(categoria);

    if (!nombre || !categoriaNombre || !imagen || !precio || Number(precio) <= 0) {
      return res.status(400).json({ error: 'Datos de producto incompletos o inválidos.' });
    }

    const precioNumerico = Number(precio);

    const nuevoProducto = await new Producto({
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: normalizarPrecioOferta(precioOferta, precioNumerico),
      categoria: categoriaNombre,
      genero: normalizarGenero(genero),
      img: imagen,
      stock: normalizarStock(stock ?? 10),
      talles: normalizarTalles(talles),
      descripcion: String(descripcion || '').trim(),
    }).save();

    res.status(201).json(formatearProducto(nuevoProducto));
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.put('/api/productos/:id', (req, res, next) => {
  upload.single('imagen')(req, res, (error) => {
    if (error) {
      console.error('Error detallado:', error);
      return res.status(400).json({ error: 'No se pudo procesar la imagen del producto.' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const stock = parseInt(req.body.stock, 10) || 0;
    const talles = parsearTallesDesdeBody(req.body.talles);
    const { nombre, precio, precioOferta, categoria, genero, descripcion } = req.body;
    const imagen = resolverImagenProducto(req);
    const categoriaNombre = await resolverCategoriaProducto(categoria);

    if (!nombre || !categoriaNombre || !imagen || !precio || Number(precio) <= 0) {
      return res.status(400).json({ error: 'Datos de producto incompletos o inválidos.' });
    }

    const precioNumerico = Number(precio);

    const actualizado = await buscarProductoParaActualizar(req.params.id, {
      nombre: String(nombre).trim(),
      precio: precioNumerico,
      precioOferta: normalizarPrecioOferta(precioOferta, precioNumerico),
      categoria: categoriaNombre,
      genero: normalizarGenero(genero),
      img: imagen,
      stock: normalizarStock(stock),
      talles: normalizarTalles(talles),
      descripcion: String(descripcion || '').trim(),
    });

    if (!actualizado) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(formatearProducto(actualizado));
  } catch (error) {
    console.error('Error detallado:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
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

app.get('/api/pedidos', async (_req, res) => {
  try {
    const pedidos = await Pedido.find().sort({ fecha: -1 });
    res.json(pedidos.map(formatearPedido));
  } catch (error) {
    console.error('Error al obtener pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/pedidos', async (req, res) => {
  try {
    const { cliente, productos: items, total, metodoPago } = req.body;

    if (!cliente?.nombre || !cliente?.telefono || !items?.length) {
      return res.status(400).json({ error: 'Datos del pedido incompletos.' });
    }

    const cantidadesPorProducto = items.reduce((acumulado, item) => {
      const productoId = Number(item.id);
      if (!Number.isFinite(productoId)) return acumulado;
      acumulado[productoId] = (acumulado[productoId] || 0) + Number(item.cantidad || 0);
      return acumulado;
    }, {});

    for (const [productoId, cantidad] of Object.entries(cantidadesPorProducto)) {
      const producto = await Producto.findOne({ id: Number(productoId) });

      if (!producto) {
        return res.status(400).json({ error: 'Uno de los productos del pedido ya no existe.' });
      }

      if (producto.stock < cantidad) {
        return res.status(400).json({
          error: `Stock insuficiente para «${producto.nombre}». Disponible: ${producto.stock}.`,
        });
      }
    }

    const nuevoPedido = await new Pedido({
      id: generarIdPedido(),
      cliente: String(cliente.nombre).trim(),
      telefono: String(cliente.telefono).trim(),
      direccion: String(cliente.direccion || '').trim(),
      pago: metodoPago || 'Efectivo',
      productos: items.map((item) => ({
        producto: item,
        cantidad: item.cantidad,
        precio: item.precio,
      })),
      total: Number(total) || 0,
      estado: 'Pendiente',
      fecha: new Date(),
    }).save();

    await Promise.all(
      Object.entries(cantidadesPorProducto).map(([productoId, cantidad]) =>
        Producto.findOneAndUpdate(
          { id: Number(productoId) },
          { $inc: { stock: -cantidad } }
        )
      )
    );

    res.status(201).json(formatearPedido(nuevoPedido));
  } catch (error) {
    console.error('Error al crear pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/pedidos/cambiar-estado', async (req, res) => {
  try {
    const { id, nuevoEstado } = req.body;

    if (!id || !nuevoEstado) {
      return res.status(400).json({ error: 'ID y nuevo estado son requeridos.' });
    }

    const pedido = await buscarPedidoParaActualizar(id, { estado: nuevoEstado });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    res.json({ ok: true, pedido: formatearPedido(pedido) });
  } catch (error) {
    console.error('Error al cambiar estado del pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
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

    const nuevoUsuario = await new Usuario({
      email,
      password,
      rol: 'cliente',
      verificado: false,
      codigoVerificacion,
    }).save();

    res.status(201).json({
      usuario: sanitizarUsuario(nuevoUsuario),
      codigoVerificacion,
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/confirmar', async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const usuario = await Usuario.findOne({ email });

    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    usuario.verificado = true;
    usuario.rol = email === normalizarEmail(ADMIN_EMAIL) ? 'admin' : usuario.rol;
    usuario.codigoVerificacion = undefined;
    await usuario.save();

    res.json({ usuario: sanitizarUsuario(usuario) });
  } catch (error) {
    console.error('Error al confirmar usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = normalizarEmail(req.body.email);
    const password = String(req.body.password || '');

    const usuario = await Usuario.findOne({ email, password });

    if (!usuario) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    if (!usuario.verificado) {
      return res.status(403).json({ error: 'Cuenta no verificada. Completá el registro primero.' });
    }

    res.json({ usuario: sanitizarUsuario(usuario) });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

async function iniciarServidor() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conexión a MongoDB exitosa');

    await asegurarAdminInicial();

    app.listen(PORT, () => {
      console.log(`Servidor Atelier corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Error al conectar con MongoDB:', error);
    process.exit(1);
  }
}

iniciarServidor();
