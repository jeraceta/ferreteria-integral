const express = require('express');
const router = express.Router();
const {
    listarUsuarios,
    crearUsuario,
    actualizarUsuario,
    eliminarUsuario
} = require('../controllers/usuarios.controller');
const { esAdmin } = require('../middlewares/auth.middleware');

// Rutas para gestionar usuarios
router.get('/', esAdmin, listarUsuarios);
router.post('/', esAdmin, crearUsuario);
router.put('/:id', esAdmin, actualizarUsuario);
router.delete('/:id', esAdmin, eliminarUsuario);

module.exports = router;
