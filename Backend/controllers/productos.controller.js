// Importa la función 'query' desde el archivo de base de datos para poder ejecutar consultas SQL.
const { query } = require('../database');

// Importa funciones específicas desde el controlador de inventario que también son útiles aquí.
const { 
    obtenerTodosLosProductos, 
    obtenerProductoPorId 
} = require('../inventario.controller');

/**
 * Obtiene todas las categorías de la base de datos.
 * Esta función es llamada por getCategories.
 * @returns {Promise<Array>} Una promesa que se resuelve en un array de objetos, donde cada objeto es una categoría.
 */
const obtenerTodasLasCategorias = async () => {
    // Ejecuta una consulta SQL para seleccionar todas las filas de la tabla 'categorias'.
    const categorias = await query('SELECT * FROM categorias');
    return categorias;
};

// Define un objeto para agrupar todas las funciones del controlador de productos.
const productosController = {
    /**
     * Maneja la petición GET /api/productos para obtener todos los productos.
     * @param {object} req - El objeto de solicitud de Express.
     * @param {object} res - El objeto de respuesta de Express.
     */
    getAllProducts: async (req, res) => {
        try {
            // Llama a la función importada para obtener todos los productos.
            const productos = await obtenerTodosLosProductos();
            // Envía la lista de productos como una respuesta JSON.
            res.json(productos);
        } catch (error) {
            // Si ocurre un error, lo registra en la consola y envía una respuesta de error 500.
            console.error('Error al obtener todos los productos:', error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Maneja la petición GET /api/productos/:id para obtener un producto por su ID.
     * @param {object} req - El objeto de solicitud de Express, contiene el ID del producto en req.params.
     * @param {object} res - El objeto de respuesta de Express.
     */
    getProductById: async (req, res) => {
        try {
            // Obtiene el ID del producto de los parámetros de la URL.
            const { id } = req.params;
            // Llama a la función importada para obtener el producto específico.
            const producto = await obtenerProductoPorId(id);
            // Si el producto se encuentra, lo envía como respuesta JSON.
            if (producto) {
                res.json(producto);
            } else {
                // Si no se encuentra el producto, envía una respuesta 404 (No Encontrado).
                res.status(404).json({ error: 'Producto no encontrado.' });
            }
        } catch (error) {
            // Si ocurre un error, lo registra y envía una respuesta de error 500.
            console.error(`Error al obtener el producto por ID ${req.params.id}:`, error);
            res.status(500).json({ error: error.message });
        }
    },

    /**
     * Maneja la petición POST /api/productos para crear un nuevo producto.
     * @param {object} req - El objeto de solicitud de Express, contiene los datos del nuevo producto en req.body.
     * @param {object} res - El objeto de respuesta de Express.
     */
    createProduct: async (req, res) => {
        try {
            // Extrae los datos del producto del cuerpo de la solicitud.
            const { codigo, nombre, descripcion, stock, precio_costo, precio_venta, id_categoria } = req.body;

            // Valida que la categoría especificada exista en la base de datos.
            const categoryExists = await query('SELECT id FROM categorias WHERE id = ?', [id_categoria]);
            if (categoryExists.length === 0) {
                // Si la categoría no existe, devuelve un error 400 (Solicitud incorrecta).
                return res.status(400).json({ error: 'La id_categoria especificada no existe.' });
            }

            // Define la consulta SQL para insertar el nuevo producto.
            const sql = `
                INSERT INTO productos (codigo, nombre, descripcion, stock, precio_costo, precio_venta, id_categoria)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            // Ejecuta la consulta con los datos proporcionados.
            const result = await query(sql, [codigo, nombre, descripcion, stock, precio_costo, precio_venta, id_categoria]);

            // Envía una respuesta 201 (Creado) con un mensaje de éxito y el ID del nuevo producto.
            res.status(201).json({ 
                message: 'Producto creado exitosamente', 
                productId: result.insertId 
            });
        } catch (error) {
            // Manejo de errores específicos y genéricos.
            console.error('Error al crear producto:', error);
            if (error.code === 'ER_DUP_ENTRY') {
                // Si el código de producto ya existe, devuelve un error 409 (Conflicto).
                return res.status(409).json({ error: 'El código del producto ya existe.' });
            }
            res.status(500).json({ error: 'Error interno del servidor al crear producto.' });
        }
    },

    /**
     * Maneja la petición PUT /api/productos/:id para actualizar un producto existente.
     * @param {object} req - El objeto de solicitud de Express.
     * @param {object} res - El objeto de respuesta de Express.
     */
    updateProduct: async (req, res) => {
        try {
            // Obtiene el ID del producto de la URL y los nuevos datos del cuerpo de la solicitud.
            const { id } = req.params;
            const { codigo, nombre, descripcion, stock, precio_costo, precio_venta, id_categoria } = req.body;

            // Valida que el producto a actualizar realmente exista.
            const productExists = await query('SELECT id FROM productos WHERE id = ?', [id]);
            if (productExists.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado para actualizar.' });
            }

            // Valida que la nueva categoría asignada exista.
            const categoryExists = await query('SELECT id FROM categorias WHERE id = ?', [id_categoria]);
            if (categoryExists.length === 0) {
                return res.status(400).json({ error: 'La id_categoria especificada no existe.' });
            }

            // Define la consulta SQL para actualizar el producto.
            const sql = `
                UPDATE productos SET codigo = ?, nombre = ?, descripcion = ?, stock = ?, precio_costo = ?, precio_venta = ?, id_categoria = ?
                WHERE id = ?
            `;
            // Ejecuta la consulta de actualización.
            await query(sql, [codigo, nombre, descripcion, stock, precio_costo, precio_venta, id_categoria, id]);

            // Envía una respuesta JSON con un mensaje de éxito.
            res.json({ message: 'Producto actualizado exitosamente.' });
        } catch (error) {
            // Manejo de errores.
            console.error('Error al actualizar producto:', error);
             if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({ error: 'El código del producto ya existe.' });
            }
            res.status(500).json({ error: 'Error interno del servidor al actualizar producto.' });
        }
    },

    /**
     * Maneja la petición DELETE /api/productos/:id para eliminar un producto.
     * @param {object} req - El objeto de solicitud de Express.
     * @param {object} res - El objeto de respuesta de Express.
     */
    deleteProduct: async (req, res) => {
        try {
            // Obtiene el ID del producto de la URL.
            const { id } = req.params;

            // Valida que el producto a eliminar exista.
            const productExists = await query('SELECT id FROM productos WHERE id = ?', [id]);
            if (productExists.length === 0) {
                return res.status(404).json({ error: 'Producto no encontrado para eliminar.' });
            }

            // Define y ejecuta la consulta SQL para eliminar el producto.
            const sql = 'DELETE FROM productos WHERE id = ?';
            await query(sql, [id]);
            // Envía una respuesta de éxito.
            res.json({ message: 'Producto eliminado exitosamente.' });
        } catch (error) {
            // Manejo de errores.
            console.error('Error al eliminar producto:', error);
            // Error específico de MySQL cuando una clave foránea (FK) impide la eliminación.
            if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451) {
                return res.status(409).json({ 
                    error: 'No se puede eliminar el producto porque está relacionado con ventas existentes.',
                    mysql_error_code: error.code 
                });
            }
            res.status(500).json({ error: 'Error interno del servidor al eliminar producto.' });
        }
    },

    /**
     * Maneja la petición GET /api/categorias para obtener todas las categorías.
     * @param {object} req - El objeto de solicitud de Express.
     * @param {object} res - El objeto de respuesta de Express.
     */
    getCategories: async (req, res) => {
        try {
            // Llama a la función local para obtener todas las categorías.
            const categorias = await obtenerTodasLasCategorias();
            // Envía la lista de categorías como respuesta JSON.
            res.json(categorias);
        } catch (error) {
            // Manejo de errores.
            console.error('Error en getCategories:', error);
            res.status(500).json({ error: 'Error al obtener las categorías' });
        }
    },

    /**
     * Maneja la petición POST /api/productos/categorias para crear una nueva categoría.
     * @param {object} req - El objeto de solicitud de Express.
     * @param {object} res - El objeto de respuesta de Express.
     */
    createCategory: async (req, res) => {
        try {
            const { nombre } = req.body;

            // Validación simple
            if (!nombre || nombre.trim() === '') {
                return res.status(400).json({ error: 'El nombre de la categoría es requerido.' });
            }

            // Verificar si ya existe (case-insensitive)
            const [existe] = await query('SELECT id FROM categorias WHERE UPPER(nombre) = UPPER(?)', [nombre.trim()]);
            
            if (existe) {
                return res.status(400).json({ error: 'La categoría ya existe.' });
            }

            // Insertar la nueva categoría
            const result = await query('INSERT INTO categorias (nombre) VALUES (?)', [nombre.trim()]);
            
            // Devolver la nueva categoría creada
            res.status(201).json({
                success: true,
                message: 'Categoría creada exitosamente',
                categoria: {
                    id: result.insertId,
                    nombre: nombre.trim()
                }
            });

        } catch (error) {
            console.error('Error al crear categoría:', error);
            res.status(500).json({ error: 'Error interno del servidor al crear la categoría.' });
        }
    }
};

// Exporta el objeto controlador para que pueda ser utilizado en las rutas.
module.exports = productosController;