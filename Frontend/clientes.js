document.addEventListener("DOMContentLoaded", () => {
  const API_URL = "http://localhost:3000/api/clientes";
  const token = localStorage.getItem("token");
  let clientes = [];
  let modalCliente;
  let modalReporte;

  // Elementos del DOM
  const tablaClientes = document.getElementById("tablaClientes");
  const inputBuscar = document.getElementById("inputBuscarCliente");
  const btnNuevo = document.getElementById("btnNuevoCliente");
  const btnReporte = document.getElementById("btnReporteClientes");
  const btnExportarXLSHeader = document.querySelector(".btn-success[onclick='abrirModalReporte()']");
  const btnGenerarPDF = document.getElementById("btnGenerarPDF");
  const btnGenerarExcelModal = document.getElementById("btnGenerarExcelModal");
  const formCliente = document.getElementById("formCliente");
  const modalElement = document.getElementById("modalCliente");
  const modalReporteElement = document.getElementById("modalReporteConfig");

  if (modalElement) {
    modalCliente = new bootstrap.Modal(modalElement);
  }
  if (modalReporteElement) {
    modalReporte = new bootstrap.Modal(modalReporteElement);
  }

  // --- FUNCIONES PRINCIPALES ---

  async function cargarClientes() {
    try {
      const response = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Error al cargar clientes");
      clientes = await response.json();
      renderizarTabla(clientes);
    } catch (error) {
      console.error(error);
      tablaClientes.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Error cargando datos: ${error.message}</td></tr>`;
    }
  }

  function renderizarTabla(lista) {
    tablaClientes.innerHTML = "";
    if (lista.length === 0) {
      tablaClientes.innerHTML =
        '<tr><td colspan="7" class="text-center">No hay clientes registrados.</td></tr>';
      return;
    }

    lista.forEach((cliente) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
                <td><span class="badge bg-secondary">${cliente.tipo_documento || "V"}</span></td>
                <td>${cliente.rif_cedula}</td>
                <td>${cliente.razon_social}</td>
                <td>${cliente.telefono || "-"}</td>
                <td>${cliente.email || "-"}</td>
                <td>${cliente.tipo_contribuyente || "Ordinario"}</td>
                <td class="text-center">
                    <button class="btn btn-sm btn-warning me-1 btn-editar" data-id="${cliente.id}" title="Editar">
                        <i class="fas fa-pencil-alt"></i>
                    </button>
                    <button class="btn btn-sm btn-danger btn-eliminar" data-id="${cliente.id}" title="Eliminar">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
      tablaClientes.appendChild(tr);
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
    formCliente.reset();
    document.getElementById("clienteId").value = "";
    document.getElementById("modalClienteLabel").textContent =
      "Registrar Cliente";
    document.getElementById("tipoDocumento").value = "V"; // Valor por defecto
    document.getElementById("tipoContribuyente").value = "Ordinario";
    modalCliente.show();
  }

  function abrirModalEditar(id) {
    const cliente = clientes.find((c) => c.id == id);
    if (!cliente) return;

    document.getElementById("clienteId").value = cliente.id;
    document.getElementById("tipoDocumento").value =
      cliente.tipo_documento || "V";
    document.getElementById("rifCedula").value = cliente.rif_cedula;
    document.getElementById("razonSocial").value = cliente.razon_social;
    document.getElementById("telefono").value = cliente.telefono || "";
    document.getElementById("email").value = cliente.email || "";
    document.getElementById("direccionFiscal").value =
      cliente.direccion_fiscal || "";
    document.getElementById("tipoContribuyente").value =
      cliente.tipo_contribuyente || "Ordinario";

    document.getElementById("modalClienteLabel").textContent = "Editar Cliente";
    modalCliente.show();
  }

  async function guardarCliente(e) {
    e.preventDefault();

    const id = document.getElementById("clienteId").value;
    const datos = {
      tipo_documento: document.getElementById("tipoDocumento").value,
      rif_cedula: document.getElementById("rifCedula").value.trim(),
      razon_social: document.getElementById("razonSocial").value.trim(),
      telefono: document.getElementById("telefono").value.trim(),
      email: document.getElementById("email").value.trim(),
      direccion_fiscal: document.getElementById("direccionFiscal").value.trim(),
      tipo_contribuyente: document.getElementById("tipoContribuyente").value,
    };

    if (!datos.rif_cedula || !datos.razon_social) {
      Swal.fire(
        "Error",
        "Cédula/RIF y Razón Social son obligatorios.",
        "warning",
      );
      return;
    }

    const metodo = id ? "PUT" : "POST";
    const url = id ? `${API_URL}/${id}` : `${API_URL}/registrar`; // Ajustar según tus rutas backend
    // Nota: Si tu backend usa /registrar para POST y /:id para PUT, ajusta aquí.
    // Asumo que para crear es /registrar según tu código anterior de ventas.js

    try {
      const response = await fetch(url, {
        method: metodo,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(datos),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Error al guardar");
      }

      Swal.fire("¡Éxito!", "Cliente guardado correctamente.", "success");
      modalCliente.hide();
      cargarClientes();
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

        if (!response.ok) throw new Error("No se pudo eliminar el cliente.");

        Swal.fire("Eliminado", "El cliente ha sido eliminado.", "success");
        cargarClientes();
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

  if (formCliente) {
    formCliente.addEventListener("submit", guardarCliente);
  }

  if (inputBuscar) {
    inputBuscar.addEventListener("input", (e) => {
      const termino = e.target.value.toLowerCase();
      const filtrados = clientes.filter(
        (c) =>
          c.razon_social.toLowerCase().includes(termino) ||
          c.rif_cedula.includes(termino),
      );
      renderizarTabla(filtrados);
    });
  }

  // Inicializar
  cargarClientes();
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
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    // Usar la variable modalReporte o hacer un nuevo instance
    const modalRes = bootstrap.Modal.getInstance(document.getElementById("modalReporteConfig"));

    Swal.fire({
      title: "Generando Excel...",
      text: "Por favor espere un momento.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const response = await fetch(`http://localhost:3000/api/clientes/exportar-excel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      throw new Error("Error al generar el reporte Excel");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Clientes_${new Date().toISOString().split("T")[0]}.xlsx`;
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
