const jwt = require('jsonwebtoken');

// Middleware para verificar que el usuario esté autenticado (cualquier rol)
function requiereAuth(req, res, next) {
    // 1. Buscamos el token en los Headers (se suele enviar como 'Authorization')
    const authHeader = req.headers['authorization'];
    
    // El formato estándar es "Bearer TOKEN_AQUI"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Acceso denegado. No se proporcionó un token. Debes iniciar sesión." });
    }

    try {
        // 2. Verificamos que el token sea válido y no haya expirado
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ error: 'JWT secret not configured on server' });
        }

        const verificado = jwt.verify(token, jwtSecret);
        
        // 3. Guardamos los datos del usuario en la petición para uso posterior
        req.user = verificado;
        next(); // ¡Adelante!
    } catch (error) {
        res.status(401).json({ error: "Token inválido o expirado. Por favor, inicia sesión nuevamente." });
    }
}

// Middleware para verificar que el usuario sea Administrador
function esAdmin(req, res, next) {
    // Reutilizamos la lógica de requiereAuth para verificar el token
    requiereAuth(req, res, () => {
        // Una vez autenticado, verificamos el rol (insensible a mayúsculas)
        if (req.user && req.user.rol && req.user.rol.toLowerCase() === 'administrador') {
            next(); // El usuario es Administrador, ¡Adelante!
        } else {
            res.status(403).json({ error: "Permisos insuficientes. Se requiere rol de Administrador." });
        }
    });
}

module.exports = { requiereAuth, esAdmin };