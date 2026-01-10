// Importa el framework Express para crear y manejar rutas.
const express = require('express');
// Crea un nuevo objeto de enrutador de Express.
const router = express.Router();

// CORRECTED: Importa el controlador de inventario que contiene la lógica de productos.
const inventarioController = require('../controllers/inventario.controller');
// Importa el middleware de autenticación para proteger las rutas.
const { requiereAuth, esGerente } = require('../middlewares/auth.middleware');

// --- DEFINICIÓN DE RUTAS PARA PRODUCTOS ---

// Ruta para obtener todas las categorías.
// Es importante colocar esta ruta específica ANTES de rutas con parámetros como /:id
// para evitar que 'categorias' sea interpretado como un ID de producto.
router.get('/categorias', requiereAuth, inventarioController.obtenerTodasLasCategorias);

// Ruta para la búsqueda predictiva de productos.
// Debe ir antes de /:id para que 'buscar' no se tome como un id.
router.get('/buscar', requiereAuth, inventarioController.buscarProductosPredictivo);

// TODO: La función 'createCategory' no fue encontrada en el controlador.
// Ruta para crear una nueva categoría.
// router.post('/categorias', requiereAuth, esGerente, inventarioController.createCategory);

// Ruta para obtener una lista de todos los productos.
// Se aplica el middleware 'requiereAuth' para asegurar que el usuario esté autenticado.
router.get('/', requiereAuth, inventarioController.obtenerTodosLosProductos);

// Ruta para obtener un único producto por su ID.
// El ':id' en la ruta es un parámetro que se puede acceder en el controlador.
router.get('/:id', requiereAuth, inventarioController.obtenerProductoPorId);

// Ruta para crear un nuevo producto.
// Utiliza el método POST y está protegida por autenticación.
router.post('/', requiereAuth, esGerente, inventarioController.crearProducto);

// Ruta para actualizar un producto existente por su ID.
// Utiliza el método PUT y está protegida por autenticación.
router.put('/:id', requiereAuth, esGerente, inventarioController.actualizarProducto);

// Ruta para eliminar un producto por su ID.
// Utiliza el método DELETE y está protegida por autenticación.
router.delete('/:id', requiereAuth, esGerente, inventarioController.eliminarProducto);

// Exporta el enrutador configurado para que pueda ser utilizado en el archivo principal del servidor (index.js).
module.exports = router;