# Atelier — Boutique Premium

Tienda online de ropa con catálogo, carrito de compras, seguimiento de pedidos y panel de administración.

## Características

- Catálogo de productos con filtros por categoría y género
- Carrito de compras y checkout con WhatsApp
- Registro e inicio de sesión de clientes
- Panel de administración (productos, pedidos, secciones)
- API REST con Express y MongoDB

## Estructura del proyecto

```
├── public/          # Frontend (HTML, CSS, JavaScript)
│   ├── css/
│   ├── js/
│   └── index.html
├── server/          # Backend (Express + MongoDB)
│   ├── server.js
│   ├── package.json
│   └── .env         # Variables de entorno (no incluido en el repo)
└── package.json     # Scripts de inicio desde la raíz
```

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior
- Cuenta en [MongoDB Atlas](https://www.mongodb.com/atlas) (o MongoDB local)

## Instalación

1. Clonar el repositorio:

   ```bash
   git clone https://github.com/francrovo-0123/atelier-boutique.git
   cd atelier-boutique
   ```

2. Instalar dependencias del servidor:

   ```bash
   cd server
   npm install
   ```

3. Configurar variables de entorno:

   ```bash
   cp .env.example .env
   ```

   Editar `.env` y agregar tu cadena de conexión de MongoDB:

   ```
   MONGO_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/atelier
   ```

4. Iniciar el servidor:

   ```bash
   npm start
   ```

5. Abrir en el navegador: [http://localhost:3000](http://localhost:3000)

## Credenciales de administrador

Al iniciar por primera vez se crea un usuario administrador:

| Campo      | Valor               |
|------------|---------------------|
| Email      | `admin@comercio.com` |
| Contraseña | `admin`             |

> Cambiá la contraseña del administrador en producción.

## API

| Método | Ruta                        | Descripción              |
|--------|-----------------------------|--------------------------|
| GET    | `/api/productos`            | Listar productos         |
| POST   | `/api/productos`            | Crear producto           |
| PUT    | `/api/productos/:id`        | Actualizar producto      |
| DELETE | `/api/productos/:id`        | Eliminar producto        |
| GET    | `/api/secciones`            | Listar categorías        |
| GET    | `/api/pedidos`              | Listar pedidos           |
| POST   | `/api/pedidos`              | Crear pedido             |
| POST   | `/api/auth/registro`        | Registrar usuario        |
| POST   | `/api/auth/login`           | Iniciar sesión           |

## Tecnologías

- **Frontend:** HTML5, CSS3, JavaScript (vanilla)
- **Backend:** Node.js, Express 5, Mongoose
- **Base de datos:** MongoDB

## Licencia

Proyecto privado. Todos los derechos reservados.
