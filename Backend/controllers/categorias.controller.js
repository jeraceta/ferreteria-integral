const pool = require('../db');

// Función para obtener todas las categorías
const getCategorias = async (req, res, next) => {
    try {
        const [rows] = await pool.query('SELECT * FROM categorias');
        res.json(rows);
    } catch (error) {
        next(error);
    }
};

// Función para crear una categoría
const createCategoria = async (req, res, next) => {
    const { nombre } = req.body;
    try {
        const [result] = await pool.query('INSERT INTO categorias (nombre) VALUES (?)', [nombre]);
        res.json({ id: result.insertId, nombre });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCategorias,
    createCategoria
};