const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res, next) => {
    const { username, password } = req.body;

    try {
        // Usamos [rows] para extraer directamente los datos de la base de datos y evitar que el objeto de respuesta de MySQL nos de un valor undefined en las validaciones.
        const [rows] = await pool.query('SELECT * FROM usuarios WHERE username = ?', [username]);

        if (rows.length === 0) {
            // Si no se encuentra el usuario, enviamos un error genérico
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const user = rows[0];

        // Seguridad adicional: verificar que la contraseña del req.body no sea null o undefined
        if (!password) {
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }
        
        // Validamos la contraseña usando bcrypt
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            // Si la contraseña no coincide, enviamos el mismo error genérico
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        // Si la autenticación es exitosa, generamos el token JWT
        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol, nombre: user.nombre },
            process.env.JWT_SECRET || 'fallback_secret_key', // Usar una variable de entorno para el secreto
            { expiresIn: '8h' }
        );

        // Guardamos el token JWT de forma automática para eliminar el uso manual de la consola.
        res.json({
            token,
            user: {
                nombre: user.nombre,
                rol: user.rol
            }
        });

    } catch (error) {
        next(error);
    }
};

module.exports = {
    login
};
