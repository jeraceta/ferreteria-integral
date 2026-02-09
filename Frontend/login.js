document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const forgotPasswordLink = document.getElementById('forgot-password');

    // Redirigir si ya hay un token
    if (localStorage.getItem('token')) {
        window.location.href = 'dashboard.html';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMessage.textContent = ''; // Limpiar errores previos

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('http://localhost:3000/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error en el servidor');
            }

            // Al loguear con éxito, guardamos el token y los datos del usuario
            // Validamos la contraseña usando bcrypt y guardamos el token JWT de forma automática para eliminar el uso manual de la consola.
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirigimos automáticamente a dashboard.html
            window.location.href = 'dashboard.html';

        } catch (error) {
            errorMessage.textContent = error.message;
        }
    });

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Contacte al administrador del sistema para restablecer su contraseña.');
    });
});
