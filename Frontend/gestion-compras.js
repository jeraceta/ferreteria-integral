const API_COMPRAS_URL = "http://localhost:3000/api/compras";

document.addEventListener("DOMContentLoaded", () => {
  cargarHistorial();

  const searchInput = document.getElementById("searchPurchaseInput");
  searchInput.addEventListener("input", (e) => {
    const termino = e.target.value.trim();
    if (termino.length >= 2 || termino.length === 0) {
      cargarHistorial(termino);
    }
  });
});

async function cargarHistorial(termino = "") {
  const tableBody = document.getElementById("comprasTableBody");
  const spinner = document.getElementById("loadingSpinner");

  spinner.classList.remove("d-none");
  tableBody.innerHTML = "";

  try {
    const response = await fetch(`${API_COMPRAS_URL}?termino=${termino}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    const compras = await response.json();
    spinner.classList.add("d-none");

    if (compras.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center">No se encontraron compras.</td></tr>`;
      return;
    }

    compras.forEach((compra) => {
      const fecha = new Date(compra.fecha_compra).toLocaleDateString();
      const nroControl = `C-${compra.id.toString().padStart(5, "0")}`;

      tableBody.innerHTML += `
                <tr>
                    <td>${nroControl}</td>
                    <td>${fecha}</td>
                    <td>${compra.proveedor_nombre}</td>
                    <td>${compra.nro_factura_provider || compra.nro_factura_proveedor || "-"}</td>
                    <td class="fw-bold">$${parseFloat(compra.total).toFixed(2)}</td>
                    <td><span class="badge bg-success">${compra.estado}</span></td>
                    <td>
                        <button class="btn btn-sm btn-outline-primary" onclick="imprimirComprobante(${compra.id})" title="Imprimir PDF">
                            <i class="fas fa-file-pdf"></i>
                        </button>
                    </td>
                </tr>
            `;
    });
  } catch (error) {
    console.error("Error al cargar historial:", error);
    spinner.classList.add("d-none");
    Swal.fire("Error", "No se pudo cargar el historial de compras.", "error");
  }
}

async function imprimirComprobante(idCompra) {
  try {
    Swal.fire({
      title: "Generando PDF...",
      didOpen: () => Swal.showLoading(),
      allowOutsideClick: false,
    });

    const response = await fetch(`${API_COMPRAS_URL}/reporte/${idCompra}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    });

    if (response.status === 401) {
      window.location.href = "login.html";
      return;
    }

    if (!response.ok) throw new Error("Error en el servidor");

    const blob = await response.blob();

    // Usar un método más robusto para abrir el PDF
    const file = new Blob([blob], { type: "application/pdf" });
    const fileURL = URL.createObjectURL(file);

    Swal.close();

    // Intentar abrir en nueva pestaña
    const win = window.open(fileURL, "_blank");
    if (win) {
      win.focus();
    } else {
      // Si el bloqueador de popups lo impide, ofrecer descarga
      Swal.fire({
        title: "Bloqueador de ventanas",
        text: "Su navegador bloqueó la apertura del PDF. ¿Desea descargarlo?",
        icon: "info",
        showCancelButton: true,
        confirmButtonText: "Sí, descargar",
        cancelButtonText: "Cancelar",
      }).then((result) => {
        if (result.isConfirmed) {
          const link = document.createElement("a");
          link.href = fileURL;
          link.download = `Comprobante_Compra_${idCompra}.pdf`;
          link.click();
        }
      });
    }
  } catch (error) {
    console.error("Error al imprimir:", error);
    Swal.fire("Error", "No se pudo generar el reporte.", "error");
  }
}

async function exportarExcel() {
  try {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "login.html";
      return;
    }

    const searchInput = document.getElementById("searchPurchaseInput");
    const termino = searchInput ? searchInput.value : "";

    Swal.fire({
      title: "Generando Excel...",
      text: "Por favor espere un momento.",
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const urlParams = new URLSearchParams({ termino });
    const response = await fetch(
      `${API_COMPRAS_URL}/exportar-excel?${urlParams}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error("Error al generar el reporte");
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reporte_Compras_${new Date().toISOString().split("T")[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    Swal.close();
  } catch (error) {
    console.error("Error en exportarExcel:", error);
    Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo generar el archivo Excel.",
    });
  }
}
