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
  const procesarVentaBtn = document.getElementById("procesarVentaBtn");
  const tasaCambioInput = document.getElementById("tasaCambioInput");
  const cobrarIvaSwitch = document.getElementById('cobrarIvaSwitch');
  const ivaRow = document.getElementById("ivaRow");
  const inputBusqueda = document.getElementById("buscarProductoInput");
  const listaSugerencias = document.getElementById("listaSugerenciasProductos");

  // --- Nuevos elementos para Flete y Referencia ---
  const metodoPagoSelect = document.getElementById("metodoPagoSelect");
  const campoReferencia = document.getElementById("campoReferencia");
  const referenciaInput = document.getElementById("referenciaInput");
  const fleteInput = document.getElementById("fleteInput");
  const fleteVenta = document.getElementById("fleteVenta");
  const fleteVentaBS = document.getElementById("fleteVentaBS");


  // --- VARIABLES DE ESTADO ---
  let clienteActual = null;
  const API_CLIENTES_URL = "http://localhost:3000/api/clientes";
  const API_VENTAS_URL = "http://localhost:3000/api/ventas";
  const API_PRODUCTOS_URL = "http://localhost:3000/api/productos";

  // --- DEFINICIÓN DE FUNCIONES ---

  /**
   * @description Esta función se encarga de mostrar u ocultar el campo de 'Referencia'.
   * Lo muestra si el método de pago es algo distinto a 'Efectivo', y lo oculta si lo es.
   * También limpia el campo si se vuelve a seleccionar 'Efectivo'.
   */
  function gestionarVisibilidadReferencia() {
    if (metodoPagoSelect.value === 'Efectivo') {
      campoReferencia.style.display = 'none';
      referenciaInput.value = ''; // Limpiar el valor al ocultar
    } else {
      campoReferencia.style.display = 'block';
    }
  }


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
    const fleteUSD = parseFloat(fleteInput.value) || 0;

    if (ivaRow) {
      ivaRow.style.display = cobrarIva ? "" : "none";
    }

    filasProductos.forEach((fila) => {
      const cantidadInput = fila.querySelector(".cantidad-producto");
      const precio = parseFloat(cantidadInput.dataset.precio) || 0;
      const cantidad = parseFloat(cantidadInput.value) || 0;
      const subtotalFila = precio * cantidad;

      fila.querySelector(".subtotal-producto").textContent = subtotalFila.toFixed(2);
      subtotalUSD += subtotalFila;
    });

    // 1. ¿Por qué sumamos el flete? Por ley, el flete es parte del servicio total
    // y debe incluirse en la base sobre la cual se calcula el impuesto.
    const baseImponibleUSD = subtotalUSD + fleteUSD;

    // 2. ¿Cómo se calcula el nuevo IVA? Se aplica la tasa del 16% a la suma
    // del subtotal de productos más el costo del flete.
    const ivaUSD = cobrarIva ? baseImponibleUSD * IVA_RATE : 0;

    const totalUSD = baseImponibleUSD + ivaUSD; // El total es la base + su impuesto
    const totalBS = totalUSD * tasaCambio;

    // Inyectar los resultados en el DOM
    document.getElementById("subtotalVenta").textContent = subtotalUSD.toFixed(2);
    document.getElementById("ivaVenta").textContent = ivaUSD.toFixed(2);

    if (fleteVenta && fleteVentaBS) {
      fleteVenta.textContent = fleteUSD.toFixed(2);
      fleteVentaBS.textContent = (fleteUSD * tasaCambio).toFixed(2);
    }

    document.getElementById("totalVenta").textContent = totalUSD.toFixed(2);

    // Montos en Bolívares
    document.getElementById("subtotalVentaBS").textContent = (subtotalUSD * tasaCambio).toFixed(2);
    document.getElementById("ivaVentaBS").textContent = (ivaUSD * tasaCambio).toFixed(2);
    document.getElementById("totalVentaBS").textContent = totalBS.toLocaleString("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }


  /**
   * @description Procesa la venta final. Recolecta todos los datos del cliente, 
   * productos, y totales, y los envía al servidor para ser guardados en la base de datos.
   */
  async function procesarVenta() {
    console.log("Procesando venta...");
    if (!clienteActual || !clienteActual.id) {
      Swal.fire(
        "Cliente no definido",
        "Por favor, busca o registra un cliente.",
        "warning",
      );
      return;
    }

    const productos = [];
    const productosVentaBody = document.getElementById("productosVentaBody");
    const filasProductos = productosVentaBody.querySelectorAll("tr");

    if (filasProductos.length === 0) {
      Swal.fire(
        "No hay productos",
        "Por favor, añade productos a la venta.",
        "warning",
      );
      return;
    }

    for (const fila of filasProductos) {
      const id_producto = fila.getAttribute("data-producto-id");
      const cantidadInput = fila.querySelector(".cantidad-producto");
      const cantidad = parseFloat(cantidadInput.value) || 0;
      const precio_unitario =
        parseFloat(cantidadInput.getAttribute("data-precio")) || 0;

      if (cantidad > 0) {
        productos.push({
          id_producto: id_producto,
          cantidad: cantidad,
          precio_unitario: precio_unitario,
        });
      }
    }

    if (productos.length === 0) {
      Swal.fire(
        "Venta vacía",
        "No hay productos con cantidad válida.",
        "warning",
      );
      return;
    }

    const tasa_bcv = parseFloat(tasaCambioInput.value) || 1;
    const subtotal_dolares =
      parseFloat(document.getElementById("subtotalVenta").textContent) || 0;
    const iva_dolares =
      parseFloat(document.getElementById("ivaVenta").textContent) || 0;
    const total_dolares =
      parseFloat(document.getElementById("totalVenta").textContent) || 0;
    const total_bolivares =
      parseFloat(
        document
          .getElementById("totalVentaBS")
          .textContent.replace(/\./g, "")
          .replace(/,/g, "."),
      ) || 0;

    // --- RECOLECCIÓN DE DATOS DE LA VENTA (PAYLOAD PLANO) ---
    const payload = {
      id_cliente: clienteActual.id,
      tasa_bcv: tasa_bcv,
      subtotal: subtotal_dolares,
      iva: iva_dolares,
      total: total_dolares,
      detalles: productos, // 'detalles' es el nombre esperado en el backend
      monto_flete: parseFloat(fleteInput.value) || 0,
      metodo_pago: metodoPagoSelect.value || "Efectivo",
      referencia: referenciaInput.value.trim() || null
    };

    try {
      Swal.fire({
        title: "Procesando Venta...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch(`${API_VENTAS_URL}/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Error al procesar la venta.");

      Swal.fire({
        title: "¡Venta registrada!",
        text: "¿Deseas imprimir la Nota de Entrega?",
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Sí, imprimir",
        cancelButtonText: "No, gracias",
      }).then((action) => {
        if (action.isConfirmed) {
          const ventaId = result.id || result.id_venta || result.insertId;
          window.open(
            `http://localhost:3000/api/ventas/reporte/${ventaId}`,
            "_blank",
          );
        }
        limpiarCamposCliente();
        productosVentaBody.innerHTML = "";
        fleteInput.value = "0"; // Resetear flete
        metodoPagoSelect.value = "Efectivo"; // Resetear método de pago
        gestionarVisibilidadReferencia(); // Ocultar referencia
        actualizarTotales();
      });
    } catch (error) {
      console.error("Error al procesar venta:", error);
      Swal.fire(
        "Error",
        `No se pudo procesar la venta. Detalle: ${error.message}`,
        "error",
      );
    }
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
    toggleClientFieldsReadOnly(false);
    clienteRifCedulaInput.focus();
  }

  const buscarCliente = async () => {
    const tipoDoc = tipoDocumentoCliente.value;
    const numeroDoc = clienteRifCedulaInput.value.trim();
    if (!numeroDoc) {
      Swal.fire("Faltan datos", "Por favor, ingresa el RIF o Cédula.", "warning");
      return;
    }
    try {
      const url = `${API_CLIENTES_URL}/buscar?rif_cedula=${encodeURIComponent(numeroDoc)}&tipo_documento=${encodeURIComponent(tipoDoc)}`;
      btnBuscarCliente.disabled = true;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
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
      tipoContribuyenteSelect.value = clienteEncontrado.tipo_contribuyente || "Ordinario";
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
      Swal.fire("Datos incompletos", "Cédula/RIF y Razón Social son obligatorios.", "warning");
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
      Swal.fire("Error al registrar", `No se pudo guardar. Detalle: ${error.message}`, "error");
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
    const filaExistente = tablaBody.querySelector(`tr[data-producto-id="${producto.id}"]`);
    if (filaExistente) {
      const cantidadInput = filaExistente.querySelector(".cantidad-producto");
      const nuevaCantidad = (parseFloat(cantidadInput.value) || 0) + 1;
      if (nuevaCantidad <= producto.stock) {
        cantidadInput.value = nuevaCantidad;
        actualizarTotales();
      } else {
        Swal.fire("Stock Insuficiente", `Solo hay ${producto.stock} unidades.`, "warning");
      }
      return;
    }
    const fila = document.createElement("tr");
    fila.setAttribute("data-producto-id", producto.id);
    fila.innerHTML = `
        <td>${producto.codigo}</td>
        <td>${producto.nombre}</td>
        <td class="precio-producto-celda" style="cursor: pointer;" title="Doble clic para editar"><span>${parseFloat(producto.precio_venta).toFixed(2)}</span></td>
        <td><input type="number" class="form-control form-control-sm cantidad-producto" value="1" min="1" max="${producto.stock}" data-precio="${producto.precio_venta}" data-stock="${producto.stock}" style="width: 70px;"></td>
        <td class="subtotal-producto">${parseFloat(producto.precio_venta).toFixed(2)}</td>
        <td><button class="btn btn-danger btn-sm eliminar-producto"><i class="fas fa-trash"></i></button></td>
    `;
    tablaBody.appendChild(fila);

    const cantidadInput = fila.querySelector(".cantidad-producto");
    const precioCelda = fila.querySelector(".precio-producto-celda");

    precioCelda.addEventListener('dblclick', () => {
        const span = precioCelda.querySelector('span');
        const originalPrice = parseFloat(span.textContent);
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'form-control form-control-sm';
        input.value = originalPrice.toFixed(2);
        input.style.width = '100px';

        span.style.display = 'none';
        precioCelda.appendChild(input);
        input.focus();
        input.select();

        const finalizarEdicion = async (guardar) => {
            const nuevoPrecio = parseFloat(input.value);

            if (guardar && nuevoPrecio !== originalPrice && !isNaN(nuevoPrecio) && nuevoPrecio > 0) {
                const confirmacion = await Swal.fire({
                    title: '¿Cambiar el precio?',
                    text: `El precio de "${producto.nombre}" cambiará de ${originalPrice.toFixed(2)} a ${nuevoPrecio.toFixed(2)}. ¿Confirmas?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cambiar',
                    cancelButtonText: 'No, cancelar'
                });

                if (confirmacion.isConfirmed) {
                    span.textContent = nuevoPrecio.toFixed(2);
                    cantidadInput.dataset.precio = nuevoPrecio.toFixed(2);
                    actualizarTotales();
                }
            }
            
            input.remove();
            span.style.display = 'inline';
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur(); // Dispara el evento blur para guardar
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.value = originalPrice.toFixed(2); // Restaura valor original
                input.blur(); // Dispara el evento blur sin guardar
            }
        });

        input.addEventListener('blur', () => finalizarEdicion(true));
    });


    cantidadInput.addEventListener("input", () => {
      const cantidadActual = parseFloat(cantidadInput.value);
      const maxStock = parseFloat(cantidadInput.getAttribute("data-stock"));
      if (cantidadActual > maxStock) {
        Swal.fire("Stock Insuficiente", `Solo hay ${maxStock} unidades.`, "warning");
        cantidadInput.value = maxStock;
      }
      actualizarTotales();
    });
    fila.querySelector(".eliminar-producto").addEventListener("click", () => {
      fila.remove();
      actualizarTotales();
    });
    actualizarTotales();
  }

  function seleccionarProducto(producto) {
    agregarProductoATabla(producto);
    inputBusqueda.value = "";
    listaSugerencias.innerHTML = "";
    listaSugerencias.style.display = "none";
    inputBusqueda.focus();
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
      item.textContent = `${producto.codigo} - ${producto.nombre} (Stock: ${producto.stock})`;
      
      if (producto.stock <= 0) {
        item.classList.add("disabled-suggestion");
        item.title = "Sin existencia en inventario";
      } else {
        item.addEventListener("mousedown", () => seleccionarProducto(producto));
      }
      listaSugerencias.appendChild(item);
    });
    listaSugerencias.style.display = "block";
  }

  // --- ASIGNACIÓN DE EVENTOS ---
  if (btnBuscarCliente) btnBuscarCliente.addEventListener("click", buscarCliente);
  if (clienteRifCedulaInput) {
    clienteRifCedulaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        buscarCliente();
      }
    });
  }
  if (btnGuardarCliente) btnGuardarCliente.addEventListener("click", registrarCliente);
  if (btnLimpiarCliente) btnLimpiarCliente.addEventListener("click", limpiarCamposCliente);
  if (procesarVentaBtn) procesarVentaBtn.addEventListener("click", procesarVenta);

  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", async (e) => {
      const texto = e.target.value;
      if (texto.length < 2) {
        if (listaSugerencias) listaSugerencias.style.display = "none";
        return;
      }
      try {
        const resp = await fetch(`${API_PRODUCTOS_URL}/buscar?termino=${texto}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`
          },
        });
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
  if (cobrarIvaSwitch) cobrarIvaSwitch.addEventListener("change", actualizarTotales);

  // --- Nuevos listeners para Flete y Referencia ---
  if (fleteInput) fleteInput.addEventListener('input', actualizarTotales);
  if (metodoPagoSelect) metodoPagoSelect.addEventListener('change', gestionarVisibilidadReferencia);


  // --- Ejecuciones Iniciales ---
  actualizarTotales();
  gestionarVisibilidadReferencia(); // Para establecer el estado inicial correcto

  console.log("✅ Conexión exitosa: Listeners de Ventas activos");
});
