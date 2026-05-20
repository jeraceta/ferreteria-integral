document.addEventListener("DOMContentLoaded", function () {
  const BASE_API_URL = "http://localhost:3000"; // Definir la URL base del backend

  /**
   * Secure Fetch Wrapper
   * Handles JWT token authentication for all API requests.
   * - Retrieves token from localStorage.
   * - Redirects to login if token is missing.
   * - Adds Authorization header to requests.
   * - Handles 401/403 errors by redirecting to login.
   * @param {string} url - The URL to fetch.
   * @param {object} options - The options for the fetch request.
   * @returns {Promise<any>} - The response from the server.
   */
  async function secureFetch(url, options = {}) {
    const token = localStorage.getItem("token");

    if (!token) {
      Swal.fire({
        title: "Acceso denegado",
        text: "No has iniciado sesión. Serás redirigido al login.",
        icon: "error",
        timer: 2500,
        willClose: () => {
          window.location.href = "login.html"; // Redirect to login page
        },
      });
      return Promise.reject(new Error("No token found"));
    }

    const defaultHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const mergedOptions = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, mergedOptions);

      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token"); // Clear invalid token
        Swal.fire({
          title: "Sesión expirada",
          text: "Tu sesión ha caducado. Por favor, inicia sesión de nuevo.",
          icon: "warning",
          willClose: () => {
            window.location.href = "login.html";
          },
        });
        return Promise.reject(new Error("Unauthorized"));
      }

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        let errorData;
        if (contentType && contentType.includes("application/json")) {
          errorData = await response.json();
        } else {
          errorData = { message: await response.text() };
        }
        throw new Error(
          errorData.message || `HTTP error! status: ${response.status}`,
        );
      }

      if (contentType && contentType.includes("application/json")) {
        return response.json();
      }
      return response; // Return the whole response for non-JSON types (like blobs)
    } catch (error) {
      // Rethrow network errors or errors from the fetch call itself
      console.error("Fetch Error:", error);
      throw error;
    }
  }

  // --- GLOBAL PAGINATION VARIABLES ---
  let currentPage = 1;
  const itemsPerPage = 10; // Puedes ajustar este valor
  let totalPages = 1;
  let lastSearchedCedula = ""; // Para mantener la cédula/RIF buscada en la paginación

  // Referencias a elementos del DOM
  const cedulaRifSearchInput = document.getElementById("cedulaRifSearchInput");
  const btnBuscarVentas = document.getElementById("btnBuscarVentas");
  const ventasTableBody = document.getElementById("ventasTableBody");
  const loadingSpinner = document.getElementById("loadingSpinner");
  const noResultsMessage = document.getElementById("noResultsMessage");
  const initialMessageRow = document.getElementById("initialMessageRow");
  const paginationControls = document.getElementById("paginationControls"); // Referencia a los controles de paginación

  // Referencias del modal de devolución (existente)
  const devolucionModalElement = document.getElementById("devolucionModal");
  const devolucionModal = new bootstrap.Modal(devolucionModalElement);
  const motivoDevolucionSelect = document.getElementById("motivoDevolucion");
  const ventaIdDevolucionInput = document.getElementById(
    "ventaIdDevolucionInput",
  );
  const modalVentaInfo = document.getElementById("modalVentaInfo");
  const modalVentaItemsBody = document.getElementById("modalVentaItemsBody");
  const devolucionForm = document.getElementById("devolucionForm");

  let allVentas = []; // Para almacenar las ventas de la página actual

  // Cargar motivos de devolución al iniciar
  cargarMotivosDevolucion();

  // --- EVENT LISTENERS DE BÚSQUEDA Y PAGINACIÓN ---
  btnBuscarVentas.addEventListener("click", () => {
    currentPage = 1; // Resetear a la primera página en cada nueva búsqueda
    buscarVentasPorCedula();
  });
  cedulaRifSearchInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      currentPage = 1; // Resetear a la primera página en cada nueva búsqueda
      buscarVentasPorCedula();
    }
  });

  // Event listeners para los botones de paginación (delegación de eventos)
  paginationControls.addEventListener("click", (event) => {
    if (event.target.closest("#btnAnteriorPage")) {
      if (currentPage > 1) {
        currentPage--;
        buscarVentasPorCedula();
      }
    } else if (event.target.closest("#btnSiguientePage")) {
      if (currentPage < totalPages) {
        currentPage++;
        buscarVentasPorCedula();
      }
    }
  });

  // --- FUNCIÓN PRINCIPAL DE BÚSQUEDA ---
  async function buscarVentasPorCedula() {
    const cedulaRif = cedulaRifSearchInput.value.trim();
    lastSearchedCedula = cedulaRif; // Guardar la última cédula buscada

    if (!lastSearchedCedula) {
      Swal.fire(
        "Atención",
        "Por favor, ingrese una Cédula o RIF para buscar.",
        "warning",
      );
      return;
    }

    loadingSpinner.classList.remove("d-none");
    noResultsMessage.classList.add("d-none");
    if (initialMessageRow) initialMessageRow.classList.add("d-none");

    ventasTableBody.innerHTML = "";
    paginationControls.innerHTML = "";

    try {
      const url = `${BASE_API_URL}/api/ventas/buscar-por-cedula/${lastSearchedCedula}?page=${currentPage}&limit=${itemsPerPage}`;
      const respuestaBackend = await secureFetch(url);

      console.log("Respuesta cruda del servidor:", respuestaBackend);

      // Nota del Aprendiz: // Solucionamos el error de visualización. El servidor ya entrega los datos correctamente, así que ajustamos el Frontend para que sepa 'desempaquetar' el objeto JSON correctamente (leyendo la propiedad .data) y renderice la tabla de historial.
      const ventas = respuestaBackend.data || respuestaBackend;
      allVentas = Array.isArray(ventas) ? ventas : [];

      if (respuestaBackend.total) {
        totalPages = Math.ceil(respuestaBackend.total / itemsPerPage);
      } else {
        totalPages = 1;
      }

      if (allVentas.length > 0) {
        renderVentas(allVentas);
        updatePaginationUI();
      } else {
        noResultsMessage.classList.remove("d-none");
        paginationControls.innerHTML = "";
      }
    } catch (error) {
      console.error("Error al buscar ventas:", error);
      if (
        error.message !== "Unauthorized" &&
        error.message !== "No token found"
      ) {
        Swal.fire(
          "Error",
          error.message || "Hubo un problema al buscar las ventas.",
          "error",
        );
      }
      noResultsMessage.classList.remove("d-none");
      paginationControls.innerHTML = "";
    } finally {
      loadingSpinner.classList.add("d-none");
    }
  }

  // --- RENDERIZADO DE LA TABLA DE VENTAS ---
  function renderVentas(ventas) {
    ventasTableBody.innerHTML = "";

    ventas.forEach((venta) => {
      const row = document.createElement("tr");

      const estadoNormalizado = (venta.estado || "").toLowerCase();
      let estadoClass = "text-secondary";
      if (estadoNormalizado === "completada") {
        estadoClass = "text-success";
      } else if (
        estadoNormalizado === "anulada" ||
        estadoNormalizado === "devuelta"
      ) {
        estadoClass = "text-danger";
      }

      const formatCurrency = (value) => {
        value = parseFloat(value);
        return isNaN(value) ? "0.00" : value.toFixed(2);
      };

      const displayValue = (value, isCurrency = false, currencySymbol = "") => {
        if (value === null || value === undefined) {
          return isCurrency ? `0.00 ${currencySymbol}`.trim() : "-";
        }
        const formattedValue = isCurrency ? formatCurrency(value) : value;
        return isCurrency
          ? `${formattedValue} ${currencySymbol}`.trim()
          : formattedValue;
      };

      row.innerHTML = `
                <td>${venta.numero_control || "Pendiente"}</td>
                <td>${displayValue(
                  new Date(venta.fecha_venta).toLocaleDateString(),
                )}</td>
                <td>${displayValue(venta.subtotal, true, "$")}</td>
                <td>${displayValue(venta.impuesto, true, "$")}</td>
                <td>${displayValue(venta.total, true, "$")}</td>
                <td>${displayValue(venta.total_bolivares, true, "Bs")}</td>
                <td><span class="${estadoClass}">${displayValue(
                  venta.estado,
                )}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary view-pdf-btn" data-id="${
                      venta.id
                    }" title="Ver Factura">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-danger cancel-sale-btn" data-id="${
                      venta.id
                    }" ${
                      estadoNormalizado === "devuelta" ||
                      estadoNormalizado === "anulada"
                        ? "disabled"
                        : ""
                    } style="cursor: pointer;" title="Anular Venta">
                        <i class="fas fa-ban"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-warning return-sale-btn" data-id="${
                      venta.id
                    }" ${
                      estadoNormalizado === "devuelta" ||
                      estadoNormalizado === "anulada"
                        ? "disabled"
                        : ""
                    } style="cursor: pointer;" title="Procesar Devolución">
                        <i class="fas fa-undo-alt"></i>
                    </button>
                </td>
            `;
      ventasTableBody.appendChild(row);
    });
  }

  // --- FUNCIÓN PARA ACTUALIZAR LA UI DE PAGINACIÓN ---
  function updatePaginationUI() {
    paginationControls.innerHTML = "";

    if (totalPages <= 1) return;

    const liAnterior = document.createElement("li");
    liAnterior.className = `page-item ${currentPage === 1 ? "disabled" : ""}`;
    liAnterior.innerHTML = `<a class="page-link" href="#" id="btnAnteriorPage">Anterior</a>`;
    paginationControls.appendChild(liAnterior);

    const liInfo = document.createElement("li");
    liInfo.className = "page-item disabled";
    liInfo.innerHTML = `<span class="page-link">Página ${currentPage} de ${totalPages}</span>`;
    paginationControls.appendChild(liInfo);

    const liSiguiente = document.createElement("li");
    liSiguiente.className = `page-item ${
      currentPage === totalPages ? "disabled" : ""
    }`;
    liSiguiente.innerHTML = `<a class="page-link" href="#" id="btnSiguientePage">Siguiente</a>`;
    paginationControls.appendChild(liSiguiente);
  }

  // --- CARGA DE MOTIVOS DE DEVOLUCIÓN ---
  async function cargarMotivosDevolucion() {
    const motivoSelect = document.getElementById("motivoDevolucion");
    try {
      const motivos = await secureFetch(
        `${BASE_API_URL}/api/ventas/motivos-devolucion`,
      );
      motivoSelect.innerHTML =
        '<option value="" selected disabled>Seleccione un motivo...</option>';
      motivos.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.motivo;
        motivoSelect.appendChild(option);
      });
    } catch (error) {
      console.error("Error al cargar motivos:", error);
      if (
        error.message !== "Unauthorized" &&
        error.message !== "No token found"
      ) {
        motivoSelect.innerHTML =
          '<option value="" selected disabled>Error al cargar motivos</option>';
        motivoSelect.disabled = true;
      }
    }
  }

  // --- LÓGICA DE ACCIONES EN LA TABLA (Ver PDF y Devolución) ---
  document
    .getElementById("ventasTableBody")
    .addEventListener("click", async function (e) {
      const viewBtn = e.target.closest(".view-pdf-btn");
      if (viewBtn) {
        const ventaId = viewBtn.dataset.id;
        const token = localStorage.getItem("token");
        try {
          // Usamos fetch nativo para poder llamar .blob() directamente.
          // secureFetch procesa internamente la respuesta y no permite
          // acceder al blob de un PDF (application/pdf).
          // Fase 3: Abrir la ventana emergente ANTES del fetch para evitar el bloqueo del navegador
          const pdfWindow = window.open("", "_blank");
          if (!pdfWindow) {
            Swal.fire("Atención", "El navegador bloqueó la ventana emergente. Por favor, permita ventanas emergentes para este sitio.", "warning");
            return;
          }
          pdfWindow.document.write("<h3>Generando PDF...</h3>");

          const response = await fetch(
            `${BASE_API_URL}/api/ventas/reporte/${ventaId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!response.ok) {
            pdfWindow.close();
            const errText = await response.text();
            throw new Error(errText || `Error ${response.status}`);
          }

          const blob = await response.blob();
          const pdfUrl = URL.createObjectURL(blob);
          pdfWindow.location.href = pdfUrl;
          
          // Liberar la URL del objeto pasado 1 minuto
          setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
        } catch (error) {
          console.error("Error al obtener PDF de la factura:", error);
          Swal.fire("Error", "No se pudo generar el reporte en PDF. Revise la consola para más detalles.", "error");
        }
        return;
      }

      const returnBtn = e.target.closest(".return-sale-btn");
      if (returnBtn) {
        const ventaId = returnBtn.dataset.id;
        await abrirModalDevolucion(ventaId);
      }

      const cancelBtn = e.target.closest(".cancel-sale-btn");
      if (cancelBtn) {
        const ventaId = cancelBtn.dataset.id;
        handleAnularVenta(ventaId);
      }
    });

  async function handleAnularVenta(ventaId) {
    const result = await Swal.fire({
      title: "¿Estás seguro?",
      text: "Esta acción anulará la venta y restaurará el stock. ¡No podrás revertir esto!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, ¡anular!",
      cancelButtonText: "No, cancelar",
    });

    if (result.isConfirmed) {
      try {
        const response = await secureFetch(
          `${BASE_API_URL}/api/ventas/anular/${ventaId}`,
          {
            method: "PUT",
          },
        );
        Swal.fire(
          "¡Anulada!",
          response.message || "La venta ha sido anulada.",
          "success",
        );
        buscarVentasPorCedula(); // Recargar la lista de ventas
      } catch (error) {
        console.error("Error al anular la venta:", error);
        if (
          error.message !== "Unauthorized" &&
          error.message !== "No token found"
        ) {
          Swal.fire(
            "Error",
            error.message || "No se pudo anular la venta.",
            "error",
          );
        }
      }
    }
  }

  // --- ABRIR MODAL DE DEVOLUCIÓN ---
  async function abrirModalDevolucion(ventaId) {
    const venta = allVentas.find((v) => v.id == ventaId);
    if (!venta) {
      console.error("No se encontró la venta con ID:", ventaId);
      Swal.fire(
        "Error",
        "No se pudieron cargar los datos de la venta para la devolución.",
        "error",
      );
      return;
    }

    ventaIdDevolucionInput.value = venta.id;
    modalVentaInfo.textContent = `Venta #${
      venta.numero_control || venta.id
    } - Cliente: ${venta.cliente_nombre || "N/A"}`;
    modalVentaItemsBody.innerHTML = "";

    try {
      const detalles = await secureFetch(
        `${BASE_API_URL}/api/ventas/${ventaId}/original-detalles`,
      );

      if (detalles.length === 0) {
        modalVentaItemsBody.innerHTML = `<tr><td colspan="3">No se encontraron productos para esta venta.</td></tr>`;
      } else {
        detalles.forEach((item) => {
          const row = document.createElement("tr");
          row.dataset.idProducto = item.id_producto;
          row.innerHTML = `
              <td>${item.nombre}</td>
              <td>${item.cantidad_vendida}</td>
              <td>
                  <input type="number" class="form-control form-control-sm cantidad-a-devolver" value="0" min="0" max="${item.cantidad_vendida}">
              </td>
          `;
          modalVentaItemsBody.appendChild(row);
        });
      }
    } catch (error) {
      console.error(error);
      if (
        error.message !== "Unauthorized" &&
        error.message !== "No token found"
      ) {
        modalVentaItemsBody.innerHTML = `<tr><td colspan="3">No se pudieron cargar los artículos.</td></tr>`;
      }
    }

    devolucionModal.show();
  }

  devolucionForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const ventaId = ventaIdDevolucionInput.value;
    const motivoId = motivoDevolucionSelect.value;
    const comentario = document.getElementById("comentarioDevolucion").value;
    const id_deposito = document.getElementById("depositoDestino").value;

    if (!motivoId || !comentario || !id_deposito) {
      Swal.fire(
        "¡Atención!",
        "Por favor, complete todos los campos: motivo, depósito y comentario.",
        "warning",
      );
      return;
    }

    const detalles = [];
    const itemRows = modalVentaItemsBody.querySelectorAll("tr");

    itemRows.forEach((row) => {
      const id_producto = row.dataset.idProducto;
      const inputCantidad = row.querySelector(".cantidad-a-devolver");
      const cantidad = inputCantidad ? parseInt(inputCantidad.value, 10) : 0;

      if (id_producto && cantidad > 0) {
        detalles.push({ id_producto, cantidad });
      }
    });

    if (detalles.length === 0) {
      Swal.fire(
        "¡Atención!",
        "Debe especificar la cantidad a devolver para al menos un producto.",
        "warning",
      );
      return;
    }

    const datosParaElServidor = {
      id_motivo: motivoId,
      comentario: comentario,
      id_deposito: id_deposito,
      detalles: detalles,
    };

    try {
      const resultado = await secureFetch(
        `${BASE_API_URL}/api/ventas/devolucion/${ventaId}`,
        {
          method: "POST",
          body: JSON.stringify(datosParaElServidor),
        },
      );

      Swal.fire(
        "¡Listo!",
        resultado.message || "La devolución se procesó correctamente.",
        "success",
      );

      if (resultado.id_devolucion) {
        try {
          // Fase 3: Abrir ventana emergente ANTES de fetch
          const pdfWindow = window.open("", "_blank");
          if (pdfWindow) {
            pdfWindow.document.write("<h3>Generando PDF de Devolución...</h3>");
            const response = await fetch(
              `${BASE_API_URL}/api/ventas/reporte-devolucion/${resultado.id_devolucion}`,
              { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
            );
            if (response.ok) {
               const blob = await response.blob();
               const pdfUrl = URL.createObjectURL(blob);
               pdfWindow.location.href = pdfUrl;
               setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
            } else {
               pdfWindow.close();
            }
          }
        } catch (pdfError) {
          console.error("Error generating return PDF", pdfError);
          // The main operation succeeded, so we don't show a blocking error
        }
      }

      devolucionModal.hide();
      devolucionForm.reset();
      buscarVentasPorCedula();
    } catch (error) {
      console.error("Hubo un problema al procesar la devolución:", error);
      if (
        error.message !== "Unauthorized" &&
        error.message !== "No token found"
      ) {
        Swal.fire(
          "¡Error!",
          error.message || "No se pudo completar la devolución.",
          "error",
        );
      }
    }
  });
});
