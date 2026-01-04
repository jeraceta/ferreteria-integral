# 🔨 Sistema de Gestión de Ferretería

Sistema completo de gestión para una ferretería desarrollado como trabajo de grado para la Universidad de Oriente de Venezuela.

## 📋 Descripción

Este sistema permite gestionar:
- **Inventario de productos** (stock, precios, códigos)
- **Ventas** (facturación, clientes, cálculos automáticos)
- **Compras** (registro de compras a proveedores)
- **Clientes** (registro y gestión)
- **Reportes** (ganancias, stock crítico, productos más vendidos)
- **Usuarios** (sistema de roles: gerente y vendedor)

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js** - Entorno de ejecución
- **Express.js** - Framework web
- **MySQL** - Base de datos
- **JWT (JSON Web Tokens)** - Autenticación
- **bcrypt** - Encriptación de contraseñas

### Frontend
- *En desarrollo*

## 📁 Estructura del Proyecto

```
Sistema Ferreteria/
├── Backend/
│   ├── index.js                 # Servidor principal
│   ├── db.js                    # Configuración de base de datos
│   ├── database.js              # Funciones de consulta
│   ├── routers/                 # Rutas de la API
│   │   ├── inventario.routes.js
│   │   ├── clientes.routes.js
│   │   ├── ventas.routes.js
│   │   └── compras.routes.js
│   ├── controllers/            # Lógica de negocio
│   │   ├── inventario.controller.js
│   │   ├── clientes.controller.js
│   │   └── ventas.controller.js
│   └── middlewares/
│       └── auth.middleware.js   # Autenticación y autorización
├── Frontend/
│   └── (En desarrollo)
└── setup_database.sql           # Script de creación de base de datos
```

## 🚀 Instalación y Configuración

### Requisitos Previos
- Node.js (versión 14 o superior)
- MySQL (versión 5.7 o superior)
- npm (viene con Node.js)

### Paso 1: Clonar o descargar el proyecto

### Paso 2: Configurar la Base de Datos

1. Abre MySQL (Workbench o línea de comandos)
2. Ejecuta el script `Backend/setup_database.sql`
3. Esto creará la base de datos `ferreteria` con todas las tablas necesarias

### Paso 3: Configurar el Backend

1. Abre una terminal en la carpeta `Backend`
2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Verifica la configuración de la base de datos en `Backend/db.js`:
   ```javascript
   host: 'localhost',
   user: 'root',
   password: 'tu_contraseña',  // Cambia esto
   database: 'ferreteria',
   port: 3306
   ```

### Paso 4: Iniciar el Servidor

```bash
cd Backend
npm start
# o para desarrollo con auto-reload:
npm run dev
```

El servidor estará disponible en: `http://localhost:3000`

## 📡 API Endpoints

### Autenticación
- `POST /api/inventario/login` - Iniciar sesión

### Productos
- `GET /api/inventario/productos` - Listar todos los productos
- `POST /api/inventario/producto` - Crear nuevo producto

### Clientes
- `GET /api/clientes` - Listar todos los clientes
- `POST /api/clientes` - Crear nuevo cliente

### Ventas
- `POST /api/ventas/facturar` - Procesar una venta

### Compras
- `POST /api/compras/comprar` - Registrar una compra

### Reportes (requieren rol de gerente)
- `GET /api/inventario/stock-critico` - Productos con stock bajo
- `GET /api/inventario/reporte-ganancias` - Ganancias del día
- `GET /api/inventario/reporte-top-productos` - Top 5 productos más vendidos

Para más detalles, ver `API_DOCUMENTATION.md`

## 🧪 Probar la API

### Usando Postman o similar:

1. **Login:**
   ```
   POST http://localhost:3000/api/inventario/login
   Body (JSON):
   {
     "username": "tu_usuario",
     "password": "tu_contraseña"
   }
   ```

2. **Obtener productos:**
   ```
   GET http://localhost:3000/api/inventario/productos
   ```

3. **Crear venta (con token):**
   ```
   POST http://localhost:3000/api/ventas/facturar
   Headers:
   Authorization: Bearer TU_TOKEN_AQUI
   Body (JSON):
   {
     "datosVenta": {
       "id_cliente": 1,
       "numero_factura": "FAC-001",
       "total_bruto": 100.00,
       "metodo_pago": "efectivo"
     },
     "detalle": [
       {
         "id_producto": 1,
         "cantidad": 2,
         "precio_unitario": 50.00
       }
     ]
   }
   ```

## 📊 Base de Datos

### Tablas Principales:
- `clientes` - Información de clientes
- `productos` - Catálogo de productos
- `ventas` - Cabecera de facturas de venta
- `detalle_venta` - Detalle de productos vendidos
- `compras` - Cabecera de facturas de compra
- `detalle_compra` - Detalle de productos comprados
- `movimientos_inventario` - Historial de movimientos de stock
- `usuarios` - Usuarios del sistema
- `proveedores` - Información de proveedores
- `depositos` - Almacenes/depósitos

## 🔐 Sistema de Autenticación

El sistema usa JWT (JSON Web Tokens) para autenticación:

1. El usuario hace login en `/api/inventario/login`
2. El servidor devuelve un token JWT
3. El cliente debe enviar este token en el header `Authorization: Bearer TOKEN` en cada petición protegida
4. El middleware `auth.middleware.js` verifica el token y el rol del usuario

### Roles:
- **gerente**: Acceso completo (reportes, gestión de usuarios)
- **vendedor**: Acceso limitado (ventas, consultas básicas)

## 📝 Scripts Útiles

### Ver el contenido de la base de datos:
```bash
cd Backend
node view_database.js
```

### Probar conexión a la base de datos:
```bash
cd Backend
node testconnection.js
```

## 🐛 Solución de Problemas

### Error: "Cannot connect to MySQL"
- Verifica que MySQL esté corriendo
- Revisa las credenciales en `Backend/db.js`
- Asegúrate de que la base de datos `ferreteria` exista

### Error: "Port 3000 already in use"
- Cambia el puerto en `Backend/index.js` (línea 10)
- O cierra la aplicación que está usando el puerto 3000

### Error: "Module not found"
- Ejecuta `npm install` en la carpeta `Backend`

## 📚 Documentación Adicional

- `PLAN_PROYECTO.md` - Plan detallado de desarrollo
- `API_DOCUMENTATION.md` - Documentación completa de la API (por crear)

## 👨‍💻 Autor

Desarrollado como trabajo de grado para la Universidad de Oriente de Venezuela.

## 📄 Licencia

Este proyecto es parte de un trabajo académico.

---

**Estado del Proyecto:** Backend funcional, Frontend en desarrollo


