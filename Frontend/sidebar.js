document.addEventListener("DOMContentLoaded", () => {
  const sidebarContainer = document.getElementById("sidebar-container");
  // Obtiene el nombre del archivo actual (ej: "dashboard.html") para marcarlo como activo.
  const currentPage = window.location.pathname.split("/").pop();

  if (sidebarContainer) {
    // 1. Carga el contenido del sidebar desde el archivo externo.
    fetch("sidebar.html")
      .then((response) => {
        if (!response.ok) throw new Error("No se pudo cargar sidebar.html");
        return response.text();
      })
      .then((html) => {
        // 2. Inserta el HTML del sidebar en el contenedor.
        sidebarContainer.innerHTML = html;

        // --- LÓGICA A EJECUTAR DESPUÉS DE CARGAR EL SIDEBAR ---

        // 3. Marcar el enlace de la página actual como activo.
        const navLinks = sidebarContainer.querySelectorAll(
          ".list-group-item-action",
        );
        navLinks.forEach((link) => {
          if (link.getAttribute("href") === currentPage) {
            link.classList.add("active");
          }
        });

        // 4. Lógica para expandir submenús si un hijo está activo.
        const activeSubItem =
          sidebarContainer.querySelector(".sub-item.active");
        if (activeSubItem) {
          const submenu = activeSubItem.closest(".collapse");
          if (submenu) {
            submenu.classList.add("show");
            const trigger = document.querySelector(
              `[data-bs-target="#${submenu.id}"]`,
            );
            if (trigger) {
              trigger.classList.add("active-parent");
              trigger.setAttribute("aria-expanded", "true");
            }
          }
        }

        // 5. Lógica de Control de Acceso por Rol.
        const userData = localStorage.getItem("user"); // Corregido: 'user' en vez de 'usuario'
        if (userData) {
          try {
            const user = JSON.parse(userData);
            if (user && user.rol !== "Administrador") {
              const navUsuarios = document.getElementById("nav-usuarios");
              if (navUsuarios) navUsuarios.style.display = "none";
            }
          } catch (e) {
            console.error("Error al parsear los datos del usuario:", e);
          }
        }

        // 6. Lógica del botón de Cerrar Sesión.
        const btnSalir = document.getElementById("btnCerrarSesion");
        if (btnSalir) {
          btnSalir.addEventListener("click", (e) => {
            e.preventDefault();
            Swal.fire({
              title: "¿Cerrar Sesión?",
              text: "Tendrás que ingresar tus credenciales nuevamente para acceder.",
              icon: "warning",
              showCancelButton: true,
              confirmButtonText: "Sí, salir",
              cancelButtonText: "Cancelar",
            }).then((result) => {
              if (result.isConfirmed) {
                localStorage.clear();
                window.location.href = "login.html";
              }
            });
          });
        }
      })
      .catch((error) => {
        console.error("Error al cargar el sidebar:", error);
        sidebarContainer.innerHTML =
          '<p class="text-danger p-3">Error al cargar el menú lateral.</p>';
      });
  }
});
