// auth.js - Middleware de seguridad para el Frontend

(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    // Si no hay token, el usuario debe ser expulsado al login.html inmediatamente.
    // Se excluye la propia página de login para evitar un bucle de redirección.
    if (!token && !window.location.pathname.endsWith('login.html')) {
        // Limpiamos cualquier dato residual
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirigimos al login
        window.location.href = 'login.html';
        return;
    }

    // Opcional: Podríamos añadir una verificación del token aquí contra un endpoint
    // en el backend para asegurar que no ha expirado o ha sido invalidado.
    // Por ahora, la simple presencia del token es suficiente para esta implementación.

    // Si estamos en una página protegida y hay token, podemos, por ejemplo,
    // personalizar la UI con la información del usuario.
    document.addEventListener('DOMContentLoaded', () => {
        if (user && user.nombre) {
            const userDisplay = document.getElementById('user-display');
            if(userDisplay) {
                userDisplay.textContent = `Hola, ${user.nombre}`;
            }
        }
    });

})();
