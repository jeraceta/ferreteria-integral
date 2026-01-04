// Importa el framework Express para crear y manejar rutas.
const express = require('express');
// Crea un nuevo objeto de enrutador de Express.
const router = express.Router();

// Importa el controlador de productos que contiene la lógica para cada ruta.
const productController = require('../controllers/productos.controller');
// Importa el middleware de autenticación para proteger las rutas.
const { requiereAuth, esGerente } = require('../middlewares/auth.middleware');

// --- DEFINICIÓN DE RUTAS PARA PRODUCTOS ---

// Ruta para obtener todas las categorías.
// Es importante colocar esta ruta específica ANTES de rutas con parámetros como /:id
// para evitar que 'categorias' sea interpretado como un ID de producto.
router.get('/categorias', requiereAuth, productController.getCategories);

// Ruta para crear una nueva categoría.
router.post('/categorias', requiereAuth, esGerente, productController.createCategory);

// Ruta para obtener una lista de todos los productos.
// Se aplica el middleware 'requiereAuth' para asegurar que el usuario esté autenticado.
router.get('/', requiereAuth, productController.getAllProducts);

// Ruta para obtener un único producto por su ID.
// El ':id' en la ruta es un parámetro que se puede acceder en el controlador.
router.get('/:id', requiereAuth, productController.getProductById);

// Ruta para crear un nuevo producto.
// Utiliza el método POST y está protegida por autenticación.
router.post('/', requiereAuth, productController.createProduct);

// Ruta para actualizar un producto existente por su ID.
// Utiliza el método PUT y está protegida por autenticación.
router.put('/:id', requiereAuth, productController.updateProduct);

// Ruta para eliminar un producto por su ID.
// Utiliza el método DELETE y está protegida por autenticación.
router.delete('/:id', requiereAuth, productController.deleteProduct);

// Exporta el enrutador configurado para que pueda ser utilizado en el archivo principal del servidor (index.js).
module.exports = router;