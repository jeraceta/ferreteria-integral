document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:3000/api/proveedores";
  const token = localStorage.getItem("token");
  let proveedores = [];
  let modalProveedor;
  let modalReporte;

  // Elementos del DOM
  const tablaProveedores = document.getElementById("tablaProveedores");
  const inputBuscar = document.getElementById("inputBuscarProveedor");
  const btnNuevo = document.getElementById("btnNuevoProveedor");
  const btnReporte = document.getElementById("btnReporteProveedores");
  const btnExportarXLSHeader = document.querySelector(
    ".btn-success[onclick='abrirModalReporte()']",
  );
  const btnGenerarPDF = document.getElementById("btnGenerarPDF");
  const btnGenerarExcelModal = document.getElementById("btnGenerarExcelModal");
  const formProveedor = document.getElementById("formProveedor");
  const modalElement = document.getElementById("modalProveedor");
  const modalReporteElement = document.getElementById("modalReporteConfig");

  if (modalElement) {
    modalProveedor = new bootstrap.Modal(modalElement);
  }
  if (modalReporteElement) {
    modalReporte = new bootstrap.Modal(modalReporteElement);
  }

  // --- FUNCIONES PRINCIPALES ---

  async function cargarProveedores() {
    try {
      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Error al cargar proveedores");
      proveedores = await response.json();
      renderizarTabla(proveedores);
    } catch (error) {
      console.error(error);
      tablaProveedores.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Error cargando datos: ${error.message}</td></tr>`;
    }
  }

  function renderizarTabla(lista) {
    tablaProveedores.innerHTML = "";
    if (lista.length === 0) {
      tablaProveedores.innerHTML =
        '<tr><td colspan="6" class="text-center">No hay proveedores registrados.</td></tr>';
      return;
    }

    lista.forEach((proveedor) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td>${proveedor.rif}</td>
                <td>${proveedor.razon_social}</td>
                <td>${proveedor.persona_contacto || "-"}</td>
                <td>${proveedor.telefono || "-"}</td>
                <td>${proveedor.email || "-"}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1 btn-editar" data-id="${proveedor.id}" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-eliminar" data-id="${proveedor.id}" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
      tablaProveedores.appendChild(tr);
    });

    // Asignar eventos a los botones generados
    document.querySelectorAll(".btn-editar").forEach((btn) => {
      btn.addEventListener("click", () => abrirModalEditar(btn.dataset.id));
    });
    document.querySelectorAll(".btn-eliminar").forEach((btn) => {
      btn.addEventListener("click", () => confirmarEliminar(btn.dataset.id));
    });
  }

  function abrirModalNuevo() {
    formProveedor.reset();
    document.getElementById("proveedorId").value = "";
    document.getElementById("modalProveedorLabel").textContent =
      "Registrar Proveedor";
    modalProveedor.show();
  }

  function abrirModalEditar(id) {
    const proveedor = proveedores.find((p) => p.id == id);
    if (!proveedor) return;

    document.getElementById("proveedorId").value = proveedor.id;
    document.getElementById("rifProveedor").value = proveedor.rif;
    document.getElementById("razonSocialProveedor").value =
      proveedor.razon_social;
    document.getElementById("personaContacto").value =
      proveedor.persona_contacto || "";
    document.getElementById("telefonoProveedor").value =
      proveedor.telefono || "";
    document.getElementById("emailProveedor").value = proveedor.email || "";
    document.getElementById("direccionFiscalProveedor").value =
      proveedor.direccion || "";

    document.getElementById("modalProveedorLabel").textContent =
      "Editar Proveedor";
    modalProveedor.show();
  }

  async function guardarProveedor(e) {
    e.preventDefault();

    const id = document.getElementById("proveedorId").value;

    // 📥 Obtenemos el RIF tal como lo escribió el usuario (ej: "J-12345678")
    const rifInput = document.getElementById("rifProveedor").value.trim();

    // 🔍 Parseamos el RIF para extraer tipo_documento y numero_documento
    // El RIF viene en formato "X-XXXXXXXX" donde:
    // X = tipo_documento (J para Jurídica, V para Venezolano, etc)
    // XXXXXXXX = numero_documento (el número sin el guión)
    const rifParts = rifInput.split("-");

    // ✅ Validamos que el RIF tenga el formato correcto (debe tener un guión)
    if (
      rifParts.length !== 2 ||
      rifParts[0].length === 0 ||
      rifParts[1].length === 0
    ) {
      Swal.fire(
        "Error",
        "RIF debe estar en formato: X-XXXXXXXX (ej: J-12345678)",
        "warning",
      );
      return;
    }

    // 🎯 Construimos el objeto de datos que enviaremos al backend
    const datos = {
      tipo_documento: rifParts[0], // Primera parte del RIF (ej: "J")
      numero_documento: rifParts[1], // Segunda parte del RIF (ej: "12345678")
      rif: rifInput, // El RIF completo (para compatibilidad)
      razon_social: document
        .getElementById("razonSocialProveedor")
        .value.trim(),
      persona_contacto: document.getElementById("personaContacto").value.trim(),
      telefono: document.getElementById("telefonoProveedor").value.trim(),
      email: document.getElementById("emailProveedor").value.trim(),
      direccion: document
        .getElementById("direccionFiscalProveedor")
        .value.trim(),
    };

    // 🛡️ Validamos que los campos obligatorios tengan valor
    if (!datos.rif || !datos.razon_social) {
      Swal.fire("Error", "RIF y Razón Social son obligatorios.", "warning");
      return;
    }

    // 🚀 Decidimos si es un CREATE (POST) o UPDATE (PUT)
    const metodo = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/${id}` : `${API_URL}/registrar`;

    try {
      const response = await fetch(url, {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // 📤 Enviamos el objeto 'datos' convertido a JSON (string)
        body: JSON.stringify(datos),
      });

      // ❌ Si la respuesta no es OK (status 200-299), tratamos como error
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al guardar");
      }

      // ✅ ¡Éxito! Mostramos mensaje y recargamos la tabla
      Swal.fire("¡Éxito!", "Proveedor guardado correctamente.", "success");
      modalProveedor.hide();
      cargarProveedores();
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  }

  async function confirmarEliminar(id) {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "No podrás revertir esta acción.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (result.isConfirmed) {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) throw new Error("No se pudo eliminar el proveedor.");

        Swal.fire("Eliminado", "El proveedor ha sido eliminado.", "success");
        cargarProveedores();
      } catch (error) {
        Swal.fire("Error", error.message, "error");
      }
    }
  }

  // --- GENERACIÓN DE REPORTES ---

  function abrirModalReporte() {
    modalReporte.show();
  }

  async function generarReportePDF() {
    const columnas = [];
    document.querySelectorAll(".col-check:checked").forEach((check) => {
      columnas.push({
        campo: check.value,
        titulo: check.nextElementSibling.innerText,
      });
    });

    if (columnas.length === 0) {
      Swal.fire(
        "Atención",
        "Debe seleccionar al menos una columna.",
        "warning",
      );
      return;
    }

    const config = {
      columnas: columnas,
      orderBy: document.getElementById("reporteOrderBy").value,
      orderDir: document.getElementById("reporteOrderDir").value,
    };

    try {
      const response = await fetch(`${API_URL}/reporte-pdf`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) throw new Error("Error generando el reporte.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank");
      modalReporte.hide();
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  }

  // --- EVENT LISTENERS ---

  if (btnNuevo) {
    btnNuevo.addEventListener("click", abrirModalNuevo);
  }

  if (btnReporte) {
    btnReporte.addEventListener("click", abrirModalReporte);
  }

  if (btnGenerarPDF) {
    btnGenerarPDF.addEventListener("click", generarReportePDF);
  }

  if (btnGenerarExcelModal) {
    btnGenerarExcelModal.addEventListener("click", generarReporteExcel);
  }

  if (btnExportarXLSHeader) {
    btnExportarXLSHeader.removeAttribute("onclick");
    btnExportarXLSHeader.addEventListener("click", abrirModalReporte);
  }

  if (formProveedor) {
    formProveedor.addEventListener("submit", guardarProveedor);
  }

  if (inputBuscar) {
    inputBuscar.addEventListener("input", (e) => {
      const termino = e.target.value.toLowerCase();
      const filtrados = proveedores.filter(
        (p) =>
          p.razon_social.toLowerCase().includes(termino) ||
          p.rif.toLowerCase().includes(termino) ||
          (p.persona_contacto &&
            p.persona_contacto.toLowerCase().includes(termino)),
      );
      renderizarTabla(filtrados);
    });
  }

  // Inicializar
  cargarProveedores();
});

async function generarReporteExcel() {
  const columnas = [];
  document.querySelectorAll(".col-check:checked").forEach((check) => {
    columnas.push({
      campo: check.value,
      titulo: check.nextElementSibling.innerText,
    });
  });

  if (columnas.length === 0) {
    Swal.fire("Atención", "Debe seleccionar al menos una columna.", "warning");
    return;
  }

  const config = {
    columnas: columnas,
    orderBy: document.getElementById("reporteOrderBy").value,
    orderDir: document.getElementById("reporteOrderDir").value,
  };

  try {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    const modalRes = bootstrap.Modal.getInstance(
      document.getElementById("modalReporteConfig"),
    );

    Swal.fire({
      title: "Generando Excel...",
      text: "Por favor espere un momento.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const response = await fetch(
      `http://localhost:3000/api/proveedores/exportar-excel`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      },
    );

    if (!response.ok) {
      throw new Error("Error al generar el reporte Excel");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Proveedores_${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    Swal.close();
    if (modalRes) {
      modalRes.hide();
    }
  } catch (error) {
    console.error("Error en generarReporteExcel:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo generar el archivo Excel.",
    });
  }
}
