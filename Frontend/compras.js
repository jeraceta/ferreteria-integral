document.addEventListener("DOMContentLoaded", () => {
  console.log("Sistema de Compras Iniciado - Operando en Divisas");

  // --- ELEMENTOS DEL DOM ---
  const btnBuscarProveedor = document.getElementById("btnBuscarProveedor");
  const btnLimpiarProveedor = document.getElementById("btnLimpiarProveedor");
  const tipoDocProveedor = document.getElementById("tipoDocProveedor");
  const numDocProveedor = document.getElementById("numDocProveedor");

  const proveedorRazonSocialInput = document.getElementById(
    "proveedorRazonSocial",
  );
  const proveedorDireccionInput = document.getElementById("proveedorDireccion");
  const proveedorContactoInput = document.getElementById("proveedorContacto");
  const proveedorEmailInput = document.getElementById("proveedorEmail");
  const btnNuevoProveedor = document.getElementById("btnNuevoProveedor");

  const aplicarIvaSwitch = document.getElementById("aplicarIvaSwitch");
  const ivaRow = document.getElementById("ivaRow");
  const inputBusqueda = document.getElementById("buscarProductoInput");
  const listaSugerencias = document.getElementById("listaSugerenciasProductos");
  const nroFacturaInput = document.getElementById("nroFacturaProveedor");

  // --- VARIABLES DE ESTADO ---
  let proveedorActual = null;
  let productosEnCompra = [];
  let totalCompra = 0;
  let modalQuickCreate;
  let modalNuevoProveedor;
  let tasaActual = 1; // Strict USD mode

  const API_PROVEEDORES_URL = "http://localhost:3000/api/proveedores";
  const API_COMPRAS_URL = "http://localhost:3000/api/compras";
  const API_PRODUCTOS_URL = "http://localhost:3000/api/productos";
  const API_CATEGORIAS_URL = "http://localhost:3000/api/categorias";

  // --- INICIALIZACIÓN ---

  if (document.getElementById("modalQuickCreate")) {
    modalQuickCreate = new bootstrap.Modal(
      document.getElementById("modalQuickCreate"),
    );
  }
  if (document.getElementById("modalNuevoProveedor")) {
    modalNuevoProveedor = new bootstrap.Modal(
      document.getElementById("modalNuevoProveedor"),
    );
  }

  // Removed cargarTasa() as we operate in USD strict

  // --- FUNCIONES DE PROVEEDOR ---
  const buscarProveedor = async () => {
    const tipo = tipoDocProveedor.value;
    const num = numDocProveedor.value.trim();

    if (!num) {
      Swal.fire(
        "Atención",
        "Ingrese el número de documento del proveedor.",
        "warning",
      );
      return;
    }

    try {
      const response = await fetch(
        `${API_PROVEEDORES_URL}/buscar?tipo_documento=${tipo}&numero_documento=${num}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );

      if (response.status === 401) {
        Swal.fire({
          icon: "warning",
          title: "Sesión Expirada",
          text: "Su sesión ha expirado. Por favor, inicie sesión nuevamente.",
        }).then(() => {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          window.location.href = "login.html";
        });
        return;
      }

      if (response.status === 404) {
        Swal.fire("No encontrado", "Proveedor no registrado.", "info");
        return;
      }

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Error al buscar");

      seleccionarProveedor(result);

      Swal.fire({
        icon: "success",
        title: "Proveedor Encontrado",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 1500,
      });
    } catch (error) {
      console.error(error);
      Swal.fire("Error", "Error de conexión al buscar proveedor.", "error");
    }
  };

  const seleccionarProveedor = (proveedor) => {
    proveedorActual = proveedor;
    // Backend devuelve mapeado: razon_social, persona_contacto, direccion
    proveedorRazonSocialInput.value = proveedor.razon_social;
    proveedorDireccionInput.value = proveedor.direccion || "";
    proveedorContactoInput.value = proveedor.persona_contacto || "";
    proveedorEmailInput.value = proveedor.email || "";

    // Bloquear inputs de busqueda
    tipoDocProveedor.disabled = true;
    numDocProveedor.readOnly = true;
  };

  const limpiarProveedor = () => {
    proveedorActual = null;
    tipoDocProveedor.disabled = false;
    numDocProveedor.readOnly = false;
    numDocProveedor.value = "";
    proveedorRazonSocialInput.value = "";
    proveedorDireccionInput.value = "";
    proveedorContactoInput.value = "";
    proveedorEmailInput.value = "";
    numDocProveedor.focus();
  };

  // --- NUEVO PROVEEDOR ---
  if (btnNuevoProveedor) {
    btnNuevoProveedor.addEventListener("click", () => {
      document.getElementById("formNuevoProveedor").reset();
      // Pre-fill con lo que usuario intentó buscar
      document.getElementById("np_tipo_documento").value =
        tipoDocProveedor.value;
      document.getElementById("np_numero_documento").value =
        numDocProveedor.value;
      if (modalNuevoProveedor) modalNuevoProveedor.show();
    });
  }

  const formNuevoProveedor = document.getElementById("formNuevoProveedor");
  if (formNuevoProveedor) {
    formNuevoProveedor.addEventListener("submit", async (e) => {
      e.preventDefault();

      const nuevoProv = {
        tipo_documento: document.getElementById("np_tipo_documento").value,
        numero_documento: document
          .getElementById("np_numero_documento")
          .value.trim(),
        razon_social: document.getElementById("np_razon_social").value.trim(),
        representante_ventas: document
          .getElementById("np_representante_ventas")
          .value.trim(),
        telefono: document.getElementById("np_telefono").value.trim(),
        email: document.getElementById("np_email").value.trim(),
        direccion: document.getElementById("np_direccion").value.trim(),
        persona_contacto: document
          .getElementById("np_representante_ventas")
          .value.trim(), // Fallback mapping
      };

      try {
        const response = await fetch(`${API_PROVEEDORES_URL}/registrar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify(nuevoProv),
        });

        if (response.status === 401) {
          Swal.fire({
            icon: "warning",
            title: "Sesión Expirada",
            text: "Su sesión ha expirado. Por favor, inicie sesión nuevamente.",
          }).then(() => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "login.html";
          });
          return;
        }

        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Error al crear proveedor");

        // Auto-seleccionar el creado
        seleccionarProveedor(result);
        if (modalNuevoProveedor) modalNuevoProveedor.hide();

        Swal.fire({
          icon: "success",
          title: "Proveedor Registrado",
          toast: true,
          position: "top-end",
          showConfirmButton: false,
          timer: 2000,
        });
      } catch (error) {
        Swal.fire("Error", error.message, "error");
      }
    });
  }

  // --- FUNCIONES DE PRODUCTOS ---
  const buscarProductos = async (termino) => {
    if (termino.length < 2) {
      listaSugerencias.style.display = "none";
      return;
    }
    try {
      const response = await fetch(
        `${API_PRODUCTOS_URL}/buscar?termino=${termino}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      if (response.ok) {
        const productos = await response.json();
        mostrarSugerencias(productos);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const mostrarSugerencias = (productos) => {
    listaSugerencias.innerHTML = "";
    if (productos.length === 0) {
      listaSugerencias.style.display = "none";
      return;
    }
    productos.forEach((p) => {
      const item = document.createElement("div");
      item.classList.add("sugerencia-item");
      item.innerHTML = `
        <div class="sugerencia-bloque-izquierdo">
            <span class="sugerencia-codigo">${p.codigo}</span>
            <span class="sugerencia-nombre">${p.nombre}</span>
        </div>
        <div class="sugerencia-bloque-derecho">
            <span class="sugerencia-stock">Stock: ${p.stock}</span>
        </div>
      `;
      item.addEventListener("mousedown", (e) => {
        e.preventDefault(); // Evita que el input pierda el foco
        seleccionarProducto(p);
      });
      listaSugerencias.appendChild(item);
    });
    listaSugerencias.style.display = "block";
  };

  const seleccionarProducto = (producto) => {
    agregarProductoATabla(producto);
    inputBusqueda.value = "";
    listaSugerencias.innerHTML = "";
    listaSugerencias.style.display = "none";
    setTimeout(() => {
      inputBusqueda.focus();
    }, 10);
  };

  const agregarProductoATabla = (producto) => {
    const tablaBody = document.getElementById("productosCompraBody");
    const filaExistente = tablaBody.querySelector(
      `tr[data-producto-id="${producto.id}"]`,
    );

    if (filaExistente) {
      const cantidadInput = filaExistente.querySelector(".cantidad-producto");
      cantidadInput.value = parseFloat(cantidadInput.value) + 1;
    } else {
      productosEnCompra.push(producto);
      const fila = document.createElement("tr");
      fila.setAttribute("data-producto-id", producto.id);
      fila.innerHTML = `
        <td>${producto.codigo}</td>
        <td>${producto.nombre}</td>
        <td>${producto.marca || "-"}</td>
        <td><input type="number" class="form-control form-control-sm costo-producto" value="${parseFloat(producto.precio_costo).toFixed(2)}" step="0.01" min="0"></td>
        <td><input type="number" class="form-control form-control-sm cantidad-producto" value="1" min="1"></td>
        <td class="subtotal-producto">${parseFloat(producto.precio_costo).toFixed(2)}</td>
        <td><button class="btn btn-danger btn-sm eliminar-producto"><i class="fas fa-trash"></i></button></td>
      `;

      // Eventos de la fila
      fila
        .querySelector(".cantidad-producto")
        .addEventListener("input", actualizarTotales);
      fila
        .querySelector(".costo-producto")
        .addEventListener("input", actualizarTotales);
      fila.querySelector(".eliminar-producto").addEventListener("click", () => {
        fila.remove();
        productosEnCompra = productosEnCompra.filter(
          (p) => p.id !== producto.id,
        );
        actualizarTotales();
      });

      tablaBody.appendChild(fila);
    }

    inputBusqueda.value = "";
    listaSugerencias.style.display = "none";
    actualizarTotales();
  };

  const actualizarTotales = () => {
    let subtotal = 0;
    const filas = document.querySelectorAll("#productosCompraBody tr");
    const aplicarIva = aplicarIvaSwitch.checked;

    filas.forEach((fila) => {
      const costo =
        parseFloat(fila.querySelector(".costo-producto").value) || 0;
      const cantidad =
        parseFloat(fila.querySelector(".cantidad-producto").value) || 0;
      const totalFila = costo * cantidad;
      fila.querySelector(".subtotal-producto").textContent =
        totalFila.toFixed(2);
      subtotal += totalFila;
    });

    const iva = aplicarIva ? subtotal * 0.16 : 0;
    const total = subtotal + iva;

    document.getElementById("subtotalCompra").textContent = subtotal.toFixed(2);
    document.getElementById("ivaCompra").textContent = iva.toFixed(2);
    document.getElementById("totalCompra").textContent = total.toFixed(2);

    // Eliminamos lógica de Bolívares visual.
    document.getElementById("subtotalCompraBS").textContent = "-";
    document.getElementById("ivaCompraBS").textContent = "-";
    document.getElementById("totalCompraBS").textContent = "-";

    if (ivaRow) ivaRow.style.display = aplicarIva ? "" : "none";
  };

  // --- LÓGICA DE CONFIRMACIÓN Y PROCESAMIENTO ---
  window.confirmarCompra = async () => {
    // 1. Validaciones Básicas
    const totalCompraVal =
      parseFloat(document.getElementById("totalCompra").textContent) || 0;

    if (totalCompraVal <= 0) {
      Swal.fire("Error", "No hay productos en la compra.", "warning");
      return;
    }
    if (!proveedorActual) {
      Swal.fire("Error", "Seleccione un proveedor.", "warning");
      return;
    }

    // 2. Confirmación con SweetAlert
    const result = await Swal.fire({
      title: "¿Confirmar Compra?",
      text: `Total a registrar: $${totalCompraVal.toFixed(2)}`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#28a745",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Sí, procesar",
      cancelButtonText: "Cancelar",
    });

    if (!result.isConfirmed) return;

    // 3. Preparar Payload
    const detalles = [];
    document.querySelectorAll("#productosCompraBody tr").forEach((fila) => {
      const id = fila.getAttribute("data-producto-id");
      const costo = parseFloat(fila.querySelector(".costo-producto").value);
      const cantidad = parseFloat(
        fila.querySelector(".cantidad-producto").value,
      );
      detalles.push({ id_producto: id, cantidad, costo_unitario: costo });
    });

    const payload = {
      id_proveedor: proveedorActual.id,
      tasa_bcv: tasaActual, // Default 1 (USD Only)
      nro_factura_proveedor: nroFacturaInput.value.trim(),
      subtotal: parseFloat(
        document.getElementById("subtotalCompra").textContent,
      ),
      impuesto: parseFloat(document.getElementById("ivaCompra").textContent),
      total: totalCompraVal,
      detalles: detalles,
      // No enviamos 'pagos' ya que se simplificó el proceso
    };

    // 4. Enviar al Backend
    try {
      Swal.fire({
        title: "Procesando...",
        text: "Registrando compra e inventario",
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading(),
      });

      const response = await fetch(`${API_COMPRAS_URL}/registrar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message ||
            data.mensaje ||
            "Este número de factura ya fue registrado para este proveedor.",
        );
      }

      // 5. Éxito: Abrir PDF automáticamente y limpiar
      Swal.fire({
        title: "¡Compra Registrada!",
        text: `Compra N° ${data.numero_control || data.id_compra} guardada correctamente.`,
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });

      // Abrir reporte inmediatamente
      imprimirComprobante(data.id_compra);

      // Limpiar formulario (sin recargar para evitar perdida de contexto si hay otro error luego,
      // pero el usuario pidió limpiar si no hubo errores)
      setTimeout(() => {
        window.location.reload();
      }, 2500);
    } catch (error) {
      console.error(error);
      Swal.fire("Error", error.message, "error");
    }
  };

  const imprimirComprobante = async (idCompra) => {
    try {
      Swal.fire({
        title: "Generando PDF...",
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false,
      });

      const response = await fetch(`${API_COMPRAS_URL}/reporte/${idCompra}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.status === 401) {
        window.location.href = "login.html";
        return;
      }

      if (!response.ok) throw new Error("Error en el servidor");

      const blob = await response.blob();
      const file = new Blob([blob], { type: "application/pdf" });
      const fileURL = URL.createObjectURL(file);

      Swal.close();

      const win = window.open(fileURL, "_blank");
      if (win) {
        win.focus();
      } else {
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
  };

  // --- LÓGICA DE QUICK CREATE PRODUCTO ---
  const btnQuickCreate = document.getElementById("btnQuickCreateProduct");
  const formQuickCreate = document.getElementById("formQuickCreate");

  btnQuickCreate.addEventListener("click", async () => {
    // Cargar categorías
    const selectCat = document.getElementById("qc_categoria");
    selectCat.innerHTML = '<option value="">Cargando...</option>';
    try {
      const resp = await fetch(API_CATEGORIAS_URL, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const categorias = await resp.json();
      selectCat.innerHTML = '<option value="">Seleccione...</option>';
      categorias.forEach((c) => {
        selectCat.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
      });
    } catch (e) {
      console.error(e);
      selectCat.innerHTML = '<option value="">Error al cargar</option>';
    }

    // Limpiar form
    formQuickCreate.reset();
    modalQuickCreate.show();
  });

  formQuickCreate.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nuevoProducto = {
      codigo: document.getElementById("qc_codigo").value.trim(),
      nombre: document.getElementById("qc_nombre").value.trim(),
      id_categoria: document.getElementById("qc_categoria").value,
      marca: document.getElementById("qc_marca").value.trim(),
      precio_costo: parseFloat(
        document.getElementById("qc_precio_costo").value,
      ),
      precio_venta: parseFloat(
        document.getElementById("qc_precio_venta").value,
      ),
      stock: 0, // Stock inicial 0, se sumará con la compra
    };

    try {
      const response = await fetch(API_PRODUCTOS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(nuevoProducto),
      });

      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Error al crear producto");

      // Obtener el producto completo recién creado para agregarlo a la tabla
      const prodResp = await fetch(`${API_PRODUCTOS_URL}/${result.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const productoCompleto = await prodResp.json();

      // Insertar en tabla y cerrar modal
      agregarProductoATabla(productoCompleto);
      modalQuickCreate.hide();

      Swal.fire({
        icon: "success",
        title: "Producto Agregado",
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2000,
      });
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  });

  // --- EVENT LISTENERS ---
  btnBuscarProveedor.addEventListener("click", buscarProveedor);
  btnLimpiarProveedor.addEventListener("click", limpiarProveedor);
  // Buscar con enter en el input number
  numDocProveedor.addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarProveedor();
  });

  inputBusqueda.addEventListener("input", (e) =>
    buscarProductos(e.target.value),
  );
  inputBusqueda.addEventListener("blur", () =>
    setTimeout(() => (listaSugerencias.style.display = "none"), 200),
  );

  aplicarIvaSwitch.addEventListener("change", actualizarTotales);
});
