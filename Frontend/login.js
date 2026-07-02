document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const forgotPasswordLink = document.getElementById('forgot-password');
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            
            const eyeIcon = togglePasswordBtn.querySelector('.eye-icon');
            const eyeSlashIcon = togglePasswordBtn.querySelector('.eye-slash-icon');
            if (eyeIcon && eyeSlashIcon) {
                if (isPassword) {
                    eyeIcon.style.display = 'none';
                    eyeSlashIcon.style.display = 'block';
                    togglePasswordBtn.setAttribute('aria-label', 'Ocultar contraseña');
                } else {
                    eyeIcon.style.display = 'block';
                    eyeSlashIcon.style.display = 'none';
                    togglePasswordBtn.setAttribute('aria-label', 'Mostrar contraseña');
                }
            }
        });
    }

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

    forgotPasswordLink.addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Paso 1: Pedir el nombre de usuario
        const { value: username } = await Swal.fire({
            title: 'Recuperar Contraseña',
            input: 'text',
            inputLabel: 'Ingresa tu nombre de usuario',
            inputPlaceholder: 'Ej: jperez',
            showCancelButton: true,
            confirmButtonText: 'Continuar',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#3085d6',
            inputValidator: (value) => {
                if (!value || value.trim() === '') {
                    return 'Debes ingresar tu nombre de usuario';
                }
            }
        });

        if (!username) return; // Cancelado

        try {
            // Mostrar cargando
            Swal.showLoading();
            
            // Consultar la pregunta de seguridad del usuario
            const resPregunta = await fetch(`http://localhost:3000/api/recuperacion/pregunta?username=${encodeURIComponent(username.trim())}`);
            const dataPregunta = await resPregunta.json();

            if (!resPregunta.ok) {
                throw new Error(dataPregunta.message || 'No se pudo obtener la pregunta de seguridad.');
            }

            // Paso 2: Mostrar la pregunta de seguridad y pedir respuesta + nueva contraseña
            const { value: formValues } = await Swal.fire({
                title: 'Pregunta de Seguridad',
                html: `
                    <div style="text-align: left; padding: 0 5px;">
                        <p style="margin-bottom: 15px; font-size: 0.95em; line-height: 1.4; background: #eef2f7; padding: 10px; border-radius: 6px; border-left: 4px solid #3085d6;">
                            <strong>Pregunta:</strong> <br>${dataPregunta.pregunta}
                        </p>
                        
                        <div style="margin-bottom: 12px;">
                            <label for="swal-respuesta" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Respuesta de Seguridad</label>
                            <input type="text" id="swal-respuesta" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Tu respuesta aquí" autocomplete="off">
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label for="swal-nueva-clave" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Nueva Contraseña</label>
                            <input type="password" id="swal-nueva-clave" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Nueva contraseña">
                        </div>

                        <div style="margin-bottom: 12px;">
                            <label for="swal-confirmar-clave" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Confirmar Contraseña</label>
                            <input type="password" id="swal-confirmar-clave" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Repite la contraseña">
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: 'Restablecer',
                cancelButtonText: 'Cancelar',
                confirmButtonColor: '#28a745',
                focusConfirm: false,
                preConfirm: () => {
                    const respuesta = document.getElementById('swal-respuesta').value.trim();
                    const nuevaClave = document.getElementById('swal-nueva-clave').value;
                    const confirmarClave = document.getElementById('swal-confirmar-clave').value;

                    if (!respuesta) {
                        Swal.showValidationMessage('Debes responder a la pregunta de seguridad');
                        return false;
                    }
                    if (!nuevaClave) {
                        Swal.showValidationMessage('Debes ingresar la nueva contraseña');
                        return false;
                    }
                    if (nuevaClave.length < 4) {
                        Swal.showValidationMessage('La contraseña debe tener al menos 4 caracteres');
                        return false;
                    }
                    if (nuevaClave !== confirmarClave) {
                        Swal.showValidationMessage('Las contraseñas no coinciden');
                        return false;
                    }

                    return { respuesta, nuevaClave };
                }
            });

            if (!formValues) return; // Cancelado

            // Mostrar cargando
            Swal.showLoading();

            // Enviar respuesta y nueva contraseña al backend para restablecer
            const resRestablecer = await fetch('http://localhost:3000/api/recuperacion/restablecer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username.trim(),
                    respuesta_seguridad: formValues.respuesta,
                    nueva_clave: formValues.nuevaClave
                })
            });

            const dataRestablecer = await resRestablecer.json();

            if (!resRestablecer.ok) {
                throw new Error(dataRestablecer.message || 'La respuesta de seguridad es incorrecta.');
            }

            // Éxito
            await Swal.fire({
                icon: 'success',
                title: 'Contraseña Restablecida',
                text: 'Tu contraseña ha sido cambiada con éxito. Ya puedes iniciar sesión.',
                confirmButtonColor: '#3085d6'
            });

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error de Recuperación',
                text: error.message,
                confirmButtonColor: '#d33'
            });
        }
    });
});
