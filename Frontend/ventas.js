document.addEventListener("DOMContentLoaded", () => {
  // --- CAPTURA DE ELEMENTOS DEL DOM ---
  const btnBuscarCliente = document.getElementById("btnBuscarCliente");
  const btnGuardarCliente = document.getElementById("btnGuardarCliente");
  const btnLimpiarCliente = document.getElementById("btnLimpiarCliente");
  const tipoDocumentoClienteSelect = document.getElementById("tipoDocumentoCliente");
  const clienteRifCedulaInput = document.getElementById("clienteRifCedula");
  const clienteRazonSocialInput = document.getElementById("clienteRazonSocial");
  const clienteDireccionInput = document.getElementById("clienteDireccion");
  const clienteTelefonoInput = document.getElementById("clienteTelefono");
  const clienteEmailInput = document.getElementById("clienteEmail");
  const clienteTipoContribuyenteInput = document.getElementById("clienteTipoContribuyente");
  const procesarVentaBtn = document.getElementById("procesarVentaBtn");
  const tasaCambioInput = document.getElementById("tasaCambioInput");
  const cobrarIvaSwitch = document.getElementById('cobrarIvaSwitch');
  const ivaRow = document.getElementById("ivaRow");


  // --- VARIABLES DE ESTADO ---
  let clienteActual = null;
  const API_CLIENTES_URL = "http://localhost:3000/api/clientes";
  const API_VENTAS_URL = "http://localhost:3000/api/ventas";
  const API_PRODUCTOS_URL = "http://localhost:3000/api/productos"; // New URL for products


  // --- DEFINICIÓN DE FUNCIONES ---

  /**
   * @description Habilita o deshabilita los campos del formulario del cliente.
   * @param {boolean} isReadOnly - True para deshabilitar (solo lectura), false para habilitar.
   */
  function toggleClientFieldsReadOnly(isReadOnly) {
    clienteRazonSocialInput.readOnly = isReadOnly;
    clienteDireccionInput.readOnly = isReadOnly;
    clienteTelefonoInput.readOnly = isReadOnly;
    clienteEmailInput.readOnly = isReadOnly;
    clienteTipoContribuyenteInput.readOnly = isReadOnly;
    // La cédula y tipo de doc también se deben bloquear si se encuentra un cliente.
    clienteRifCedulaInput.readOnly = isReadOnly;
    tipoDocumentoClienteSelect.disabled = isReadOnly;
  }

  /**
   * @description Limpia todos los campos del formulario del cliente y resetea el estado.
   */
  function limpiarCamposCliente() {
    console.log("--- Limpiando campos de cliente ---");
    tipoDocumentoClienteSelect.value = "V";
    clienteRifCedulaInput.value = "";
    clienteRazonSocialInput.value = "";
    clienteDireccionInput.value = "";
    clienteTelefonoInput.value = "";
    clienteEmailInput.value = "";
    clienteTipoContribuyenteInput.value = "ORDINARIO";
    clienteActual = null;
    toggleClientFieldsReadOnly(false); // Habilita todos los campos.
    clienteRifCedulaInput.focus(); // Foco en el input principal
  }

  /**
   * @description Calcula y actualiza los totales de la venta (subtotal, IVA, total) en USD y Bs.
   */
  function actualizarTotales() {
    const IVA_RATE = 0.16; // 16% de IVA

    let subtotalUSD = 0;
    const filasProductos = document.querySelectorAll("#productosVentaBody tr");
    const tasaCambio = parseFloat(tasaCambioInput.value) || 1;
    const cobrarIva = cobrarIvaSwitch.checked;

    if (ivaRow) {
      ivaRow.style.display = cobrarIva ? '' : 'none'; 
    }

    filasProductos.forEach(fila => {
        const cantidadInput = fila.querySelector(".cantidad-producto");
        // Usar dataset es más seguro y consistente
        const precio = parseFloat(cantidadInput.dataset.precio) || 0;
        const cantidad = parseFloat(cantidadInput.value) || 0;
        const subtotalFila = precio * cantidad;
        
        // Actualizar el subtotal de la fila en el DOM
        fila.querySelector(".subtotal-producto").textContent = subtotalFila.toFixed(2);
        subtotalUSD += subtotalFila;
    });

    const ivaUSD = cobrarIva ? (subtotalUSD * IVA_RATE) : 0;
    const totalUSD = subtotalUSD + ivaUSD;
    const totalBS = totalUSD * tasaCambio; // AQUÍ SE APLICA LA TASA

    // Inyectar los resultados en el DOM (IDs nuevos)
    document.getElementById("subtotalVenta").textContent = subtotalUSD.toFixed(2);
    document.getElementById("ivaVenta").textContent = ivaUSD.toFixed(2);
    document.getElementById("totalVenta").textContent = totalUSD.toFixed(2); // Total en USD

    // Elementos para Bolívares
    document.getElementById("subtotalVentaBS").textContent = (subtotalUSD * tasaCambio).toFixed(2);
    document.getElementById("ivaVentaBS").textContent = (ivaUSD * tasaCambio).toFixed(2);
    
    const elTotalBS = document.getElementById("totalVentaBS");
    if (elTotalBS) elTotalBS.textContent = totalBS.toLocaleString('es-VE', { 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2 
    });
  }

  /**
   * @description Busca un cliente en el backend usando su tipo de documento y RIF/Cédula.
   */
  async function buscarCliente() {
    console.log("--- Iniciando búsqueda de cliente ---");
    const tipoDocumento = tipoDocumentoClienteSelect.value;
    const rifCedula = clienteRifCedulaInput.value.trim();

    if (!rifCedula) {
      Swal.fire("Faltan datos", "Por favor, ingresa el RIF o Cédula.", "warning");
      return;
    }

    try {
      const url = `${API_CLIENTES_URL}/buscar?tipo_documento=${encodeURIComponent(tipoDocumento)}&rif_cedula=${encodeURIComponent(rifCedula)}`;
      console.log("Buscando en URL:", url);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.status === 404) {
        Swal.fire(
          "Cliente no encontrado",
          "Este cliente no existe. Completa los datos y presiona 'Registrar Nuevo Cliente'.",
          "info"
        );
        clienteActual = null;
        toggleClientFieldsReadOnly(false); // Habilita campos para nuevo registro.
        clienteRifCedulaInput.readOnly = true; // Pero bloquea el RIF/Cédula que se buscó.
        tipoDocumentoClienteSelect.disabled = true;
        clienteRazonSocialInput.focus(); // Foco en el siguiente campo lógico
        return;
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "El servidor no respondió correctamente.");
      }

      const clienteEncontrado = await response.json();
      console.log("Cliente encontrado:", clienteEncontrado);

      clienteActual = clienteEncontrado;
      clienteRazonSocialInput.value = clienteEncontrado.razon_social || "";
      clienteDireccionInput.value = clienteEncontrado.direccion || "";
      clienteTelefonoInput.value = clienteEncontrado.telefono || "";
      clienteEmailInput.value = clienteEncontrado.email || "";
      clienteTipoContribuyenteInput.value = clienteEncontrado.tipo_contribuyente || "ORDINARIO";
      
      toggleClientFieldsReadOnly(true); // Bloquea todos los campos de un cliente encontrado.
    } catch (error) {
      console.error("Error al buscar cliente:", error);
      Swal.fire("Error de Conexión", `No se pudo buscar el cliente. Detalle: ${error.message}`, "error");
    }
  }

  /**
   * @description Registra un nuevo cliente en el backend.
   */
  async function guardarCliente() {
    console.log("--- Iniciando guardado de cliente ---");
    if (clienteActual && clienteActual.id) {
      Swal.fire("Información", "Este cliente ya está registrado.", "info");
      return;
    }

    const nuevoClienteData = {
      tipoDocumento: tipoDocumentoClienteSelect.value,
      rifCedula: clienteRifCedulaInput.value.trim(),
      razonSocial: clienteRazonSocialInput.value.trim(),
      direccion: clienteDireccionInput.value.trim(),
      telefono: clienteTelefonoInput.value.trim(),
      email: clienteEmailInput.value.trim(),
      tipoContribuyente: clienteTipoContribuyenteInput.value.trim() || 'ORDINARIO'
    };

    if (!nuevoClienteData.rifCedula || !nuevoClienteData.razonSocial) {
      Swal.fire("Datos incompletos", "La Cédula/RIF y la Razón Social son obligatorios.", "warning");
      return;
    }
    
    try {
      console.log("Enviando datos de nuevo cliente:", nuevoClienteData);
      const url = `${API_CLIENTES_URL}/registrar`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(nuevoClienteData),
      });

      const clienteCreado = await response.json();
      if (!response.ok) {
        // Si el error viene con un array de `errors`, lo formateamos.
        if (clienteCreado.errors) {
            const errorMessages = clienteCreado.errors.map(err => err.msg).join('\n');
            throw new Error(errorMessages);
        }
        throw new Error(clienteCreado.message || "Error desconocido al registrar.");
      }
      
      console.log("Cliente nuevo registrado con éxito:", clienteCreado);
      clienteActual = clienteCreado.cliente; // El backend devuelve un objeto { cliente: {...} }
      
      // Actualizamos los campos con los datos devueltos por el API (limpios)
      tipoDocumentoClienteSelect.value = clienteActual.tipo_documento;
      clienteRifCedulaInput.value = clienteActual.rif_cedula;
      
      toggleClientFieldsReadOnly(true); // Bloqueamos los campos tras el guardado exitoso.

      Swal.fire("¡Éxito!", "Cliente registrado correctamente.", "success");
    } catch (error) {
      console.error("Error al guardar el cliente:", error);
      Swal.fire("Error", `No se pudo guardar el cliente. Detalle: ${error.message}`, "error");
    }
  }

  /**
   * @description Procesa la venta, recolectando datos y enviándolos al backend.
   */
  async function procesarVenta() {
    if (!clienteActual || !clienteActual.id) {
      Swal.fire("Cliente no definido", "Por favor, busca o registra un cliente antes de procesar la venta.", "warning");
      return;
    }

    // Recolectar productos de la tabla para el 'detalle' del backend
    const detalleProductos = [];
    const productosVentaBody = document.getElementById('productosVentaBody');
    if (productosVentaBody) {
        const filasProductos = productosVentaBody.querySelectorAll('tr');
        if (filasProductos.length === 0) {
            Swal.fire("No hay productos", "Por favor, añade productos a la venta.", "warning");
            return;
        }
        for (const fila of filasProductos) {
            const productoId = fila.getAttribute('data-producto-id');
            const cantidadInput = fila.querySelector('.cantidad-producto');
            const cantidad = parseFloat(cantidadInput ? cantidadInput.value : 0) || 0;
            const precioUnitario = parseFloat(cantidadInput.getAttribute('data-precio')) || 0; // Precio unitario original del producto

            if (cantidad > 0) {
                detalleProductos.push({
                    productoId: productoId, // Backend espera 'productoId'
                    cantidad: cantidad,
                    precioUnitario: precioUnitario // Backend espera 'precioUnitario'
                });
            } else {
                 Swal.fire("Cantidad Inválida", "La cantidad de un producto no puede ser cero.", "warning");
                 return;
            }
        }
    }

    if (detalleProductos.length === 0) {
        Swal.fire("No hay productos", "Por favor, añade productos a la venta antes de procesar.", "warning");
        return;
    }

    // Recolectar datos de la venta para 'datosVenta' del backend
    const tasaCambio = parseFloat(tasaCambioInput.value) || 1;
    const subtotalUSD = parseFloat(document.getElementById('subtotalVenta').textContent) || 0;
    const ivaUSD = parseFloat(document.getElementById('ivaVenta').textContent) || 0;
    const totalUSD = parseFloat(document.getElementById('totalVenta').textContent) || 0;
    // totalBS se obtiene del DOM y debe ser parseado correctamente si usa toLocaleString
    const totalBS = parseFloat(document.getElementById('totalVentaBS').textContent.replace('.', '').replace(',', '.')) || 0; // Handle locale string


    const datosVenta = {
        clienteId: clienteActual.id, // Backend espera 'clienteId'
        tasaBcv: tasaCambio, // Backend espera 'tasaBcv'
        subtotal: subtotalUSD, // Backend espera subtotal en USD
        impuesto: ivaUSD, // Backend espera impuesto en USD
        total: totalUSD, // Backend espera total en USD
        // metodoPago: 'Efectivo', // Asumido, el backend usa 'metodo_pago'
        // permitirStockNegativo: false // Asumido, el backend usa 'permitirStockNegativo'
    };
    
    // Combina los datos en la estructura esperada por el backend
    const payload = {
        datosVenta: datosVenta,
        detalle: detalleProductos,
    };

    try {
        Swal.fire({
            title: 'Procesando Venta...',
            text: 'Por favor, espera.',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const response = await fetch(`${API_VENTAS_URL}/registrar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${localStorage.getItem("token")}`,
            },
            body: JSON.stringify(payload), // Send the combined payload
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Error al procesar la venta.");
        }

        Swal.fire("¡Venta Exitosa!", "La venta ha sido registrada correctamente.", "success");
        // Limpiar la interfaz después de una venta exitosa
        limpiarCamposCliente();
        const productosVentaBody = document.getElementById('productosVentaBody');
        if(productosVentaBody) productosVentaBody.innerHTML = ''; // Limpiar productos de la tabla
        actualizarTotales(); // Recalcular para que todo quede en 0
        // Podrías redirigir a una página de detalle de venta o imprimir factura
    } catch (error) {
        console.error("Error al procesar venta:", error);
        Swal.fire("Error", `No se pudo procesar la venta. Detalle: ${error.message}`, "error");
    }
  }

  /**
   * @description Añade un producto a la tabla de la venta.
   * @param {object} producto - El producto a añadir, con id, codigo, nombre, precio_venta, stock.
   */
  function agregarProductoATabla(producto) {
    const tablaBody = document.getElementById('productosVentaBody');
    if (!tablaBody) {
        console.error('El cuerpo de la tabla de productos no se encontró.');
        return;
    }

    // Verificar si el producto ya está en la tabla
    const filaExistente = tablaBody.querySelector(`tr[data-producto-id="${producto.id}"]`);
    if (filaExistente) {
        // Si existe, incrementar la cantidad
        const cantidadInput = filaExistente.querySelector('.cantidad-producto');
        const nuevaCantidad = (parseFloat(cantidadInput.value) || 0) + 1;
        if (nuevaCantidad <= producto.stock) {
            cantidadInput.value = nuevaCantidad;
            actualizarTotales(); // Actualizar totales después de cambiar la cantidad
        } else {
            Swal.fire('Stock Insuficiente', `Solo hay ${producto.stock} unidades de ${producto.nombre} disponibles.`, 'warning');
        }
        return;
    }


    // Crear la fila y las celdas
    const fila = document.createElement('tr');
    fila.setAttribute('data-producto-id', producto.id);

    // Guardar el precio de venta en un atributo de datos en el input de cantidad
    // para poder recuperarlo fácilmente en actualizarTotales
    const initialSubtotal = (1 * producto.precio_venta).toFixed(2);

    fila.innerHTML = `
        <td>${producto.codigo}</td>
        <td>${producto.nombre}</td>
        <td>${parseFloat(producto.precio_venta).toFixed(2)}</td>
        <td><input type="number" class="form-control form-control-sm cantidad-producto" value="1" min="1" max="${producto.stock}" data-precio="${producto.precio_venta}" data-stock="${producto.stock}" style="width: 70px;"></td>
        <td class="subtotal-producto">${initialSubtotal}</td>
        <td><button class="btn btn-danger btn-sm eliminar-producto"><i class="fas fa-trash"></i></button></td>
    `;

    tablaBody.appendChild(fila);

    // Añadir event listeners a los nuevos elementos de la fila
    const cantidadInput = fila.querySelector('.cantidad-producto');
    if (cantidadInput) {
        cantidadInput.addEventListener('input', () => {
            const cantidadActual = parseFloat(cantidadInput.value);
            const maxStock = parseFloat(cantidadInput.getAttribute('data-stock'));

            if (cantidadActual > maxStock) {
                Swal.fire('Stock Insuficiente', `Solo hay ${maxStock} unidades de ${producto.nombre} disponibles.`, 'warning');
                cantidadInput.value = maxStock; // Restaurar al máximo stock
            } else if (cantidadActual < 1) {
                cantidadInput.value = 1; // Mínimo 1
            }
            actualizarTotales();
        });
        cantidadInput.addEventListener('change', actualizarTotales); // Trigger on change as well
    }

    const eliminarBtn = fila.querySelector('.eliminar-producto');
    if (eliminarBtn) {
        eliminarBtn.addEventListener('click', () => {
            fila.remove();
            actualizarTotales();
        });
    }

    actualizarTotales(); // Recalcular totales después de añadir el producto
  }

  /**
   * @description Se ejecuta al hacer clic en un producto de la lista de sugerencias.
   * @param {object} producto - El objeto del producto seleccionado.
   */
  function seleccionarProducto(producto) {
      console.log("Producto seleccionado:", producto);
      agregarProductoATabla(producto);

      // Limpiamos el buscador y las sugerencias
      const inputBusqueda = document.getElementById("buscarProductoInput");
      const listaSugerencias = document.getElementById("listaSugerenciasProductos");
      inputBusqueda.value = "";
      if (listaSugerencias) {
        listaSugerencias.innerHTML = "";
        listaSugerencias.style.display = "none";
      }
      
      // Devolvemos el foco al buscador
      inputBusqueda.focus();
  }

  // --- LÓGICA DE BÚSQUEDA PREDICTIVA DE PRODUCTOS ---
  const inputBusqueda = document.getElementById("buscarProductoInput");
  const listaSugerencias = document.getElementById("listaSugerenciasProductos");

  /**
   * @description Muestra las sugerencias de productos debajo del input de búsqueda.
   * @param {Array<object>} productos - Un array de objetos de producto.
   */
  function mostrarSugerencias(productos) {
    if (!listaSugerencias) return;

    listaSugerencias.innerHTML = '';
    if (productos.length === 0) {
        listaSugerencias.style.display = 'none';
        return;
    }

    productos.forEach(producto => {
        const item = document.createElement('div');
        item.classList.add('sugerencia-item');
        item.textContent = `${producto.codigo} - ${producto.nombre} (Stock: ${producto.stock})`;
        
        // Usamos mousedown para que se dispare antes que el 'blur' del input
        item.addEventListener('mousedown', () => {
            seleccionarProducto(producto);
        });

        listaSugerencias.appendChild(item);
    });

    listaSugerencias.style.display = 'block';
  }

  // --- ASIGNACIÓN DE EVENTOS ---
  if (btnBuscarCliente) {
    btnBuscarCliente.addEventListener("click", buscarCliente);
  }
  
  // Nueva funcionalidad: Buscar con la tecla 'Enter'
  if (clienteRifCedulaInput) {
    clienteRifCedulaInput.addEventListener("keydown", (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Evita que el form se envíe si lo hubiera
            buscarCliente();
        }
    });
  }

  // Event Listener para el botón de guardar cliente.
  if (btnGuardarCliente) {
    btnGuardarCliente.addEventListener("click", guardarCliente);
  }

  if (btnLimpiarCliente) {
    btnLimpiarCliente.addEventListener("click", limpiarCamposCliente);
  }
  
  if (procesarVentaBtn) {
    procesarVentaBtn.addEventListener('click', procesarVenta);
  }

  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", async (e) => {
        const texto = e.target.value;

        if (texto.length < 2) {
            if (listaSugerencias) {
              listaSugerencias.innerHTML = '';
              listaSugerencias.style.display = 'none';
            }
            return;
        }

        try {
            const resp = await fetch(`${API_PRODUCTOS_URL}/buscar?termino=${texto}`, { // Corrected URL for products
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });

            if (!resp.ok) throw new Error('Error en la respuesta del servidor');

            const productos = await resp.json();
            mostrarSugerencias(productos);
        } catch (err) {
            console.error("Error buscando productos:", err);
            if(listaSugerencias) {
              listaSugerencias.innerHTML = '<div class="sugerencia-item no-results">Error al buscar...</div>';
              listaSugerencias.style.display = 'block';
            }
        }
    });

    // Ocultar la lista si el input pierde el foco
    inputBusqueda.addEventListener('blur', () => {
        // Damos un pequeño delay para permitir que el evento 'mousedown' se registre
        setTimeout(() => {
            if (listaSugerencias) {
                listaSugerencias.style.display = 'none';
            }
        }, 150);
    });
  }

  // --- Inicialización y Eventos Adicionales ---
  // Persistencia de la Tasa de Cambio
  if (tasaCambioInput) {
    const tasaGuardada = localStorage.getItem("ultimaTasaCambio");
    tasaCambioInput.value = tasaGuardada ? tasaGuardada : "1.00";

    tasaCambioInput.addEventListener("input", (e) => {
      localStorage.setItem("ultimaTasaCambio", e.target.value);
      actualizarTotales();
    });
    // También recalculamos si el switch de IVA cambia
    cobrarIvaSwitch.addEventListener('change', actualizarTotales);
  }

  // Realizar un cálculo inicial de totales al cargar la página
  actualizarTotales();

});