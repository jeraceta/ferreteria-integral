document.addEventListener("DOMContentLoaded", () => {
  console.log("Sistema de Presupuestos Iniciado");

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
  const procesarPresupuestoBtn = document.getElementById("procesarPresupuestoBtn");
  const tasaCambioInput = document.getElementById("tasaCambioInput");
  const cobrarIvaSwitch = document.getElementById('cobrarIvaSwitch');
  const ivaRow = document.getElementById("ivaRow");
  const inputBusqueda = document.getElementById("buscarProductoInput");
  const listaSugerencias = document.getElementById("listaSugerenciasProductos");
  const fleteInput = document.getElementById("fleteInput");

  // --- VARIABLES DE ESTADO ---
  let clienteActual = null;
  let productosEnPresupuesto = []; // Array para almacenar los objetos completos de los productos
  const API_CLIENTES_URL = "http://localhost:3000/api/clientes";
  const API_PRESUPUESTOS_URL = "http://localhost:3000/api/presupuestos";
  const API_PRODUCTOS_URL = "http://localhost:3000/api/productos";

  // --- DEFINICIÓN DE FUNCIONES ---

  function actualizarTotales() {
    const IVA_RATE = 0.16;
    let subtotalUSD = 0;
    const filasProductos = document.querySelectorAll("#productosVentaBody tr");
    const cobrarIva = cobrarIvaSwitch.checked;
    const fleteUSD = parseFloat(fleteInput.value) || 0;

    ivaRow.style.display = cobrarIva ? "" : "none";

    filasProductos.forEach((fila) => {
      const cantidadInput = fila.querySelector(".cantidad-producto");
      const precio = parseFloat(cantidadInput.dataset.precio) || 0;
      const cantidad = parseFloat(cantidadInput.value) || 0;
      const subtotalFila = precio * cantidad;
      fila.querySelector(".subtotal-producto").textContent = subtotalFila.toFixed(2);
      subtotalUSD += subtotalFila;
    });

    const baseImponibleUSD = subtotalUSD + fleteUSD;
    const ivaUSD = cobrarIva ? baseImponibleUSD * IVA_RATE : 0;
    const totalUSD = baseImponibleUSD + ivaUSD;

    document.getElementById("subtotalVenta").textContent = subtotalUSD.toFixed(2);
    document.getElementById("ivaVenta").textContent = ivaUSD.toFixed(2);
    document.getElementById("fleteVenta").textContent = fleteUSD.toFixed(2);
    document.getElementById("totalVenta").textContent = totalUSD.toFixed(2);
  }

  async function procesarPresupuesto() {
    if (!clienteActual || !clienteActual.id) {
      Swal.fire("Cliente no definido", "Por favor, busca o registra un cliente.", "warning");
      return;
    }

    const detalles = [];
    const filasProductos = document.querySelectorAll("#productosVentaBody tr");

    if (filasProductos.length === 0) {
      Swal.fire("No hay productos", "Por favor, añade productos al presupuesto.", "warning");
      return;
    }

    for (const fila of filasProductos) {
      const id_producto = fila.getAttribute("data-producto-id");
      const cantidadInput = fila.querySelector(".cantidad-producto");
      const cantidad = parseFloat(cantidadInput.value) || 0;
      const precio_unitario = parseFloat(cantidadInput.getAttribute("data-precio")) || 0;

      if (cantidad > 0) {
        detalles.push({ id_producto, cantidad, precio_unitario });
      }
    }

    if (detalles.length === 0) {
      Swal.fire("Presupuesto vacío", "No hay productos con cantidad válida.", "warning");
      return;
    }

    const payload = {
      id_cliente: clienteActual.id,
      tasa_bcv: parseFloat(tasaCambioInput.value) || 1,
      subtotal: parseFloat(document.getElementById("subtotalVenta").textContent) || 0,
      impuesto: parseFloat(document.getElementById("ivaVenta").textContent) || 0, // 'impuesto' en lugar de 'iva'
      total: parseFloat(document.getElementById("totalVenta").textContent) || 0,
      monto_flete: parseFloat(fleteInput.value) || 0,
      detalles: detalles,
    };

    try {
      Swal.fire({
        title: "Generando Presupuesto...",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch(`${API_PRESUPUESTOS_URL}/crear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Error al crear el presupuesto.");
      
      Swal.close();
      
      await Swal.fire({
        title: "¡Presupuesto Creado!",
        text: `El presupuesto N° ${result.id_presupuesto} ha sido generado.`,
        icon: "success",
        showCancelButton: true,
        confirmButtonText: "Ver PDF",
        cancelButtonText: 'Cerrar'
      }).then(async (action) => {
        if (action.isConfirmed) {
          try {
            // Fase 3: Abrir la ventana emergente ANTES del fetch para evitar el bloqueo del navegador
            const pdfWindow = window.open("", "_blank");
            if (!pdfWindow) {
              Swal.fire("Atención", "El navegador bloqueó la ventana emergente. Por favor, permita ventanas emergentes para este sitio.", "warning");
            } else {
              pdfWindow.document.write("<h3>Generando PDF del Presupuesto...</h3>");
              
              const pdfResponse = await fetch(
                `${API_PRESUPUESTOS_URL}/reporte/${result.id_presupuesto}`,
                { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
              );
              if (!pdfResponse.ok) throw new Error(`Error ${pdfResponse.status} al generar PDF`);
              
              const blob = await pdfResponse.blob();
              const pdfUrl = URL.createObjectURL(blob);
              pdfWindow.location.href = pdfUrl;
              setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
            }
          } catch (pdfError) {
            console.error("Error al abrir PDF del presupuesto:", pdfError);
            Swal.fire("Error PDF", pdfError.message, "error");
          }
        }
      });
      
      limpiarFormulario();

    } catch (error) {
      console.error("Error al procesar presupuesto:", error);
      Swal.fire("Error", `No se pudo crear el presupuesto. Detalle: ${error.message}`, "error");
    }
  }

  function limpiarFormulario() {
    limpiarCamposCliente();
    document.getElementById("productosVentaBody").innerHTML = "";
    productosEnPresupuesto = []; // Limpiar el array de productos en memoria
    fleteInput.value = "0";
    actualizarTotales();
  }

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
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
      });
      btnBuscarCliente.disabled = false;
      
      if (response.status === 404) {
        const result = await Swal.fire({
          title: "Cliente no encontrado",
          text: "¿Deseas habilitar el formulario para registrar a este cliente ahora?",
          icon: "info",
          showCancelButton: true,
          confirmButtonText: "Sí, habilitar registro",
          cancelButtonText: "No, corregir número",
        });
        if (result.isConfirmed) {
          clienteActual = null;
          toggleClientFieldsReadOnly(false); // Habilita todos los campos para edición
          clienteRifCedulaInput.readOnly = false; // Asegura que se pueda editar
          tipoDocumentoCliente.disabled = false;
          clienteRazonSocialInput.focus(); // Pone el foco en el nombre
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
      toggleClientFieldsReadOnly(true); // Bloquea los campos después de cargar
      Swal.fire({
        icon: "success",
        title: "Cliente Cargado",
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
    // Evita registrar si ya hay un cliente cargado.
    if (clienteActual && clienteActual.id) {
      Swal.fire("Información", "Este cliente ya está registrado y cargado.", "info");
      return;
    }
    
    // 1. Recolectamos los datos del formulario.
    const nuevoClienteData = {
      tipo_documento: tipoDocumentoCliente.value,
      rif_cedula: clienteRifCedulaInput.value.trim(),
      razon_social: clienteRazonSocialInput.value.trim(),
      direccion_fiscal: clienteDireccionInput.value.trim(),
      telefono: clienteTelefonoInput.value.trim(),
      email: clienteEmailInput.value.trim(),
      tipo_contribuyente: tipoContribuyenteSelect.value,
    };
    
    // Validación básica.
    if (!nuevoClienteData.rif_cedula || !nuevoClienteData.razon_social) {
      Swal.fire("Datos incompletos", "Cédula/RIF y Razón Social son obligatorios.", "warning");
      return;
    }

    try {
      // 2. Enviamos los datos al backend.
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
        throw new Error(errorData?.error || `Error ${response.status}: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      
      // 3. Extraemos el ID de la respuesta del servidor (buscando 'id' o 'insertId').
      const newClientId = responseData.id || responseData.insertId;

      if (newClientId) {
        // 4. PUNTO CRÍTICO: Actualizamos la variable de estado `clienteActual`.
        // Usamos los datos del formulario y le añadimos el ID que nos dio el servidor.
        clienteActual = {
          ...nuevoClienteData,
          id: newClientId
        };
        
        // 5. Bloqueamos los campos y notificamos al usuario.
        toggleClientFieldsReadOnly(true);
        Swal.fire("¡Éxito!", "Cliente registrado y cargado en el presupuesto.", "success");
      } else {
        throw new Error("La respuesta del servidor no incluyó un ID de cliente válido.");
      }
    } catch (error) {
      Swal.fire("Error al registrar", `No se pudo guardar el cliente. Detalle: ${error.message}`, "error");
    }
  }

  /**
   * @description Muestra los detalles completos de un producto en un modal (versión para presupuestos).
   * @param {number} index El índice del producto en el array `productosEnPresupuesto`.
   */
  window.verDetalleProductoPresupuesto = function(index) {
    const producto = productosEnPresupuesto[index];
    if (!producto) {
        console.error("No se encontró el producto en el índice:", index);
        Swal.fire("Error", "No se pudo encontrar la información del producto.", "error");
        return;
    }

    const htmlContent = `
        <div style="text-align: left; padding: 1rem;">
            <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">
                <strong >Producto:</strong> ${producto.nombre} 
                <span class="badge bg-secondary" style="font-size: 0.9rem; vertical-align: middle;">${producto.marca || 'Genérico'}</span>
            </p>
            <p style="font-size: 1rem; color: #555;"><strong>Código:</strong> ${producto.codigo}</p>
            <hr>
            <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; font-size: 1.1rem;">
                <p><strong>💰 Precio Presupuestado:</strong> <span style="color: #28a745;">$${parseFloat(producto.precio_venta).toFixed(2)}</span></p>
                <p style="color: #d63384;"><strong>🔐 Costo Interno:</strong> $${parseFloat(producto.precio_costo).toFixed(2)}</p>
            </div>
            <p style="font-size: 1rem;"><strong>📦 Stock Disponible:</strong> ${producto.stock} unidades</p>
            <hr>
            <p style="font-size: 1rem;"><strong>📝 Descripción:</strong></p>
            <p style="font-style: italic; color: #6c757d; background-color: #f8f9fa; padding: 0.5rem; border-radius: 5px;">
                ${producto.descripcion || 'Sin descripción detallada.'}
            </p>
        </div>
    `;

    Swal.fire({
        title: 'Ficha Técnica del Producto',
        html: htmlContent,
        confirmButtonText: 'Cerrar',
        width: '50%',
        customClass: {
            title: 'swal2-title-custom',
            htmlContainer: 'swal2-html-container-custom'
        }
    });
  }

  function agregarProductoATabla(producto) {
    const tablaBody = document.getElementById("productosVentaBody");
    const filaExistente = tablaBody.querySelector(`tr[data-producto-id="${producto.id}"]`);
    if (filaExistente) {
      const cantidadInput = filaExistente.querySelector(".cantidad-producto");
      cantidadInput.value = (parseFloat(cantidadInput.value) || 0) + 1;
      actualizarTotales();
      return;
    }

    // 1. Guardar el objeto completo en el array.
    productosEnPresupuesto.push(producto);
    const index = productosEnPresupuesto.length - 1;

    const fila = document.createElement("tr");
    fila.setAttribute("data-producto-id", producto.id);
    const stockBadge = producto.stock <= 0 ? ' <span class="badge bg-warning text-dark ms-1">Sin Stock</span>' : '';
    // Estilos de alineación vertical para todas las celdas
    const verticalAlign = "vertical-align: middle;";

    fila.innerHTML = `
        <td style="text-align: center; ${verticalAlign}">${producto.codigo}</td>
        <td style="${verticalAlign}"><strong>${producto.nombre}</strong>${stockBadge}</td>
        <td style="text-align: center; font-style: italic; color: #6c757d; ${verticalAlign}">${producto.marca || ''}</td>
        <td class="precio-producto-celda" style="text-align: right; cursor: pointer; ${verticalAlign}" title="Doble clic para editar">
            <span>${parseFloat(producto.precio_venta).toFixed(2)}</span>
        </td>
        <td style="text-align: center; ${verticalAlign}">
            <input type="number" class="form-control form-control-sm cantidad-producto" value="1" min="1" data-precio="${producto.precio_venta}" style="width: 75px; display: inline-block;">
        </td>
        <td class="subtotal-producto" style="text-align: right; ${verticalAlign}">${parseFloat(producto.precio_venta).toFixed(2)}</td>
        <td style="text-align: center; ${verticalAlign}">
            <button class="btn btn-info btn-sm" onclick="verDetalleProductoPresupuesto(${index})" title="Ver detalles">
                <i class="fas fa-info-circle"></i>
            </button>
            <button class="btn btn-danger btn-sm eliminar-producto" data-id="${producto.id}" title="Eliminar">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    tablaBody.appendChild(fila);

    fila.querySelector(".cantidad-producto").addEventListener("input", actualizarTotales);
    
    fila.querySelector(".eliminar-producto").addEventListener("click", (e) => {
        const idParaEliminar = e.currentTarget.getAttribute('data-id');
        const indiceParaEliminar = productosEnPresupuesto.findIndex(p => p.id == idParaEliminar);

        if (indiceParaEliminar > -1) {
            productosEnPresupuesto.splice(indiceParaEliminar, 1);
            renderizarTablaPresupuesto(); 
        } else {
            e.currentTarget.closest('tr').remove();
        }
        actualizarTotales();
    });
    
    // Lógica para editar precio con doble clic
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
            if (guardar && !isNaN(nuevoPrecio) && nuevoPrecio > 0 && nuevoPrecio !== originalPrice) {
                 const confirmacion = await Swal.fire({
                    title: '¿Cambiar el precio?',
                    text: `El precio de "${producto.nombre}" cambiará de ${originalPrice.toFixed(2)} a ${nuevoPrecio.toFixed(2)} solo para este presupuesto. ¿Confirmas?`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Sí, cambiar',
                    cancelButtonText: 'No, cancelar'
                });
                if (confirmacion.isConfirmed) {
                    span.textContent = nuevoPrecio.toFixed(2);
                    fila.querySelector('.cantidad-producto').dataset.precio = nuevoPrecio.toFixed(2);
                    // Actualizar el precio en el array en memoria
                    productosEnPresupuesto[index].precio_venta = nuevoPrecio.toFixed(2);
                    actualizarTotales();
                }
            }
            input.remove();
            span.style.display = 'inline';
        };

        input.addEventListener('blur', () => finalizarEdicion(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = originalPrice; input.blur(); }
        });
    });

    actualizarTotales();
  }

  /**
   * @description Renderiza de nuevo toda la tabla de productos en el presupuesto.
   */
  function renderizarTablaPresupuesto() {
    const tablaBody = document.getElementById("productosVentaBody");
    tablaBody.innerHTML = ''; // Limpiar la tabla
    const productosCopia = [...productosEnPresupuesto];
    productosEnPresupuesto = []; 
    productosCopia.forEach(p => agregarProductoATabla(p));
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
      const precioFormateado = new Intl.NumberFormat('es-VE', {
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      }).format(producto.precio_venta);

      // Maquetación similar a ventas.js para consistencia
      item.innerHTML = `
        <div class="sugerencia-bloque-izquierdo">
            <span class="sugerencia-codigo">${producto.codigo}</span>
            <span class="sugerencia-nombre">${producto.nombre}</span>
            ${producto.marca ? '<span class="sugerencia-separador">•</span>' : ''}
            <span class="sugerencia-marca">${producto.marca || ''}</span>
        </div>
        <div class="sugerencia-bloque-derecho">
            <span class="sugerencia-precio">$ ${precioFormateado}</span>
            <span class="sugerencia-stock">Stock: ${producto.stock}</span>
        </div>
      `;
      
      // La lógica de deshabilitar la selección si no hay stock es opcional en presupuestos,
      // pero la mantenemos por consistencia y para informar al vendedor.
      if (producto.stock <= 0) {
        item.classList.add("disabled-suggestion");
        item.title = "Sin existencia en inventario (se puede presupuestar, pero no vender).";
      }
      
      // Permitimos seleccionar incluso sin stock, ya que es un presupuesto
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Mantiene el foco en el input
        seleccionarProducto(producto);
      });
      
      listaSugerencias.appendChild(item);
    });
    listaSugerencias.style.display = "block";
  }

  // --- ASIGNACIÓN DE EVENTOS ---
  if (btnBuscarCliente) btnBuscarCliente.addEventListener("click", buscarCliente);
  if (clienteRifCedulaInput) {
    clienteRifCedulaInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); buscarCliente(); }
    });
  }
  if (btnGuardarCliente) btnGuardarCliente.addEventListener("click", registrarCliente);
  if (btnLimpiarCliente) btnLimpiarCliente.addEventListener("click", limpiarCamposCliente);
  if (procesarPresupuestoBtn) procesarPresupuestoBtn.addEventListener("click", procesarPresupuesto);

  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", async (e) => {
      const texto = e.target.value;
      if (texto.length < 2) {
        if (listaSugerencias) listaSugerencias.style.display = "none";
        return;
      }
      try {
        const resp = await fetch(`${API_PRODUCTOS_URL}/buscar?termino=${texto}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        });
        if (!resp.ok) throw new Error("Error en la respuesta del servidor");
        const productos = await resp.json();
        mostrarSugerencias(productos);
      } catch (err) {
        console.error("Error buscando productos:", err);
      }
    });
    inputBusqueda.addEventListener("blur", () => {
      setTimeout(() => { if (listaSugerencias) listaSugerencias.style.display = "none"; }, 150);
    });
  }

  if (tasaCambioInput) {
    tasaCambioInput.value = localStorage.getItem("ultimaTasaCambio") || "1.00";
    tasaCambioInput.addEventListener("input", (e) => {
      localStorage.setItem("ultimaTasaCambio", e.target.value);
      actualizarTotales();
    });
  }
  if (cobrarIvaSwitch) cobrarIvaSwitch.addEventListener("change", actualizarTotales);
  if (fleteInput) fleteInput.addEventListener('input', actualizarTotales);

  // --- Ejecuciones Iniciales ---
  actualizarTotales();
  limpiarCamposCliente();
  console.log("✅ Conexión exitosa: Listeners de Presupuestos activos y mejorados.");
});