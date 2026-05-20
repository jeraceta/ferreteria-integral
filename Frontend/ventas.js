document.addEventListener("DOMContentLoaded", () => {
  console.log("Sistema de Ventas Iniciado");
  // --- CAPTURA DE ELEMENTOS DEL DOM ---
  const btnBuscarCliente = document.getElementById("btnBuscarCliente");
  const btnGuardarCliente = document.getElementById("btnGuardarCliente");
  const btnLimpiarCliente = document.getElementById("btnLimpiarCliente");
  const tipoDocumentoCliente = document.getElementById("tipoDocumentoCliente");
  const clienteRifCedulaInput = document.getElementById("clienteRifCedula");
  const clienteRazonSocialInput = document.getElementById("clienteRazonSocial");
  const clienteDireccionInput = document.getElementById("clienteDireccion");
  const clienteTelefonoInput = document.getElementById("clienteTelefono");
  const clienteEmailInput = document.getElementById("clienteEmail");
  const tipoContribuyenteSelect = document.getElementById("tipoContribuyente");
  const tasaCambioInput = document.getElementById("tasaCambioInput");
  const cobrarIvaSwitch = document.getElementById("cobrarIvaSwitch");
  const ivaRow = document.getElementById("ivaRow");
  const inputBusqueda = document.getElementById("buscarProductoInput");
  const listaSugerencias = document.getElementById("listaSugerenciasProductos");

  // --- VARIABLES DE ESTADO ---
  let clienteActual = null;
  let productosEnVenta = []; // Array para almacenar los objetos completos de los productos en la venta

  // --- NUEVA LÓGICA DE PAGOS COMBINADOS ---
  let listaPagos = [];
  let totalFactura = 0;
  let modalTotalizar; // Instancia del modal de Bootstrap

  const API_CLIENTES_URL = "http://localhost:3000/api/clientes";
  const API_VENTAS_URL = "http://localhost:3000/api/ventas";
  const API_PRODUCTOS_URL = "http://localhost:3000/api/productos";

  // --- NUEVA LÓGICA DE VERIFICACIÓN DE CAJA ---
  const verificarEstadoCaja = async () => {
    try {
      const response = await fetch(`${API_VENTAS_URL}/estado-caja`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      if (!response.ok) {
        console.warn(
          "No se pudo verificar el estado de la caja. El backend aplicará la validación final.",
        );
        return;
      }
      const data = await response.json();
      if (data.cajaCerrada) {
        const btnTotalizar = document.querySelector(
          "button[onclick='abrirModalTotalizar()']",
        );
        if (btnTotalizar) {
          btnTotalizar.disabled = true;
          btnTotalizar.innerHTML =
            '<i class="fas fa-lock me-2"></i> CAJA CERRADA';
          btnTotalizar.classList.remove("btn-primary");
          btnTotalizar.classList.add("btn-danger");
        }
        const banner = document.getElementById("bannerCajaCerrada");
        if (banner) {
          banner.classList.remove("d-none");
        }
        if (inputBusqueda) {
          inputBusqueda.disabled = true;
          inputBusqueda.placeholder =
            "La caja está cerrada. No se pueden agregar productos.";
        }
      }
    } catch (error) {
      console.error("Error al verificar estado de la caja:", error);
    }
  };

  // --- DEFINICIÓN DE FUNCIONES ---

  /**
   * @description Muestra los detalles completos de un producto en un modal.
   * @param {number} index El índice del producto en el array `productosEnVenta`.
   */
  window.verDetalleProducto = function (index) {
    const producto = productosEnVenta[index];
    if (!producto) {
      console.error("No se encontró el producto en el índice:", index);
      Swal.fire(
        "Error",
        "No se pudo encontrar la información del producto.",
        "error",
      );
      return;
    }

    const htmlContent = `
        <div style="text-align: left; padding: 1rem;">
            <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                <strong >Producto:</strong> ${producto.nombre} 
                <span class="badge bg-secondary" style="font-size: 0.9rem; vertical-align: middle;">${producto.marca || "Genérico"}</span>
            </p>
            <p style="font-size: 1rem; color: #555;"><strong>Código:</strong> ${producto.codigo}</p>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 1.1rem;">
                <p><strong>💰 Precio Venta:</strong> <span style="color: #28a745;">$${parseFloat(producto.precio_venta).toFixed(2)}</span></p>
                <p style="color: #d63384;"><strong>🔐 Costo Interno:</strong> $${parseFloat(producto.precio_costo).toFixed(2)}</p>
            </div>
            <p style="font-size: 1rem;"><strong>📦 Stock Disponible:</strong> ${producto.stock} unidades</p>
            <hr>
            <p style="font-size: 1rem;"><strong>📝 Descripción:</strong></p>
            <p style="font-style: italic; color: #6c757d; background-color: #f8f9fa; padding: 0.5rem; border-radius: 5px;">
                ${producto.descripcion || "Sin descripción detallada."}
            </p>
        </div>
    `;

    Swal.fire({
      title: "Ficha Técnica del Producto",
      html: htmlContent,
      confirmButtonText: "Cerrar",
      width: "50%",
      customClass: {
        title: "swal2-title-custom",
        htmlContainer: "swal2-html-container-custom",
      },
    });
  };

  /**
   * @description Calcula y actualiza todos los montos de la venta en la pantalla.
   * Incluye subtotal, IVA, flete y los totales generales en USD y Bolívares.
   * Se ejecuta cada vez que cambia un valor relevante (cantidad, flete, tasa, etc.).
   */
  function actualizarTotales() {
    const IVA_RATE = 0.16; // 16% de IVA

    let subtotalUSD = 0;
    const filasProductos = document.querySelectorAll("#productosVentaBody tr");
    const tasaCambio = parseFloat(tasaCambioInput.value) || 1;
    const cobrarIva = cobrarIvaSwitch.checked;

    if (ivaRow) {
      ivaRow.style.display = cobrarIva ? "" : "none";
    }

    filasProductos.forEach((fila) => {
      const cantidadInput = fila.querySelector(".cantidad-producto");
      const precio = parseFloat(cantidadInput.dataset.precio) || 0;
      const cantidad = parseFloat(cantidadInput.value) || 0;
      const subtotalFila = precio * cantidad;

      fila.querySelector(".subtotal-producto").textContent =
        subtotalFila.toFixed(2);
      subtotalUSD += subtotalFila;
    });

    const ivaUSD = cobrarIva ? subtotalUSD * IVA_RATE : 0;
    const totalUSD = subtotalUSD + ivaUSD;
    const totalBS = totalUSD * tasaCambio;

    // Inyectar los resultados en el DOM
    document.getElementById("subtotalVenta").textContent =
      subtotalUSD.toFixed(2);
    document.getElementById("ivaVenta").textContent = ivaUSD.toFixed(2);

    document.getElementById("totalVenta").textContent = totalUSD.toFixed(2);

    // Montos en Bolívares
    document.getElementById("subtotalVentaBS").textContent = (
      subtotalUSD * tasaCambio
    ).toFixed(2);
    document.getElementById("ivaVentaBS").textContent = (
      ivaUSD * tasaCambio
    ).toFixed(2);
    document.getElementById("totalVentaBS").textContent =
      totalBS.toLocaleString("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
  }

  // --- RESTO DE FUNCIONES (SIN CAMBIOS IMPORTANTES) ---
  function toggleClientFieldsReadOnly(isReadOnly) {
    clienteRazonSocialInput.readOnly = isReadOnly;
    clienteDireccionInput.readOnly = isReadOnly;
    clienteTelefonoInput.readOnly = isReadOnly;
    clienteEmailInput.readOnly = isReadOnly;
    tipoContribuyenteSelect.disabled = isReadOnly;
    clienteRifCedulaInput.readOnly = isReadOnly;
    tipoDocumentoCliente.disabled = isReadOnly;
  }

  function limpiarCamposCliente() {
    tipoDocumentoCliente.value = "V";
    clienteRifCedulaInput.value = "";
    clienteRazonSocialInput.value = "";
    clienteDireccionInput.value = "";
    clienteTelefonoInput.value = "";
    clienteEmailInput.value = "";
    tipoContribuyenteSelect.value = "Ordinario";
    clienteActual = null;
    productosEnVenta = []; // Limpiar el array de productos en venta
    toggleClientFieldsReadOnly(false);
    clienteRifCedulaInput.focus();
  }

  const buscarCliente = async () => {
    const tipoDoc = tipoDocumentoCliente.value;
    const numeroDoc = clienteRifCedulaInput.value.trim();
    if (!numeroDoc) {
      Swal.fire(
        "Faltan datos",
        "Por favor, ingresa el RIF o Cédula.",
        "warning",
      );
      return;
    }
    try {
      const url = `${API_CLIENTES_URL}/buscar?rif_cedula=${encodeURIComponent(numeroDoc)}&tipo_documento=${encodeURIComponent(tipoDoc)}`;
      btnBuscarCliente.disabled = true;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });
      btnBuscarCliente.disabled = false;
      if (response.status === 404) {
        const result = await Swal.fire({
          title: "Cliente no encontrado",
          text: "¿Deseas registrar a este cliente ahora?",
          icon: "info",
          showCancelButton: true,
          confirmButtonText: "Sí, habilitar registro",
          cancelButtonText: "No, corregir número",
        });
        if (result.isConfirmed) {
          clienteActual = null;
          toggleClientFieldsReadOnly(false);
          clienteRifCedulaInput.readOnly = false;
          tipoDocumentoCliente.disabled = false;
          clienteRazonSocialInput.focus();
        } else {
          clienteRifCedulaInput.focus();
        }
        return;
      }
      if (!response.ok) throw new Error("Error en la respuesta del servidor");
      const clienteEncontrado = await response.json();
      clienteActual = clienteEncontrado;
      clienteRazonSocialInput.value = clienteEncontrado.razon_social || "";
      clienteDireccionInput.value = clienteEncontrado.direccion_fiscal || "";
      clienteTelefonoInput.value = clienteEncontrado.telefono || "";
      clienteEmailInput.value = clienteEncontrado.email || "";
      tipoContribuyenteSelect.value =
        clienteEncontrado.tipo_contribuyente || "Ordinario";
      if (clienteEncontrado.tipo_documento) {
        tipoDocumentoCliente.value = clienteEncontrado.tipo_documento;
      }
      toggleClientFieldsReadOnly(true);
      Swal.fire({
        icon: "success",
        title: "Cliente Encontrado",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (error) {
      console.error("Error buscando cliente:", error);
      btnBuscarCliente.disabled = false;
      Swal.fire("Error", "No se pudo conectar con el servidor.", "error");
    }
  };

  async function registrarCliente() {
    if (clienteActual && clienteActual.id) {
      Swal.fire("Información", "Este cliente ya está registrado.", "info");
      return;
    }
    const nuevoClienteData = {
      tipo_documento: tipoDocumentoCliente.value,
      rif_cedula: clienteRifCedulaInput.value.trim(),
      razon_social: clienteRazonSocialInput.value.trim(),
      direccion_fiscal: clienteDireccionInput.value.trim(),
      telefono: clienteTelefonoInput.value.trim(),
      email: clienteEmailInput.value.trim(),
      tipo_contribuyente: tipoContribuyenteSelect.value,
    };
    if (!nuevoClienteData.rif_cedula || !nuevoClienteData.razon_social) {
      Swal.fire(
        "Datos incompletos",
        "Cédula/RIF y Razón Social son obligatorios.",
        "warning",
      );
      return;
    }
    try {
      const url = `${API_CLIENTES_URL}/registrar`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(nuevoClienteData),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Error: ${response.status}`);
      }
      const clienteCreado = await response.json();
      if (clienteCreado && clienteCreado.id) {
        clienteActual = clienteCreado;
        toggleClientFieldsReadOnly(true);
        Swal.fire("¡Éxito!", "Cliente registrado correctamente.", "success");
      } else {
        throw new Error("Respuesta inválida del servidor.");
      }
    } catch (error) {
      Swal.fire(
        "Error al registrar",
        `No se pudo guardar. Detalle: ${error.message}`,
        "error",
      );
    }
  }

  function agregarProductoATabla(producto) {
    if (producto.stock <= 0) {
      Swal.fire(
        "Sin Existencia",
        "El artículo seleccionado no tiene existencia en inventario.",
        "warning",
      );
      return;
    }

    const tablaBody = document.getElementById("productosVentaBody");
    const filaExistente = tablaBody.querySelector(
      `tr[data-producto-id="${producto.id}"]`,
    );
    if (filaExistente) {
      const cantidadInput = filaExistente.querySelector(".cantidad-producto");
      const nuevaCantidad = (parseFloat(cantidadInput.value) || 0) + 1;
      if (nuevaCantidad <= producto.stock) {
        cantidadInput.value = nuevaCantidad;
        actualizarTotales();
      } else {
        Swal.fire(
          "Stock Insuficiente",
          `Solo hay ${producto.stock} unidades.`,
          "warning",
        );
      }
      return;
    }
    // 1. Guardar el objeto completo en el array de la venta actual.
    productosEnVenta.push(producto);
    const index = productosEnVenta.length - 1;

    const fila = document.createElement("tr");
    fila.setAttribute("data-producto-id", producto.id);
    fila.innerHTML = `
        <td>${producto.codigo}</td>
        <td>${producto.nombre}</td>
        <td>${producto.marca || "-"}</td>
        <td class="precio-producto-celda" style="cursor: pointer;" title="Doble clic para editar"><span>${parseFloat(producto.precio_venta).toFixed(2)}</span></td>
        <td><input type="number" class="form-control form-control-sm cantidad-producto" value="1" min="1" max="${producto.stock}" data-precio="${producto.precio_venta}" data-stock="${producto.stock}" style="width: 70px;"></td>
        <td class="subtotal-producto">${parseFloat(producto.precio_venta).toFixed(2)}</td>
        <td>
            <button class="btn btn-info btn-sm" onclick="verDetalleProducto(${index})" title="Ver detalles">
                <i class="fas fa-info-circle"></i>
            </button>
            <button class="btn btn-danger btn-sm eliminar-producto" data-id="${producto.id}" title="Eliminar">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    tablaBody.appendChild(fila);

    const cantidadInput = fila.querySelector(".cantidad-producto");
    const precioCelda = fila.querySelector(".precio-producto-celda");

    precioCelda.addEventListener("dblclick", () => {
      const span = precioCelda.querySelector("span");
      const originalPrice = parseFloat(span.textContent);
      const input = document.createElement("input");
      input.type = "number";
      input.className = "form-control form-control-sm";
      input.value = originalPrice.toFixed(2);
      input.style.width = "100px";

      span.style.display = "none";
      precioCelda.appendChild(input);
      input.focus();
      input.select();

      const finalizarEdicion = async (guardar) => {
        const nuevoPrecio = parseFloat(input.value);

        if (
          guardar &&
          nuevoPrecio !== originalPrice &&
          !isNaN(nuevoPrecio) &&
          nuevoPrecio > 0
        ) {
          const confirmacion = await Swal.fire({
            title: "¿Cambiar el precio?",
            text: `El precio de "${producto.nombre}" cambiará de ${originalPrice.toFixed(2)} a ${nuevoPrecio.toFixed(2)}. ¿Confirmas?`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Sí, cambiar",
            cancelButtonText: "No, cancelar",
          });

          if (confirmacion.isConfirmed) {
            span.textContent = nuevoPrecio.toFixed(2);
            cantidadInput.dataset.precio = nuevoPrecio.toFixed(2);
            // Actualizar el precio en el array en memoria
            productosEnVenta[index].precio_venta = nuevoPrecio.toFixed(2);
            actualizarTotales();
          }
        }

        input.remove();
        span.style.display = "inline";
      };

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          input.blur(); // Dispara el evento blur para guardar
        } else if (e.key === "Escape") {
          e.preventDefault();
          input.value = originalPrice.toFixed(2); // Restaura valor original
          input.blur(); // Dispara el evento blur sin guardar
        }
      });

      input.addEventListener("blur", () => finalizarEdicion(true));
    });

    cantidadInput.addEventListener("input", () => {
      const cantidadActual = parseFloat(cantidadInput.value);
      const maxStock = parseFloat(cantidadInput.getAttribute("data-stock"));
      if (cantidadActual > maxStock) {
        Swal.fire(
          "Stock Insuficiente",
          `Solo hay ${maxStock} unidades.`,
          "warning",
        );
        cantidadInput.value = maxStock;
      }
      actualizarTotales();
    });

    fila.querySelector(".eliminar-producto").addEventListener("click", (e) => {
      const idParaEliminar = e.currentTarget.getAttribute("data-id");
      const indiceParaEliminar = productosEnVenta.findIndex(
        (p) => p.id == idParaEliminar,
      );

      if (indiceParaEliminar > -1) {
        productosEnVenta.splice(indiceParaEliminar, 1);
        // Volver a renderizar la tabla para re-calcular los índices
        renderizarTablaVenta();
      } else {
        // Si no se encuentra, simplemente removemos la fila (comportamiento fallback)
        e.currentTarget.closest("tr").remove();
      }
      actualizarTotales();
    });

    actualizarTotales();
  }

  /**
   * @description Renderiza de nuevo toda la tabla de productos en venta.
   * Es útil cuando se elimina un producto para re-calcular los índices.
   */
  function renderizarTablaVenta() {
    const tablaBody = document.getElementById("productosVentaBody");
    tablaBody.innerHTML = ""; // Limpiar la tabla
    const productosCopia = [...productosEnVenta]; // Crear copia para no mutar el array original
    productosEnVenta = []; // Limpiar el array principal
    productosCopia.forEach((p) => agregarProductoATabla(p)); // Volver a agregar cada producto
  }

  function seleccionarProducto(producto) {
    agregarProductoATabla(producto);
    inputBusqueda.value = "";
    listaSugerencias.innerHTML = "";
    listaSugerencias.style.display = "none";
    setTimeout(() => {
        inputBusqueda.focus();
    }, 10);
  }

  function mostrarSugerencias(productos) {
    if (!listaSugerencias) return;
    listaSugerencias.innerHTML = "";
    if (productos.length === 0) {
      listaSugerencias.style.display = "none";
      return;
    }
    productos.forEach((producto) => {
      const item = document.createElement("div");
      item.classList.add("sugerencia-item");

      // Formatear precio con separadores de miles y dos decimales
      const precioFormateado = new Intl.NumberFormat("es-VE", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(producto.precio_venta);

      // Misión: Maquetación con alineación de extremos y separadores.
      item.innerHTML = `
        <div class="sugerencia-bloque-izquierdo">
            <span class="sugerencia-codigo">${producto.codigo}</span>
            <span class="sugerencia-nombre">${producto.nombre}</span>
            ${producto.marca ? '<span class="sugerencia-separador">•</span>' : ""}
            <span class="sugerencia-marca">${producto.marca || ""}</span>
        </div>
        <div class="sugerencia-bloque-derecho">
            <span class="sugerencia-precio">$ ${precioFormateado}</span>
            <span class="sugerencia-stock">Stock: ${producto.stock}</span>
        </div>
      `;

      if (producto.stock <= 0) {
        item.classList.add("disabled-suggestion");
        item.title = "Sin existencia en inventario";
      } else {
        item.addEventListener("mousedown", (e) => {
          e.preventDefault(); // Mantiene el foco en el input
          seleccionarProducto(producto);
        });
      }
      listaSugerencias.appendChild(item);
    });
    listaSugerencias.style.display = "block";
  }

  // --- ASIGNACIÓN DE EVENTOS ---
  if (btnBuscarCliente)
    btnBuscarCliente.addEventListener("click", buscarCliente);
  if (clienteRifCedulaInput) {
    clienteRifCedulaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        buscarCliente();
      }
    });
  }
  if (btnGuardarCliente)
    btnGuardarCliente.addEventListener("click", registrarCliente);
  if (btnLimpiarCliente)
    btnLimpiarCliente.addEventListener("click", limpiarCamposCliente);
  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", async (e) => {
      const texto = e.target.value;
      if (texto.length < 2) {
        if (listaSugerencias) listaSugerencias.style.display = "none";
        return;
      }
      try {
        const resp = await fetch(
          `${API_PRODUCTOS_URL}/buscar?termino=${texto}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
          },
        );
        if (!resp.ok) throw new Error("Error en la respuesta del servidor");
        const productos = await resp.json();
        mostrarSugerencias(productos);
      } catch (err) {
        console.error("Error buscando productos:", err);
      }
    });
    inputBusqueda.addEventListener("blur", () => {
      setTimeout(() => {
        if (listaSugerencias) listaSugerencias.style.display = "none";
      }, 150);
    });
  }

  // --- Inicialización y Eventos Adicionales ---
  if (tasaCambioInput) {
    const tasaGuardada = localStorage.getItem("ultimaTasaCambio");
    tasaCambioInput.value = tasaGuardada || "1.00";
    tasaCambioInput.addEventListener("input", (e) => {
      localStorage.setItem("ultimaTasaCambio", e.target.value);
      actualizarTotales();
    });
  }
  if (cobrarIvaSwitch)
    cobrarIvaSwitch.addEventListener("change", actualizarTotales);

  // --- Ejecuciones Iniciales ---
  verificarEstadoCaja(); // Llamar a la nueva función
  actualizarTotales();

  // ===================================================================
  // INICIO: NUEVA LÓGICA DE PAGOS COMBINADOS Y MODAL DE TOTALIZACIÓN
  // ===================================================================

  // Inicializar la instancia del modal para poder controlarla por JS
  modalTotalizar = new bootstrap.Modal(
    document.getElementById("modalTotalizar"),
  );

  // --- NUEVOS ELEMENTOS Y EVENTOS DEL MODAL AUTOMATIZADO ---
  const inputMontoDolares = document.getElementById("inputMontoDolares");
  const inputMontoBolivares = document.getElementById("inputMontoBolivares");
  const inputReferenciaPago = document.getElementById("inputReferenciaPago");

  inputMontoDolares.addEventListener("input", () => {
    const tasa = parseFloat(tasaCambioInput.value) || 1;
    const dolares = parseFloat(inputMontoDolares.value) || 0;
    // Usamos un timeout de 0 para evitar conflictos si el usuario escribe muy rápido
    setTimeout(() => {
      inputMontoBolivares.value = (dolares * tasa).toFixed(2);
    }, 0);
  });

  inputMontoBolivares.addEventListener("input", () => {
    const tasa = parseFloat(tasaCambioInput.value) || 1;
    const bolivares = parseFloat(inputMontoBolivares.value) || 0;
    if (tasa > 0) {
      setTimeout(() => {
        inputMontoDolares.value = (bolivares / tasa).toFixed(2);
      }, 0);
    }
  });

  // NUEVO: Agilizar con Teclado (Enter para agregar pago)
  const agregarPagoConEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // Simula clic en el botón para mantener la lógica centralizada
      document.querySelector("button[onclick='agregarPago()']").click();
    }
  };

  inputMontoDolares.addEventListener("keydown", agregarPagoConEnter);
  inputMontoBolivares.addEventListener("keydown", agregarPagoConEnter);
  inputReferenciaPago.addEventListener("keydown", agregarPagoConEnter);
  document
    .getElementById("selectMetodoPago")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault(); // Evita que se cierre el modal
    });

  // CRÍTICO: Listener para la tecla F3
  document.addEventListener("keydown", (e) => {
    if (e.key === "F3") {
      e.preventDefault(); // Evita el comportamiento por defecto del navegador
      abrirModalTotalizar();
    }
  });

  window.abrirModalTotalizar = function () {
    totalFactura =
      parseFloat(document.getElementById("totalVenta").textContent) || 0;

    if (totalFactura <= 0) {
      Swal.fire(
        "Venta Vacía",
        "Agregue productos a la venta antes de totalizar.",
        "warning",
      );
      return;
    }

    // NUEVO: Actualizar tasa en el modal
    const tasa = parseFloat(tasaCambioInput.value) || 1;
    document.getElementById("tasaModal").textContent = tasa.toFixed(2);

    listaPagos = [];
    actualizarModalPagos();
    modalTotalizar.show();
    document.getElementById("inputMontoDolares").focus();
  };

  window.agregarPago = function () {
    const metodo = document.getElementById("selectMetodoPago").value;
    // Siempre tomamos el monto en dólares como la fuente de verdad
    const monto =
      parseFloat(document.getElementById("inputMontoDolares").value) || 0;
    const referencia = document.getElementById("inputReferenciaPago").value;

    const totalAbonado = listaPagos.reduce((acc, pago) => acc + pago.monto, 0);
    const restante = totalFactura - totalAbonado;

    if (monto <= 0) {
      Swal.fire(
        "Monto Inválido",
        "El monto del pago debe ser mayor a cero.",
        "error",
      );
      return;
    }

    // NUEVO: Bloqueo de excesos
    if (monto > restante + 0.009) {
      // Tolerancia para decimales
      Swal.fire(
        "Monto Excedido",
        `El pago no puede ser mayor al saldo restante de $${restante.toFixed(2)}.`,
        "warning",
      );
      return;
    }

    listaPagos.push({ metodo, monto, referencia });
    actualizarModalPagos();

    // Limpiar solo la referencia, los montos se actualizarán con el nuevo restante
    document.getElementById("inputReferenciaPago").value = "";
    document.getElementById("inputMontoDolares").focus(); // Foco vuelve al monto
  };

  function actualizarModalPagos() {
    const totalAbonado = listaPagos.reduce((acc, pago) => acc + pago.monto, 0);
    const restante = totalFactura - totalAbonado;
    const tasa = parseFloat(tasaCambioInput.value) || 1;

    // Actualizar resumen de la columna 1
    document.getElementById("txtTotalPagarDolares").textContent =
      `$${totalFactura.toFixed(2)}`;
    document.getElementById("txtRestanteDolares").textContent =
      `$${restante.toFixed(2)}`;
    document.getElementById("txtRestante").textContent =
      `${(restante * tasa).toFixed(2)} Bs`;
    document.getElementById("txtTotalAbonado").textContent =
      `${(totalAbonado * tasa).toFixed(2)} Bs`;

    const tablaPagosBody = document.getElementById("tablaPagosAgregados");
    tablaPagosBody.innerHTML = "";
    listaPagos.forEach((pago, index) => {
      const montoBs = (pago.monto * tasa).toFixed(2);
      tablaPagosBody.innerHTML += `
              <tr>
                  <td>${pago.metodo}</td>
                  <td>${pago.referencia || "-"}</td>
                  <td>${montoBs} Bs</td>
                  <td>
                      <button class="btn btn-danger btn-sm" onclick="eliminarPago(${index})">X</button>
                  </td>
              </tr>
          `;
    });

    const btnFinalizar = document.getElementById("btnFinalizarVenta");
    const txtRestanteEl = document.getElementById("txtRestante");

    // NUEVO: Sugerencia automática de monto restante
    const inputDolares = document.getElementById("inputMontoDolares");
    const inputBolivares = document.getElementById("inputMontoBolivares");

    const restantePositivo = Math.max(0, restante); // No sugerir montos negativos
    inputDolares.value = restantePositivo.toFixed(2);
    inputBolivares.value = (restantePositivo * tasa).toFixed(2);

    if (restante <= 0.009) {
      // Tolerancia para decimales
      btnFinalizar.disabled = false;
      txtRestanteEl.classList.remove("text-danger");
      txtRestanteEl.classList.add("text-success");
      btnFinalizar.focus(); // Poner foco en el botón para finalizar con Enter
    } else {
      btnFinalizar.disabled = true;
      txtRestanteEl.classList.add("text-danger");
      txtRestanteEl.classList.remove("text-success");
    }
  }

  window.eliminarPago = function (index) {
    listaPagos.splice(index, 1);
    actualizarModalPagos();
  };

  window.procesarVentaFinal = async function () {
    if (!clienteActual || !clienteActual.id) {
      Swal.fire(
        "Cliente no definido",
        "Por favor, busca o registra un cliente.",
        "warning",
      );
      return;
    }

    const detalles = productosEnVenta
      .map((p) => {
        const fila = document.querySelector(`tr[data-producto-id="${p.id}"]`);
        const cantidad = parseFloat(
          fila.querySelector(".cantidad-producto").value,
        );
        const precio_unitario = parseFloat(
          fila.querySelector(".cantidad-producto").dataset.precio,
        );
        return { id_producto: p.id, cantidad, precio_unitario };
      })
      .filter((d) => d.cantidad > 0);

    if (detalles.length === 0) {
      Swal.fire(
        "Venta vacía",
        "No hay productos con cantidad válida.",
        "warning",
      );
      return;
    }

    const payload = {
      id_cliente: clienteActual.id,
      tasa_bcv: parseFloat(tasaCambioInput.value) || 1,
      subtotal:
        parseFloat(document.getElementById("subtotalVenta").textContent) || 0,
      impuesto:
        parseFloat(document.getElementById("ivaVenta").textContent) || 0,
      total: totalFactura,
      detalles: detalles,
      pagos: listaPagos, // ¡El array de pagos que soluciona el error 400!
    };

    console.log("Enviando al backend:", JSON.stringify(payload, null, 2));

    try {
      Swal.fire({
        title: "Procesando...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      // CORRECCIÓN DE RUTA: Se apunta a /registrar como define ventas.routes.js
      const response = await fetch(`${API_VENTAS_URL}/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || `Error ${response.status}`);
      }

      Swal.fire({
        title: "¡Venta registrada!",
        text: `Venta N° ${result.id_venta} procesada. ¿Deseas imprimir la Nota de Entrega?`,
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Sí, imprimir",
        cancelButtonText: "No, finalizar",
      }).then(async (action) => {
        if (action.isConfirmed) {
          // Fase 3: Abrir la ventana emergente ANTES del fetch para evitar el bloqueo del navegador
          const pdfWindow = window.open("", "_blank");
          if (!pdfWindow) {
            Swal.fire("Atención", "El navegador bloqueó la ventana emergente. Por favor, permita ventanas emergentes para este sitio.", "warning");
          } else {
            pdfWindow.document.write("<h3>Generando Factura PDF...</h3>");
            try {
              const response = await fetch(
                `${API_VENTAS_URL}/reporte/${result.id_venta}`,
                {
                  headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                  },
                },
              );
              if (!response.ok) throw new Error("No se pudo generar el PDF.");
  
              const blob = await response.blob();
              const pdfUrl = URL.createObjectURL(blob);
              pdfWindow.location.href = pdfUrl;
              setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000); // Limpiar memoria
            } catch (pdfError) {
              pdfWindow.close();
              Swal.fire("Error de Reporte", pdfError.message, "error");
            }
          }
        }
        window.location.reload();
      });
    } catch (error) {
      Swal.fire(
        "Error",
        `No se pudo procesar la venta. Detalle: ${error.message}`,
        "error",
      );
      console.error(error);
    }
  };

  // NUEVO: Confirmación final con Enter
  document
    .getElementById("btnFinalizarVenta")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.target.disabled) {
        e.preventDefault();
        procesarVentaFinal();
      }
    });

  // ===================================================================
  // FIN: NUEVA LÓGICA DE PAGOS COMBINADOS
  // ===================================================================

  console.log("✅ Conexión exitosa: Listeners de Ventas activos");
});
