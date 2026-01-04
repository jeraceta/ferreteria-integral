# 📡 Documentación de la API - Sistema de Ferretería

## 🔗 Base URL
```
http://localhost:3000
```

## 🔐 Autenticación

La mayoría de los endpoints requieren autenticación mediante JWT (JSON Web Token).

**Formato del header:**
```
Authorization: Bearer TU_TOKEN_AQUI
```

**Niveles de acceso:**
- 🔓 **Público**: No requiere autenticación
- 🔒 **Autenticado**: Requiere token válido (cualquier usuario: gerente o vendedor)
- 👔 **Gerente**: Requiere token válido con rol de gerente

---

## 📋 ENDPOINTS DISPONIBLES

### 🔑 AUTENTICACIÓN

#### `POST /api/inventario/login`
Iniciar sesión en el sistema.

**Request Body:**
```json
{
  "username": "nombre_usuario",
  "password": "contraseña"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "mensaje": "¡Bienvenido(a) Nombre Usuario!",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "username": "nombre_usuario",
    "nombre": "Nombre Usuario",
    "rol": "gerente"
  }
}
```

**Response (401 Unauthorized):**
```json
{
  "success": false,
  "error": "Credenciales incorrectas"
}
```

---

### 📦 PRODUCTOS

#### `GET /api/inventario/productos`
Obtener todos los productos.

**No requiere autenticación**

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "codigo": "HER-001",
    "nombre": "Martillo Galponero 20oz",
    "descripcion": null,
    "stock": 50,
    "precio_venta": "15.50",
    "precio_costo": "9.20",
    "fecha_creacion": "2025-12-17T20:50:58.000Z",
    "fecha_modificacion": "2025-12-18T22:37:42.000Z"
  }
]
```

#### `POST /api/inventario/producto`
Crear un nuevo producto.

**🔒 Requiere autenticación** (cualquier usuario autenticado)

**Request Body:**
```json
{
  "codigo": "CL-002",
  "nombre": "Clavos de Acero 3 Pulgadas",
  "descripcion": "Clavos de acero inoxidable",
  "stock": 100,
  "precio_venta": 5.00,
  "precio_costo": 2.50
}
```

**Response (201 Created):**
```json
{
  "mensaje": "Producto creado con éxito",
  "producto": {
    "id": 2,
    "codigo": "CL-002",
    "nombre": "Clavos de Acero 3 Pulgadas",
    ...
  }
}
```

#### `GET /api/inventario/kardex/:id_producto`
Obtener el historial completo de movimientos (Kardex) de un producto específico.

**🔒 Requiere autenticación** (cualquier usuario autenticado)

**Parámetros de URL:**
- `id_producto` (requerido): ID del producto

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "producto": {
      "id": 1,
      "codigo": "HER-001",
      "nombre": "Martillo Galponero 20oz",
      "precio_venta": "15.50",
      "precio_costo": "9.20"
    },
    "stock_actual": 50,
    "total_movimientos": 5,
    "movimientos": [
      {
        "id": 1,
        "tipo_movimiento": "COMPRA",
        "cantidad": 100,
        "fecha_movimiento": "2025-12-01T10:00:00.000Z",
        "referencia_id": 1,
        "referencia_tabla": "compras",
        "comentario": "Entrada por factura: FAC-001",
        "descripcion": "Compra #1 - Proveedor: Proveedor Principal S.A.",
        "tipo_operacion": "ENTRADA",
        "stock_antes": 0,
        "stock_despues": 100
      },
      {
        "id": 2,
        "tipo_movimiento": "VENTA",
        "cantidad": -50,
        "fecha_movimiento": "2025-12-15T14:30:00.000Z",
        "referencia_id": 1,
        "referencia_tabla": "ventas",
        "comentario": "Venta #1",
        "descripcion": "Venta #1 - Cliente: FERRETERIA EL MARTILLO C.A.",
        "tipo_operacion": "SALIDA",
        "stock_antes": 100,
        "stock_despues": 50
      }
    ]
  }
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Producto con ID 999 no encontrado."
}
```

---

### 👥 CLIENTES

#### `GET /api/clientes`
Obtener todos los clientes.

**🔒 Requiere autenticación** (cualquier usuario autenticado)

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "tipo_documento": "J",
    "rif_cedula": "V201234567",
    "razon_social": "FERRETERIA EL MARTILLO C.A.",
    "direccion_fiscal": "Calle 4, Galpón 12",
    "telefono": "0281-2223344",
    "email": "ventas@elmartillo.com",
    "tipo_contribuyente": "ESPECIAL",
    "fecha_registro": "2025-12-18T17:38:56.000Z"
  }
]
```

#### `POST /api/clientes`
Crear un nuevo cliente.

**🔒 Requiere autenticación** (cualquier usuario autenticado)

**Request Body:**
```json
{
  "tipo_documento": "V",
  "rif_cedula": "V-12345678",
  "razon_social": "Juan Pérez",
  "direccion_fiscal": "Calle Principal #123",
  "telefono": "0412-1234567",
  "email": "juan@email.com",
  "tipo_contribuyente": "ORDINARIO"
}
```

**Response (201 Created):**
```json
{
  "id": 2,
  "tipo_documento": "V",
  "rif_cedula": "V-12345678",
  "razon_social": "Juan Pérez",
  ...
}
```

---

### 🛒 COMPRAS (Inventario)

#### `POST /api/inventario/compra`
Registrar una compra a proveedor (endpoint alternativo).

**👔 Requiere autenticación con rol GERENTE** (solo gerentes pueden registrar compras)

**Request Body:**
```json
{
  "datosCompra": {
    "id_proveedor": 1,
    "numero_factura_proveedor": "FAC-PROV-001",
    "total_neto": 200.00,
    "porcentaje_descuento": 0.00,
    "monto_descuento": 0.00,
    "costo_antes_impuesto": 200.00,
    "impuestos_compra": 34.00,
    "total_bruto": 234.00,
    "metodo_pago": "transferencia"
  },
  "detalle": [
    {
      "id_producto": 1,
      "cantidad": 10,
      "costo_unitario": 20.00,
      "subtotal": 200.00
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "mensaje": "Compra procesada",
  "compraId": 1
}
```

---

### 💰 VENTAS

#### `POST /api/inventario/venta`
Procesar una venta (endpoint alternativo en inventario).

**🔒 Requiere autenticación** (cualquier usuario autenticado puede vender)

**Request Body:**
```json
{
  "datosVenta": {
    "id_cliente": 1,
    "numero_factura": "FAC-001",
    "total_neto": 100.00,
    "porcentaje_descuento": 5.00,
    "monto_descuento": 5.00,
    "total_antes_impuesto": 95.00,
    "impuestos": 16.15,
    "total_bruto": 111.15,
    "metodo_pago": "efectivo"
  },
  "detalle": [
    {
      "id_producto": 1,
      "cantidad": 2,
      "precio_unitario": 50.00,
      "subtotal": 100.00
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "ventaId": 1
}
```

#### `POST /api/ventas/facturar`
Procesar una venta (facturar).

**🔒 Requiere autenticación** (cualquier usuario autenticado puede vender)

**⚠️ VALIDACIÓN DE STOCK:**
- Por defecto, el sistema **NO permite** vender productos si no hay stock suficiente
- Puedes permitir stock negativo agregando `"permitirStockNegativo": true` en `datosVenta`
- Si se permite stock negativo, el sistema registrará la venta aunque el stock quede negativo

**Request Body:**
```json
{
  "datosVenta": {
    "id_cliente": 1,
    "numero_factura": "FAC-001",
    "total_neto": 100.00,
    "porcentaje_descuento": 5.00,
    "monto_descuento": 5.00,
    "total_antes_impuesto": 95.00,
    "impuestos": 16.15,
    "total_bruto": 111.15,
    "metodo_pago": "efectivo"
  },
  "detalle": [
    {
      "id_producto": 1,
      "cantidad": 2,
      "precio_unitario": 50.00,
      "subtotal": 100.00
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id_venta": 1,
  "mensaje": "Venta procesada exitosamente"
}
```

---

### 🛒 COMPRAS

#### `POST /api/compras/comprar`
Registrar una compra a proveedor.

**👔 Requiere autenticación con rol GERENTE** (solo gerentes pueden registrar compras)

**⚠️ IMPORTANTE:** Al registrar una compra, el sistema **actualiza automáticamente el precio_costo** del producto con el nuevo costo del proveedor. Esto permite reflejar cambios de precios automáticamente.

**Request Body:**
```json
{
  "datosCompra": {
    "id_proveedor": 1,
    "numero_factura_proveedor": "FAC-PROV-001",
    "total_neto": 200.00,
    "porcentaje_descuento": 0.00,
    "monto_descuento": 0.00,
    "costo_antes_impuesto": 200.00,
    "impuestos_compra": 34.00,
    "total_bruto": 234.00,
    "metodo_pago": "transferencia"
  },
  "detalle": [
    {
      "id_producto": 1,
      "cantidad": 10,
      "costo_unitario": 20.00,
      "subtotal": 200.00
    }
  ]
}
```

**Response (201 Created):**
```json
{
  "id_compra": 1,
  "mensaje": "Compra procesada exitosamente"
}
```

---

### 📊 REPORTES (Requieren rol de GERENTE)

#### `GET /api/inventario/stock-critico`
Obtener productos con stock bajo.

**🔒 Requiere autenticación** (cualquier usuario autenticado)

**Response (200 OK):**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 3,
      "codigo": "PIN-001",
      "nombre": "Esmalte Sintético Blanco",
      "stock": 0,
      "precio_venta": "38.50"
    }
  ]
}
```

#### `GET /api/inventario/reporte-ganancias`
Obtener reporte de ganancias del día.

**👔 Requiere autenticación con rol GERENTE**

**Headers:**
```
Authorization: Bearer TU_TOKEN_AQUI
```

**Response (200 OK):**
```json
{
  "success": true,
  "fecha_reporte": "2025-12-18",
  "data": {
    "total_ventas": 500.00,
    "total_costos": 300.00,
    "ganancia_neta": 200.00,
    "margen_ganancia": 40.00
  }
}
```

#### `GET /api/inventario/reporte-comisiones`
Obtener reporte de comisiones por vendedor.

**👔 Requiere autenticación con rol GERENTE**

**Query Parameters:**
- `inicio` (requerido): Fecha inicio (YYYY-MM-DD)
- `fin` (requerido): Fecha fin (YYYY-MM-DD)
- `porcentaje` (requerido): Porcentaje de comisión

**Ejemplo:**
```
GET /api/inventario/reporte-comisiones?inicio=2025-12-01&fin=2025-12-31&porcentaje=5
```

**Response (200 OK):**
```json
{
  "success": true,
  "periodo": {
    "desde": "2025-12-01",
    "hasta": "2025-12-31"
  },
  "data": [
    {
      "id_vendedor": 1,
      "nombre_vendedor": "Juan Pérez",
      "total_ventas_brutas": 1000.00,
      "porcentaje_aplicado": "5%",
      "comision_ganada": "50.00"
    }
  ]
}
```

#### `GET /api/inventario/reporte-top-productos`
Obtener top 5 productos más vendidos.

**👔 Requiere autenticación con rol GERENTE**

**Response (200 OK):**
```json
{
  "success": true,
  "mensaje": "Top 5 productos más vendidos",
  "data": [
    {
      "id_producto": 1,
      "nombre": "Martillo Galponero",
      "total_vendido": 150,
      "total_ingresos": 2325.00
    }
  ]
}
```

---

### 👤 GESTIÓN DE USUARIOS (Solo Gerentes)

#### `GET /api/inventario/usuarios`
Obtener lista de todos los usuarios.

**👔 Requiere autenticación con rol GERENTE**

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "admin",
      "nombre": "Administrador",
      "rol": "gerente",
      "created_at": "2025-12-01T10:00:00.000Z"
    }
  ]
}
```

#### `POST /api/inventario/usuarios`
Crear un nuevo usuario.

**👔 Requiere autenticación con rol GERENTE**

**Request Body:**
```json
{
  "username": "vendedor1",
  "password": "contraseña123",
  "nombre": "Juan Vendedor",
  "rol": "vendedor"
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "mensaje": "Usuario creado exitosamente",
  "data": {
    "id": 2,
    "username": "vendedor1",
    "nombre": "Juan Vendedor",
    "rol": "vendedor"
  }
}
```

#### `PUT /api/inventario/usuarios/:id`
Actualizar un usuario existente.

**👔 Requiere autenticación con rol GERENTE**

**Request Body:**
```json
{
  "nombre": "Juan Vendedor Actualizado",
  "rol": "gerente"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "mensaje": "Usuario actualizado correctamente"
}
```

#### `DELETE /api/inventario/usuarios/:id`
Eliminar un usuario.

**👔 Requiere autenticación con rol GERENTE**

**Response (200 OK):**
```json
{
  "success": true,
  "mensaje": "Usuario eliminado"
}
```

---

## ⚠️ CÓDIGOS DE ERROR COMUNES

| Código | Significado |
|--------|-------------|
| 200 | OK - Petición exitosa |
| 201 | Created - Recurso creado exitosamente |
| 400 | Bad Request - Datos inválidos |
| 401 | Unauthorized - No autenticado o credenciales inválidas |
| 403 | Forbidden - No tienes permisos (rol incorrecto) |
| 404 | Not Found - Recurso no encontrado |
| 500 | Internal Server Error - Error del servidor |

---

## 📝 NOTAS IMPORTANTES

1. **Tokens JWT**: Los tokens expiran después de 12 horas. Debes hacer login nuevamente después de ese tiempo.

2. **Roles del Sistema**:
   - `gerente`: Acceso completo a todas las funcionalidades
   - `vendedor`: Acceso limitado (principalmente ventas)

3. **Formato de Fechas**: El sistema usa formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)

4. **Formato de Moneda**: Los valores monetarios se manejan como DECIMAL en la base de datos y se devuelven como strings en JSON para mantener precisión.

5. **Stock**: El stock se actualiza automáticamente cuando se procesan ventas o compras.

---

## 🧪 EJEMPLOS DE USO CON CURL

### Login
```bash
curl -X POST http://localhost:3000/api/inventario/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"contraseña"}'
```

### Obtener productos (con token)
```bash
curl -X GET http://localhost:3000/api/inventario/productos \
  -H "Authorization: Bearer TU_TOKEN_AQUI"
```

### Crear venta
```bash
curl -X POST http://localhost:3000/api/ventas/facturar \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_AQUI" \
  -d '{
    "datosVenta": {
      "id_cliente": 1,
      "numero_factura": "FAC-001",
      "total_bruto": 100.00,
      "metodo_pago": "efectivo"
    },
    "detalle": [{
      "id_producto": 1,
      "cantidad": 2,
      "precio_unitario": 50.00
    }]
  }'
```

---

**Última actualización:** Diciembre 2025

