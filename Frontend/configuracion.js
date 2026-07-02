document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return;
  }

  // Verificar rol del usuario
  const userData = localStorage.getItem("user");
  let userRole = "Vendedor"; // default
  if (userData) {
    try {
      const user = JSON.parse(userData);
      userRole = user.rol;
    } catch (e) {
      console.error("Error al parsear datos del usuario:", e);
    }
  }

  const API_URL_USUARIOS = "http://localhost:3000/api/usuarios";
  const API_URL_EMPRESA = "http://localhost:3000/api/configuracion/empresa";
  const API_URL_BACKUP = "http://localhost:3000/api/configuracion/backup";
  const API_URL_RESTORE = "http://localhost:3000/api/configuracion/restore";

  // Control de acceso por rol
  if (userRole !== "Administrador") {
    // Ocultar tabs de Usuarios y Backup para no administradores
    document.getElementById("usuarios-tab-li").style.display = "none";
    document.getElementById("backup-tab-li").style.display = "none";
  }

  // === DATOS DE EMPRESA ===
  const empresaForm = document.getElementById("empresaForm");
  const razonSocialInput = document.getElementById("razonSocial");
  const rifInput = document.getElementById("rif");
  const direccionInput = document.getElementById("direccion");
  const telefonoInput = document.getElementById("telefono");
  const logoInput = document.getElementById("logo");

  // Cargar datos de empresa
  const cargarDatosEmpresa = async () => {
    try {
      const response = await fetch(API_URL_EMPRESA, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        razonSocialInput.value = data.razon_social || "";
        rifInput.value = data.rif || "";
        direccionInput.value = data.direccion || "";
        telefonoInput.value = data.telefono || "";
      }
    } catch (error) {
      console.error("Error al cargar datos de empresa:", error);
    }
  };

  // Guardar datos de empresa
  empresaForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append("razon_social", razonSocialInput.value);
    formData.append("rif", rifInput.value);
    formData.append("direccion", direccionInput.value);
    formData.append("telefono", telefonoInput.value);
    if (logoInput.files[0]) {
      formData.append("logo", logoInput.files[0]);
    }

    try {
      const response = await fetch(API_URL_EMPRESA, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        Swal.fire(
          "Éxito",
          "Datos de empresa actualizados correctamente",
          "success",
        );
      } else {
        throw new Error("Error al actualizar datos");
      }
    } catch (error) {
      console.error("Error:", error);
      Swal.fire("Error", "No se pudieron actualizar los datos", "error");
    }
  });

  // === USUARIOS (solo para administradores) ===
  if (userRole === "Administrador") {
    const tablaUsuarios = document.getElementById("tablaUsuarios");
    const btnNuevoUsuario = document.getElementById("btnNuevoUsuario");

    const fetchUsuarios = async () => {
      try {
        const response = await fetch(API_URL_USUARIOS, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) throw new Error("Error al cargar usuarios");
        const usuarios = await response.json();
        renderUsuarios(usuarios);
      } catch (error) {
        console.error(error);
        tablaUsuarios.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Error al cargar usuarios</td></tr>`;
      }
    };

    const renderUsuarios = (usuarios) => {
      tablaUsuarios.innerHTML = "";
      if (usuarios.length === 0) {
        tablaUsuarios.innerHTML =
          '<tr><td colspan="4" class="text-center">No hay usuarios registrados</td></tr>';
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
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: isEditing ? "Actualizar" : "Crear",
        cancelButtonText: "Cancelar",
        didOpen: () => {
          const toggleBtn = document.getElementById("togglePassword");
          const passwordInput = document.getElementById("swal-password");
          toggleBtn.addEventListener("click", () => {
            const type =
              passwordInput.type === "password" ? "text" : "password";
            passwordInput.type = type;
            toggleBtn.innerHTML =
              type === "password"
                ? '<i class="fas fa-eye"></i>'
                : '<i class="fas fa-eye-slash"></i>';
          });
        },
        preConfirm: () => {
          const nombre = document.getElementById("swal-nombre").value.trim();
          const username = document
            .getElementById("swal-username")
            .value.trim();
          const password = document.getElementById("swal-password").value;
          const rol = document.getElementById("swal-rol").value;
          const pregunta_seguridad = document.getElementById("swal-pregunta").value.trim();
          const respuesta_seguridad = document.getElementById("swal-respuesta").value.trim();

          if (!nombre || !username || !rol) {
            Swal.showValidationMessage("Todos los campos son obligatorios");
            return false;
          }
          if (!isEditing && !password) {
            Swal.showValidationMessage(
              "La contraseña es obligatoria para nuevos usuarios",
            );
            return false;
          }
          return { nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad };
        },
      }).then((result) => {
        if (result.isConfirmed) {
          const { nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad } = result.value;
          if (isEditing) {
            actualizarUsuario(user.id, {
              nombre,
              username,
              password: password || undefined,
              rol,
              pregunta_seguridad: pregunta_seguridad || null,
              respuesta_seguridad: respuesta_seguridad || undefined,
            });
          } else {
            crearUsuario({ nombre, username, password, rol, pregunta_seguridad, respuesta_seguridad });
          }
        }
      });
    };

    const crearUsuario = async (userData) => {
      try {
        const response = await fetch(API_URL_USUARIOS, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(userData),
        });
        if (!response.ok) throw new Error("Error al crear usuario");
        Swal.fire("Éxito", "Usuario creado correctamente", "success");
        fetchUsuarios();
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo crear el usuario", "error");
      }
    };

    const actualizarUsuario = async (id, userData) => {
      try {
        const response = await fetch(`${API_URL_USUARIOS}/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(userData),
        });
        if (!response.ok) throw new Error("Error al actualizar usuario");
        Swal.fire("Éxito", "Usuario actualizado correctamente", "success");
        fetchUsuarios();
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo actualizar el usuario", "error");
      }
    };

    window.eliminarUsuario = async (id) => {
      const result = await Swal.fire({
        title: "¿Eliminar usuario?",
        text: "Esta acción no se puede deshacer",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Eliminar",
        cancelButtonText: "Cancelar",
      });
      if (result.isConfirmed) {
        try {
          const response = await fetch(`${API_URL_USUARIOS}/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!response.ok) throw new Error("Error al eliminar usuario");
          Swal.fire("Eliminado", "Usuario eliminado correctamente", "success");
          fetchUsuarios();
        } catch (error) {
          console.error(error);
          Swal.fire("Error", "No se pudo eliminar el usuario", "error");
        }
      }
    };

    btnNuevoUsuario.addEventListener("click", () => openUserModal());
    fetchUsuarios();
  }

  // === RESPALDO Y RESTAURACIÓN (solo para administradores) ===
  if (userRole === "Administrador") {
    const btnGenerarBackup = document.getElementById("btnGenerarBackup");
    const btnRestaurar = document.getElementById("btnRestaurar");
    const archivoRestore = document.getElementById("archivoRestore");

    btnGenerarBackup.addEventListener("click", async () => {
      try {
        const response = await fetch(API_URL_BACKUP, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `backup_${new Date().toISOString().split("T")[0]}.sql`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          Swal.fire("Éxito", "Respaldo generado y descargado", "success");
        } else {
          throw new Error("Error al generar respaldo");
        }
      } catch (error) {
        console.error(error);
        Swal.fire("Error", "No se pudo generar el respaldo", "error");
      }
    });

    btnRestaurar.addEventListener("click", async () => {
      const file = archivoRestore.files[0];
      if (!file) {
        Swal.fire("Error", "Seleccione un archivo SQL", "error");
        return;
      }

      const result = await Swal.fire({
        title: "¿Restaurar base de datos?",
        text: "Esta acción sobrescribirá todos los datos actuales",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Restaurar",
        cancelButtonText: "Cancelar",
      });

      if (result.isConfirmed) {
        const formData = new FormData();
        formData.append("backup", file);

        try {
          const response = await fetch(API_URL_RESTORE, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });

          if (response.ok) {
            Swal.fire(
              "Éxito",
              "Base de datos restaurada correctamente",
              "success",
            );
          } else {
            throw new Error("Error al restaurar");
          }
        } catch (error) {
          console.error(error);
          Swal.fire("Error", "No se pudo restaurar la base de datos", "error");
        }
      }
    });
  }

  // === TEMA ===
  // Conecta los botones de la UI con el sistema de CSS Custom Properties.
  // El tema se persiste en localStorage con la clave 'ferreteria_theme'.
  // theme.js lo lee en cada página para aplicarlo antes del primer render.
  const THEME_KEY = "ferreteria_theme";

  const btnTemaOscuro = document.getElementById("btnTemaOscuro");
  const btnTemaClaro  = document.getElementById("btnTemaClaro");

  /**
   * @function aplicarTema
   * @description Persiste y aplica el tema seleccionado al documento actual.
   * Actualiza data-theme en <body>, guarda en localStorage y marca
   * visualmente el botón activo.
   * @param {string} tema - "dark" | "light"
   */
  const aplicarTema = (tema) => {
    // 1. Persistir preferencia
    localStorage.setItem(THEME_KEY, tema);

    // 2. Aplicar al documento (igual que theme.js hace en cada página)
    document.body.setAttribute("data-theme", tema);
    document.documentElement.setAttribute("data-theme", tema);

    // 3. Marcar visualmente el botón activo
    if (tema === "dark") {
      btnTemaOscuro.classList.remove("btn-outline-dark");
      btnTemaOscuro.classList.add("btn-dark");
      btnTemaOscuro.innerHTML = '<i class="fas fa-moon me-2"></i>Tema Oscuro ✓ Activo';

      btnTemaClaro.classList.remove("btn-warning");
      btnTemaClaro.classList.add("btn-outline-secondary");
      btnTemaClaro.innerHTML = '<i class="fas fa-sun me-2"></i>Activar Tema Claro';
    } else {
      btnTemaClaro.classList.remove("btn-outline-secondary");
      btnTemaClaro.classList.add("btn-warning");
      btnTemaClaro.innerHTML = '<i class="fas fa-sun me-2"></i>Tema Claro ✓ Activo';

      btnTemaOscuro.classList.remove("btn-dark");
      btnTemaOscuro.classList.add("btn-outline-dark");
      btnTemaOscuro.innerHTML = '<i class="fas fa-moon me-2"></i>Activar Tema Oscuro';
    }

    Swal.fire({
      icon: "success",
      title: `Tema ${tema === "dark" ? "Oscuro" : "Claro"} activado`,
      text: "El cambio se aplica en todas las ventanas del sistema.",
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 2000,
    });
  };

  // Aplicar el tema guardado al cargar la página de configuración
  const temaGuardado = localStorage.getItem(THEME_KEY) || "light";
  aplicarTema(temaGuardado);

  btnTemaOscuro.addEventListener("click", () => aplicarTema("dark"));
  btnTemaClaro.addEventListener("click",  () => aplicarTema("light"));

  // Cargar datos iniciales
  cargarDatosEmpresa();
});
