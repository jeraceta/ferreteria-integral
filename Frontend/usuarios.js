document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  const tablaUsuarios = document.getElementById("tablaUsuarios");
  const btnNuevoUsuario = document.getElementById("btnNuevoUsuario");

  const API_URL = "http://localhost:3000/api/usuarios";

  // --- Helper para obtener el token ---
  const getToken = () => localStorage.getItem("token");

  const fetchUsuarios = async () => {
    try {
      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Swal.fire(
            "Acceso Denegado",
            "No tienes permiso para ver esta información.",
            "error",
          );
          document.querySelector("main").innerHTML =
            '<h2 class="text-center text-danger">Acceso Restringido</h2>';
        }
        throw new Error("Error al cargar los usuarios.");
      }
      const usuarios = await response.json();
      renderUsuarios(usuarios);
    } catch (error) {
      console.error(error);
      tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar usuarios. ${error.message}</td></tr>`;
    }
  };

  const renderUsuarios = (usuarios) => {
    tablaUsuarios.innerHTML = "";
    if (usuarios.length === 0) {
      tablaUsuarios.innerHTML =
        '<tr><td colspan="4" class="text-center">No hay usuarios registrados.</td></tr>';
      return;
    }
    usuarios.forEach((user) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${user.nombre}</td>
                <td>${user.username}</td>
                <td><span class="badge bg-${user.rol === "Administrador" ? "success" : "info"}">${user.rol}</span></td>
                <td>
                    <button class="btn btn-sm btn-info" onclick='openUserModal(${JSON.stringify(user)})' title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick='eliminarUsuario(${user.id})' title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
      tablaUsuarios.appendChild(tr);
    });
  };

  // Hacemos la función global para que los `onclick` puedan acceder a ella
  window.openUserModal = (user = null) => {
    const isEditing = user !== null;
    const passwordPlaceholder = isEditing
      ? "Dejar en blanco para no cambiar"
      : "Ingrese la contraseña";

    Swal.fire({
      title: isEditing ? "Editar Usuario" : "Nuevo Usuario",
      html: `
                <div style="text-align: left; padding: 0 5px;">
                    <div style="margin-bottom: 12px;">
                        <label for="swal-nombre" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Nombre y Apellido</label>
                        <input type="text" id="swal-nombre" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Ej: Juan Pérez" value="${isEditing ? user.nombre : ""}" autocomplete="off">
                    </div>
                    
                    <div style="margin-bottom: 12px;">
                        <label for="swal-username" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Usuario (para login)</label>
                        <input type="text" id="swal-username" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Ej: jperez" value="${isEditing ? user.username : ""}" autocomplete="off">
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label for="swal-password" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Contraseña</label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="password" id="swal-password" class="swal2-input" style="flex: 1; margin: 0;" placeholder="${passwordPlaceholder}" autocomplete="new-password">
                            <button type="button" id="togglePassword" style="height: 2.625em; padding: 0 12px; border: 1px solid #d9d9d9; background: #fff; cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label for="swal-rol" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Rol</label>
                        <select id="swal-rol" class="swal2-select" style="width: 100%; margin: 0;">
                            <option value="Vendedor" ${isEditing && user.rol === "Vendedor" ? "selected" : ""}>Vendedor</option>
                            <option value="Administrador" ${isEditing && user.rol === "Administrador" ? "selected" : ""}>Administrador</option>
                        </select>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label for="swal-pregunta" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Pregunta de Seguridad</label>
                        <input type="text" id="swal-pregunta" class="swal2-input" style="width: 100%; margin: 0;" placeholder="Ej: ¿Nombre de tu primera mascota?" value="${isEditing ? (user.pregunta_seguridad || "") : ""}" autocomplete="off">
                    </div>

                    <div style="margin-bottom: 12px;">
                        <label for="swal-respuesta" style="font-weight: 600; display: block; margin-bottom: 4px; font-size: 0.9em;">Respuesta de Seguridad</label>
                        <input type="text" id="swal-respuesta" class="swal2-input" style="width: 100%; margin: 0;" placeholder="${isEditing ? "Dejar en blanco para no cambiar" : "Respuesta de seguridad"}" autocomplete="off">
                    </div>

                    <div style="text-align: right; margin-top: 8px;">
                        <button type="button" id="btn-limpiar" style="background: none; border: none; color: #6c757d; text-decoration: underline; cursor: pointer; font-size: 0.85em;">Limpiar</button>
                    </div>
                </div>
            `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      focusConfirm: false,
      didOpen: () => {
        // Lógica para mostrar/ocultar contraseña
        document
          .getElementById("togglePassword")
          .addEventListener("click", () => {
            const passwordInput = document.getElementById("swal-password");
            const icon = document.querySelector("#togglePassword i");
            if (passwordInput.type === "password") {
              passwordInput.type = "text";
              icon.classList.remove("fa-eye");
              icon.classList.add("fa-eye-slash");
            } else {
              passwordInput.type = "password";
              icon.classList.remove("fa-eye-slash");
              icon.classList.add("fa-eye");
            }
          });

        // Lógica para limpiar campos
        document.getElementById("btn-limpiar").addEventListener("click", () => {
          document.getElementById("swal-nombre").value = "";
          document.getElementById("swal-username").value = "";
          document.getElementById("swal-password").value = "";
          document.getElementById("swal-pregunta").value = "";
          document.getElementById("swal-respuesta").value = "";
          document.getElementById("swal-rol").value = "Vendedor";
        });
      },
      preConfirm: () => {
        const nombre = document.getElementById("swal-nombre").value;
        // CORRECCIÓN: Se usa 'username' para que el backend lo acepte
        const username = document.getElementById("swal-username").value;
        const password = document.getElementById("swal-password").value;
        const rol = document.getElementById("swal-rol").value;
        const pregunta_seguridad = document.getElementById("swal-pregunta").value.trim();
        const respuesta_seguridad = document.getElementById("swal-respuesta").value.trim();

        if (!nombre || !username) {
          Swal.showValidationMessage(
            "El nombre y el usuario son obligatorios.",
          );
          return false;
        }
        if (!isEditing && !password) {
          Swal.showValidationMessage(
            "La contraseña es obligatoria para nuevos usuarios.",
          );
          return false;
        }

        const data = { nombre, username, rol, pregunta_seguridad: pregunta_seguridad || null };
        if (password) {
          data.password = password;
        }
        if (respuesta_seguridad) {
          data.respuesta_seguridad = respuesta_seguridad;
        }
        return data;
      },
    }).then(async (result) => {
      if (result.isConfirmed) {
        guardarUsuario(result.value, isEditing ? user.id : null);
      }
    });
  };

  const guardarUsuario = async (data, id) => {
    const isEditing = id !== null;
    const url = isEditing ? `${API_URL}/${id}` : API_URL;
    const method = isEditing ? "PUT" : "POST";

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al guardar el usuario.");
      }

      Swal.fire(
        "¡Éxito!",
        `Usuario ${isEditing ? "actualizado" : "creado"} correctamente.`,
        "success",
      );
      fetchUsuarios();
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  };

  window.eliminarUsuario = (id) => {
    Swal.fire({
      title: "¿Estás seguro?",
      text: "¡No podrás revertir esto!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Sí, ¡bórralo!",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const response = await fetch(`${API_URL}/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          if (!response.ok) throw new Error("Error al eliminar");

          Swal.fire("¡Eliminado!", "El usuario ha sido eliminado.", "success");
          fetchUsuarios();
        } catch (error) {
          Swal.fire("Error", "No se pudo eliminar el usuario.", "error");
        }
      }
    });
  };

  // --- Event Listeners Iniciales ---
  btnNuevoUsuario.addEventListener("click", () => openUserModal());

  // Inicializar la carga de usuarios
  fetchUsuarios();
});
