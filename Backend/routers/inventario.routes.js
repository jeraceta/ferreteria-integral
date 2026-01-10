const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requiereAuth, esGerente } = require('../middlewares/auth.middleware');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const {
    procesarNuevaCompra,
    procesarNuevaVenta,
    obtenerProductoPorId,
    obtenerTodosLosProductos,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    procesarDevolucion,
    obtenerStockPorDepositos,
    procesarAjusteInventario,
    trasladarMercancia,
    obtenerValoracionInventario,
    obtenerStockCritico,
    obtenerGananciasTienda,
    obtenerGananciasHoy,
    obtenerVentasPorVendedor,
    registrarUsuario,
    obtenerUsuarios,
    actualizarUsuario,
    eliminarUsuario,
    obtenerLoMasVendido,
    loginUsuario,
    obtenerKardexProducto,
    obtenerReporteX,
    generarCierreZ,
    obtenerHistorialCierres,
    obtenerVentasMensuales,
    obtenerReporteTomaFisica,
    obtenerProductosMasVendidos,
    obtenerVentasPorMetodoPago,
    obtenerInventarioCritico
} = require('../controllers/inventario.controller');


// --- 1. AUTENTICACIÓN ---


// ENDPOINT DE LOGIN


router.post('/login',


    body('username').isString().notEmpty(),


    body('password').isString().notEmpty(),


    async (req, res, next) => {


    try {


        const errors = validationResult(req);


        if (!errors.isEmpty()) return next({ status: 400, message: 'Validación fallida', detail: errors.array() });





        const { username, password } = req.body;


        const usuario = await loginUsuario(username, password);





        // 🔑 CREAR EL TOKEN (El "Gafete")


        const jwtSecret = process.env.JWT_SECRET;


        if (!jwtSecret) {


            return res.status(500).json({ success: false, error: 'JWT secret not configured on server' });


        }





        const token = jwt.sign(


            { id: usuario.id, rol: usuario.rol },


            jwtSecret,


            { expiresIn: '12h' }


        );





        res.json({


            success: true,


            mensaje: `¡Bienvenido(a) ${usuario.nombre}!`,


            token: token,


            user: usuario


        });


    } catch (error) {


        next(error); // Standardized error handling


    }


});








// --- 1. REPORTES Y CONSULTAS (from 8880b31 first, then HEAD) ---





router.get('/stock-critico', requiereAuth, async (req, res, next) => {


    try {


        const reporte = await obtenerStockCritico();


        res.json({ success: true, count: reporte.length, data: reporte });


    } catch (error) {


        next(error);


    }


});





router.get('/reporte-ganancias', esGerente, async (req, res, next) => {


    try {


        const ganancias = await obtenerGananciasHoy();


        res.json({ success: true, fecha_reporte: new Date().toISOString().split('T')[0], data: ganancias });


    } catch (error) {


        next(error);


    }


});





router.get('/reporte-comisiones', esGerente, async (req, res, next) => {


    try {


        const { inicio, fin, porcentaje } = req.query;


        if (!inicio || !fin || !porcentaje) {


            return res.status(400).json({ error: "Faltan parámetros: inicio, fin y porcentaje son obligatorios." });


        }


        const ventasVendedores = await obtenerVentasPorVendedor(inicio, fin);


        const reporteFinal = ventasVendedores.map(v => ({


            ...v,


            porcentaje_aplicado: `${porcentaje}%`,


            comision_ganada: (v.total_ventas_brutas * (porcentaje / 100)).toFixed(2)


        }));


        res.json({ success: true, periodo: { desde: inicio, hasta: fin }, data: reporteFinal });


    } catch (error) {


        next(error);


    }


});





// --- 2. OPERACIONES DE PRODUCTOS (from 8880b31 first, then HEAD) ---





router.get('/productos', requiereAuth, obtenerTodosLosProductos); // Added requiereAuth from HEAD

















// Obtener un producto por su ID (from HEAD)





router.get('/producto/:id', requiereAuth, obtenerProductoPorId);





router.post('/producto', requiereAuth, esGerente, async (req, res, next) => { // Combined HEAD and 8880b31


    try {


        const nuevoProducto = await crearProducto(req.body);


        res.status(201).json({ mensaje: 'Producto creado con éxito', producto: nuevoProducto });


    } catch (error) {


        next(error);


    }


});





// Actualizar un producto existente (from HEAD)


router.put('/producto/:id', requiereAuth, esGerente, async (req, res, next) => {


    try {


        await actualizarProducto(req.params.id, req.body);


        res.json({ success: true, mensaje: "Producto actualizado correctamente" });


    } catch (error) { next(error); }


});





// Eliminar (o desactivar) un producto (from HEAD)


router.delete('/producto/:id', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const resultado = await eliminarProducto(req.params.id);


        res.json(resultado);


    } catch (error) { next(error); }


});





// Obtener Kardex (historial de movimientos) de un producto específico (from 8880b31, also in HEAD)


router.get('/kardex/:id_producto', requiereAuth, async (req, res, next) => {


    try {


        const idProducto = parseInt(req.params.id_producto);


        if (isNaN(idProducto)) {


            return res.status(400).json({ error: 'ID de producto inválido' });


        }


        const kardex = await obtenerKardexProducto(idProducto);


        res.json({ success: true, data: kardex });


    } catch (error) {


        next(error);


    }


});





// --- 3. MOVIMIENTOS (from 8880b31 first, then HEAD) ---


// Las compras solo pueden ser realizadas por gerentes


router.post('/compra', esGerente, async (req, res, next) => { // Combined HEAD and 8880b31


    // Note: kept as-is for backward compatibility; prefer /api/compras route for validated flow


    try {


        const { datosCompra, detalle } = req.body;


        const resultado = await procesarNuevaCompra(datosCompra, detalle);


        res.status(201).json({ mensaje: 'Compra procesada', compraId: resultado.id_compra });


    } catch (error) {


        next(error);


    }


});





// Las ventas pueden ser realizadas por cualquier usuario autenticado (from 8880b31 with validation)


router.post('/venta',


    requiereAuth,


    body('datosVenta').exists().withMessage('datosVenta es requerido'),


    body('detalle').isArray().withMessage('detalle debe ser un arreglo'),


    async (req, res, next) => {


    try {


        const errors = validationResult(req);


        if (!errors.isEmpty()) return next({ status: 400, message: 'Validación fallida', detail: errors.array() });





        const { datosVenta, detalle } = req.body;


        const resultado = await procesarNuevaVenta(datosVenta, detalle);


        res.json({ success: true, ventaId: resultado.id_venta });


    } catch (error) {


        next(error);


    }


});





// Procesar una devolución de cliente (from HEAD)


router.post('/devolucion', requiereAuth, async (req, res, next) => {


    try {


        // Aseguramos que el ID de usuario que hace la devolución quede registrado


        const datosDevolucion = { ...req.body, usuario_id: req.user.id };


        const resultado = await procesarDevolucion(datosDevolucion);


        res.json(resultado);


    } catch (error) { next(error); }


});





// Mover mercancía entre depósitos (from HEAD)


router.post('/traslado', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { id_producto, id_origen, id_destino, cantidad, comentario } = req.body;


        await trasladarMercancia(id_producto, id_origen, id_destino, cantidad, comentario);


        res.json({ success: true, mensaje: "Traslado exitoso" });


    } catch (error) { next(error); }


});








// AJUSTE DE INVENTARIO (conteo físico) - Solo Gerentes (from 8880b31 with validation)


router.post('/ajuste',


    esGerente,


    body('detalles').isArray().withMessage('detalles debe ser un arreglo'),


    async (req, res, next) => {


    try {


        const errors = validationResult(req);


        if (!errors.isEmpty()) return next({ status: 400, message: 'Validación fallida', detail: errors.array() });





        const resultado = await procesarAjusteInventario(req.body);


        res.status(200).json({ success: true, detallesProcesados: resultado.detallesProcesados });


    } catch (error) {


        next(error);


    }


});








// --- 4. REPORTES Y CONSULTAS DE INVENTARIO (from 8880b31 first, then HEAD) ---





// Ver el stock actual distribuido en los depósitos (from HEAD)


router.get('/stock-depositos', requiereAuth, async (req, res, next) => {


    try {


        const stock = await obtenerStockPorDepositos();


        res.json({ success: true, data: stock });


    } catch (error) { next(error); }


});





// Ver productos con stock bajo (según stock_minimo) (from HEAD)


router.get('/inventario-critico', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const data = await obtenerInventarioCritico();


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// Reporte para la toma física de inventario (from HEAD)


router.get('/reporte-toma-fisica', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { id_categoria } = req.query;


        const reporte = await obtenerReporteTomaFisica(id_categoria);


        res.json({ success: true, data: reporte });


    } catch (error) { next(error); }


});





// --- 5. REPORTES FINANCIEROS Y DE GESTIÓN (from HEAD) ---





// Reporte X: Cierre parcial de caja


router.get('/reporte-x', requiereAuth, esGerente, obtenerReporteX);





// Reporte Z: Cierre definitivo de caja


router.post('/reporte-z', requiereAuth, esGerente, generarCierreZ);





// Historial de cierres Z


router.get('/historial-cierres', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const historial = await obtenerHistorialCierres();


        res.json({ success: true, datos: historial });


    } catch (error) { next(error); }


});





// Reporte de ganancias (con filtros por fecha)


router.get('/ganancias', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { fechaInicio, fechaFin } = req.query;


        const data = await obtenerGananciasTienda(fechaInicio, fechaFin);


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// Reporte de ventas por vendedor (para comisiones)


router.get('/ventas-por-vendedor', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { fechaInicio, fechaFin, porcentajeComision } = req.query;


        const data = await obtenerVentasPorVendedor(fechaInicio, fechaFin, porcentajeComision);


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// Reporte de ventas por método de pago


router.get('/ventas-metodo-pago', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { fechaInicio, fechaFin } = req.query;


        const data = await obtenerVentasPorMetodoPago(fechaInicio, fechaFin);


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// --- 6. REPORTES PARA DASHBOARD (from HEAD) ---





// Productos más vendidos


router.get('/lo-mas-vendido', requiereAuth, async (req, res, next) => {


    try {


        const data = await obtenerLoMasVendido();


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// Top 10 Productos más vendidos (con filtro de fecha)


router.get('/productos-mas-vendidos', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const { fechaInicio, fechaFin } = req.query;


        const data = await obtenerProductosMasVendidos(fechaInicio, fechaFin);


        res.json({ success: true, data });


    } catch (error) { next(error); }


});





// Datos para gráfico de ventas mensuales


router.get('/ventas-mensuales', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const data = await obtenerVentasMensuales();


        res.json({ success: true, data: data });


    }


    catch (error) { next(error); }


});





// Reporte de valoración total del inventario


router.get('/reporte-valoracion', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const valoracion = await obtenerValoracionInventario();


        const granTotal = valoracion.reduce((acc, cat) => acc + parseFloat(cat.inversion_total_costo || 0), 0);


        res.json({ success: true, gran_total_inventario: granTotal, data: valoracion });


    } catch (error) { next(error); }


});








// --- 7. GESTIÓN DE USUARIOS (Solo Gerentes) (from 8880b31 first, then HEAD) ---





// REGISTRAR NUEVO USUARIO (Solo Gerencia)


router.post('/usuarios',


    esGerente,


    body('username').isString().notEmpty(),


    body('password').isString().isLength({ min: 6 }).withMessage('password mínimo 6 caracteres'),


    body('nombre').isString().notEmpty(),


    async (req, res, next) => {


    try {


        const errors = validationResult(req);


        if (!errors.isEmpty()) return next({ status: 400, message: 'Validación fallida', detail: errors.array() });





        const nuevoUsuario = await registrarUsuario(req.body);


        res.status(201).json({


            success: true,


            mensaje: "Usuario creado exitosamente",


            data: nuevoUsuario


        });


    } catch (error) {


        // Manejo por si el nombre de usuario ya existe (columna UNIQUE)


        if (error.code === 'ER_DUP_ENTRY') {


            return next({ status: 400, message: "El nombre de usuario ya existe" });


        }


        next(error);


    }


});








// Obtener lista de todos los usuarios


router.get('/usuarios', requiereAuth, esGerente, async (req, res, next) => {


    try {


        const lista = await obtenerUsuarios();


        res.json({ success: true, data: lista });


    } catch (error) { next(error); }


});





// Actualizar un usuario


router.put('/usuarios/:id', esGerente, async (req, res, next) => {


    try {


        const editado = await actualizarUsuario(req.params.id, req.body);


        if (editado) {


            res.json({ success: true, mensaje: "Usuario actualizado correctamente" });


        } else {


            res.status(404).json({ error: "Usuario no encontrado" });


        }


    } catch (error) {


        next(error);


    }


});





// Eliminar un usuario


router.delete('/usuarios/:id', esGerente, async (req, res, next) => {


    try {


        const eliminado = await eliminarUsuario(req.params.id);


        if (eliminado) {


            res.json({ success: true, mensaje: "Usuario eliminado" });


        } else {


            res.status(404).json({ error: "Usuario no encontrado" });


        }


    } catch (error) {


        next(error);


    }


});





module.exports = router;
