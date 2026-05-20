/**
 * productos.js
 * ============
 * Módulo completo de Gestión de Productos.
 * ¡Aquí manejamos el CRUD de productos y la importación masiva desde Excel!
 *
 * ¿Qué hace este archivo?
 *  1. Carga y muestra todos los productos en una tabla
 *  2. Permite crear y editar productos (con el campo ubicación ¡nuevo!)
 *  3. Permite eliminar productos (con confirmación)
 *  4. Filtra productos en tiempo real mientras escribes
 *  5. Importa productos masivamente desde un archivo Excel o CSV
 */

document.addEventListener("DOMContentLoaded", () => {
  // ── URLs base de la API ──
  // Estas son las "puertas" a nuestro servidor backend
  const API_BASE_URL = "http://localhost:3000/api/productos";
  const API_CATEGORIAS_URL = "http://localhost:3000/api/categorias";
  const API_IMPORTAR_URL = "http://localhost:3000/api/importar/productos";

  // ── Referencias a elementos del DOM ──
  // Es más eficiente guardarlos en variables que buscarlos cada vez
  const tablaProductos = document.getElementById("tablaProductos");
  const inputBuscarProducto = document.getElementById("inputBuscarProducto");
  const btnNuevoProducto = document.getElementById("btnNuevoProducto");
  const btnImportarExcel = document.getElementById("btnImportarExcel");
  const modalProducto = new bootstrap.Modal(
    document.getElementById("modalProducto"),
  );
  const modalImportarExcel = new bootstrap.Modal(
    document.getElementById("modalImportarExcel"),
  );
  const formProducto = document.getElementById("formProducto");
  const modalProductoLabel = document.getElementById("modalProductoLabel");
  const btnAnadirCategoria = document.getElementById("btnAnadirCategoria");
  const btnConfirmarImportar = document.getElementById("btnConfirmarImportar");
  const inputArchivoExcel = document.getElementById("inputArchivoExcel");
  const previewArchivo = document.getElementById("previewArchivo");
  const nombreArchivoSeleccionado = document.getElementById(
    "nombreArchivoSeleccionado",
  );

  // ── Campos del formulario de producto ──
  const productoId = document.getElementById("productoId");
  const codigo = document.getElementById("codigo");
  const nombre = document.getElementById("nombre");
  const marca = document.getElementById("marca");
  const descripcion = document.getElementById("descripcion");
  const selectCategoria = document.getElementById("selectCategoria");
  const precioCosto = document.getElementById("precioCosto");
  const precioVenta = document.getElementById("precioVenta");
  const stockActual = document.getElementById("stockActual");
  const stockMinimo = document.getElementById("stockMinimo");
  const ubicacion = document.getElementById("ubicacion"); // ← ¡NUEVO CAMPO!

  // ── Estado de la aplicación ──
  let productos = []; // Lista completa de productos cargados del backend
  let categorias = []; // Lista de categorías disponibles

  // ============================================================
  // 🔑 FUNCIÓN AUXILIAR: getToken
  // Obtiene el token JWT guardado en el localStorage del navegador.
  // Sin este token, el servidor rechaza nuestras peticiones.
  // ============================================================
  const getToken = () => localStorage.getItem("token");

  // ============================================================
  // 🔔 FUNCIÓN AUXILIAR: showAlert
  // Muestra notificaciones bonitas con SweetAlert2.
  // ============================================================
  const showAlert = (title, message, icon) => {
    Swal.fire({
      title,
      text: message,
      icon,
      timer: icon === "success" ? 2000 : 4000,
      timerProgressBar: true,
      confirmButtonColor: "#0d6efd",
    });
  };

  // ============================================================
  // 🧮 LÓGICA DE CÁLCULO DE PRECIOS
  // Cuando el usuario escribe el costo y el margen, calculamos
  // automáticamente el precio de venta. ¡Y viceversa!
  // ============================================================
  const calcularVenta = () => {
    const costo = parseFloat(precioCosto.value);
    const margen = parseFloat(
      document.getElementById("margenPorcentaje").value,
    );
    if (!isNaN(costo) && !isNaN(margen)) {
      precioVenta.value = (costo * (1 + margen / 100)).toFixed(2);
    }
  };

  const calcularMargen = () => {
    const costo = parseFloat(precioCosto.value);
    const venta = parseFloat(precioVenta.value);
    if (!isNaN(costo) && !isNaN(venta) && costo > 0) {
      document.getElementById("margenPorcentaje").value = (
        (venta / costo - 1) *
        100
      ).toFixed(2);
    }
  };

  precioCosto.addEventListener("input", calcularVenta);
  document
    .getElementById("margenPorcentaje")
    .addEventListener("input", calcularVenta);
  precioVenta.addEventListener("input", calcularMargen);

  // ============================================================
  // 📦 FUNCIÓN 1: cargarProductos
  // Llama al backend y trae todos los productos para mostrarlos.
  // ============================================================
  const cargarProductos = async () => {
    tablaProductos.innerHTML =
      '<tr><td colspan="8" class="text-center"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Cargando productos...</td></tr>';
    try {
      const token = getToken();
      if (!token) {
        showAlert("Error", "No hay sesión activa.", "error");
        return;
      }

      const modoCliente = document.getElementById("modoClienteSwitch").checked;
      const response = await fetch(`${API_BASE_URL}?modoCliente=${modoCliente}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        showAlert(
          "Sesión Expirada",
          "Por favor inicie sesión de nuevo.",
          "warning",
        );
        return;
      }
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);

      productos = await response.json();
      mostrarProductos(productos);
    } catch (error) {
      console.error("Error al cargar productos:", error);
      tablaProductos.innerHTML =
        '<tr><td colspan="8" class="text-center text-danger">Error al cargar productos.</td></tr>';
    }
  };

  // ============================================================
  const mostrarProductos = (productosAMostrar) => {
    tablaProductos.innerHTML = "";

    if (productosAMostrar.length === 0) {
      tablaProductos.innerHTML =
        '<tr><td colspan="8" class="text-center text-muted py-3"><i class="fas fa-box-open me-2"></i>No hay productos para mostrar.</td></tr>';
      return;
    }

    const modoCliente = document.getElementById("modoClienteSwitch").checked;

    productosAMostrar.forEach((prod) => {
      // Parsear stock para validaciones seguras (Fix Falso Agotado)
      const stock = parseInt(prod.stock_actual || 0, 10);
      let badgeClass = "";
      let disponibilidadHtml = "";

      if (modoCliente) {
        // Lógica de puntos (Dots) para modo cliente
        const disp = prod.disponibilidad || "agotado";
        const dotColor = disp === "disponible" ? "#28a745" : disp === "pocas" ? "#ffc107" : "#dc3545";
        const dotText = disp === "disponible" ? "Disponible" : disp === "pocas" ? "Pocas unidades" : "Agotado";
        
        disponibilidadHtml = `
          <div class="d-flex align-items-center justify-content-center">
            <span style="height: 10px; width: 10px; background-color: ${dotColor}; border-radius: 50%; display: inline-block; margin-right: 5px;"></span>
            <span class="small fw-bold" style="color: ${dotColor}">${dotText}</span>
          </div>
        `;
      } else {
        // Lógica original de badges para modo gestión
        badgeClass =
          stock <= 0
            ? "bg-danger"
            : stock <= (prod.stock_minimo || 5)
              ? "bg-warning text-dark"
              : "bg-success";
        disponibilidadHtml = `<span class="badge ${badgeClass}">${stock}</span>`;
      }

      const row = tablaProductos.insertRow();
      
      // Construimos el HTML de la fila de forma dinámica para evitar desplazamientos de columnas
      let rowHtml = `
        <td><code>${prod.codigo || ""}</code></td>
        <td class="fw-semibold">${prod.nombre || ""}</td>
        <td>${prod.marca || '<span class="text-muted">—</span>'}</td>
        <td>${prod.nombre_categoria || '<span class="text-muted">Sin cat.</span>'}</td>
      `;

      // Columna UBICACIÓN: Solo se renderiza si NO estamos en modo cliente
      if (!modoCliente) {
        rowHtml += `
          <td>
            ${
              prod.ubicacion && prod.ubicacion !== "Sin ubicación"
                ? `<span class="badge-ubicacion"><i class="fas fa-map-marker-alt me-1"></i>${prod.ubicacion}</span>`
                : '<span class="text-muted small">—</span>'
            }
          </td>
        `;
      }

      rowHtml += `
        <td class="text-end">$${Number(prod.precio_venta || 0).toFixed(2)}</td>
        <td class="text-center">${disponibilidadHtml}</td>
        <td class="columna-acciones">
          <button class="btn btn-warning btn-sm btn-edit" data-id="${prod.id}" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-danger btn-sm btn-delete ms-1" data-id="${prod.id}" title="Eliminar">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      `;
      
      row.innerHTML = rowHtml;
    });

    // Asignamos los eventos a los botones recién creados
    document
      .querySelectorAll(".btn-edit")
      .forEach((btn) =>
        btn.addEventListener("click", (e) =>
          editarProducto(e.currentTarget.dataset.id),
        ),
      );
    document
      .querySelectorAll(".btn-delete")
      .forEach((btn) =>
        btn.addEventListener("click", (e) =>
          eliminarProducto(e.currentTarget.dataset.id),
        ),
      );
  };

  // ============================================================
  // 📂 FUNCIÓN 3: cargarCategorias
  // Llena el select de categorías con los datos del backend.
  // ============================================================
  const cargarCategorias = async () => {
    try {
      const token = getToken();
      const response = await fetch(API_CATEGORIAS_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Error ${response.status}`);

      categorias = await response.json();
      const valorActual = selectCategoria.value;
      selectCategoria.innerHTML =
        '<option value="">Seleccione categoría</option>';
      categorias.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.nombre;
        selectCategoria.appendChild(opt);
      });
      selectCategoria.value = valorActual;
      selectCategoria.disabled = false;
    } catch (error) {
      console.error("Error cargando categorías:", error);
      selectCategoria.innerHTML =
        '<option value="">❌ Error al cargar</option>';
      selectCategoria.disabled = true;
    }
  };

  // ============================================================
  // ➕ FUNCIÓN 4: anadirNuevaCategoria
  // Prompt para crear categorías sin salir del modal.
  // ============================================================
  const anadirNuevaCategoria = async () => {
    const { value: nombreCat } = await Swal.fire({
      title: "Nueva Categoría",
      input: "text",
      inputLabel: "Nombre de la categoría",
      inputPlaceholder: "Ej: Herramientas Manuales",
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      inputValidator: (v) => (!v ? "¡Escribe un nombre!" : undefined),
    });

    if (!nombreCat) return;

    const nombre = nombreCat.trim();
    if (
      categorias.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())
    ) {
      showAlert("Aviso", `La categoría "${nombre}" ya existe.`, "warning");
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${API_CATEGORIAS_URL}/crear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ nombre }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error del servidor");
      showAlert("¡Éxito!", `Categoría "${data.nombre}" creada.`, "success");
      await cargarCategorias();
      selectCategoria.value = data.id;
    } catch (error) {
      showAlert("Error", error.message, "error");
    }
  };

  // ============================================================
  // ✏️ FUNCIÓN 5: editarProducto
  // Carga los datos de un producto en el modal para editarlos.
  // Ahora incluye el campo de ubicación.
  // ============================================================
  const editarProducto = async (id) => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("No se pudo cargar el producto.");

      const prod = await res.json();

      productoId.value = prod.id;
      codigo.value = prod.codigo;
      nombre.value = prod.nombre;
      marca.value = prod.marca || "";
      descripcion.value = prod.descripcion || "";
      precioCosto.value = prod.precio_costo;
      precioVenta.value = prod.precio_venta;
      stockActual.value = prod.stock_actual || 0;
      stockMinimo.value = prod.stock_minimo || 2;
      ubicacion.value = prod.ubicacion || ""; // ← Cargamos la ubicación

      calcularMargen();
      await cargarCategorias();
      selectCategoria.value = prod.id_categoria;

      modalProductoLabel.textContent = "Editar Producto";
      modalProducto.show();
      configurarCamposPorRol(); // 🔒 Configurar campos por rol al abrir modal
    } catch (error) {
      showAlert(
        "Error",
        "No se pudieron cargar los datos del producto.",
        "error",
      );
    }
  };

  // ============================================================
  // 🗑️ FUNCIÓN 6: eliminarProducto
  // Elimina o desactiva un producto con confirmación.
  // ============================================================
  const eliminarProducto = async (id) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar producto?",
      text: "Si tiene historial de ventas, será desactivado. ¿Continuar?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });

    if (!confirm.isConfirmed) return;

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE_URL}/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error desconocido.");
      showAlert("¡Hecho!", data.message || "Producto eliminado.", "success");
      cargarProductos();
    } catch (error) {
      showAlert("Error", error.message, "error");
    }
  };

  // ============================================================
  // 💾 EVENTO: Enviar formulario (Crear o Actualizar)
  // Recopila todos los datos del form, incluida la ubicación,
  // y los envía al backend.
  // ============================================================
  formProducto.addEventListener("submit", async (e) => {
    e.preventDefault();

    const confirm = await Swal.fire({
      title: "¿Guardar cambios?",
      text: "Confirma que los datos son correctos.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#0d6efd",
      confirmButtonText: "Sí, guardar",
      cancelButtonText: "Cancelar",
    });

    if (!confirm.isConfirmed) return;

    // Recopilamos todos los datos del formulario
    const productoData = {
      codigo: codigo.value.trim(),
      nombre: nombre.value.trim(),
      marca: marca.value.trim(),
      descripcion: descripcion.value.trim(),
      precio_venta: parseFloat(precioVenta.value) || 0,
      precio_costo: parseFloat(precioCosto.value) || 0,
      id_categoria: selectCategoria.value
        ? parseInt(selectCategoria.value)
        : null,
      stock: parseInt(stockActual.value) || 0,
      stock_minimo: stockMinimo.value !== "" ? parseInt(stockMinimo.value) : 2,
      ubicacion: ubicacion.value.trim() || "Sin ubicación", // ← ¡NUEVO!
    };

    const id = productoId.value;
    const method = id ? "PUT" : "POST";
    const url = id ? `${API_BASE_URL}/${id}` : API_BASE_URL;

    try {
      const token = getToken();
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(productoData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Error del servidor.");

      await Swal.fire({
        title: id ? "¡Producto Actualizado!" : "¡Producto Creado!",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
        timerProgressBar: true,
      });

      modalProducto.hide();
      cargarProductos();
    } catch (error) {
      Swal.fire({
        title: "Error al Guardar",
        text: error.message,
        icon: "error",
      });
    }
  });

  // ============================================================
  // 🔍 FILTRO EN TIEMPO REAL
  // Busca productos mientras el usuario escribe.
  // Ahora también busca por ubicación.
  // ============================================================
  inputBuscarProducto.addEventListener("keyup", () => {
    const term = inputBuscarProducto.value.toLowerCase();
    const filtrados = productos.filter(
      (p) =>
        (p.nombre?.toLowerCase() || "").includes(term) ||
        (p.codigo?.toLowerCase() || "").includes(term) ||
        (p.marca?.toLowerCase() || "").includes(term) ||
        (p.nombre_categoria?.toLowerCase() || "").includes(term) ||
        (p.ubicacion?.toLowerCase() || "").includes(term), // ← También busca por ubicación
    );
    mostrarProductos(filtrados);
  });

  // ============================================================
  // 📁 LÓGICA DE IMPORTACIÓN DESDE EXCEL
  // Al seleccionar un archivo, habilitamos el botón de importar
  // y mostramos una vista previa del nombre del archivo.
  // ============================================================
  btnImportarExcel.addEventListener("click", () => {
    inputArchivoExcel.value = ""; // Limpiar selección previa
    previewArchivo.classList.add("d-none");
    btnConfirmarImportar.disabled = true;
    modalImportarExcel.show();
  });

  inputArchivoExcel.addEventListener("change", () => {
    if (inputArchivoExcel.files.length > 0) {
      const archivo = inputArchivoExcel.files[0];
      nombreArchivoSeleccionado.textContent = archivo.name;
      previewArchivo.classList.remove("d-none");
      btnConfirmarImportar.disabled = false;
    } else {
      previewArchivo.classList.add("d-none");
      btnConfirmarImportar.disabled = true;
    }
  });

  // Al hacer click en "Importar y ver Reporte", primero pedimos confirmación
  btnConfirmarImportar.addEventListener("click", async () => {
    if (!inputArchivoExcel.files.length) return;

    const archivo = inputArchivoExcel.files[0];

    // 📋 Pedimos confirmación antes de procesar
    const confirm = await Swal.fire({
      title: "¿Iniciar importación?",
      html: `
        <p>Se procesará el archivo: <strong>${archivo.name}</strong></p>
        <ul class="text-start small">
          <li>Productos <strong>nuevos</strong> serán creados.</li>
          <li>Productos <strong>existentes</strong> (mismo código) serán actualizados.</li>
          <li>Al finalizar recibirás un <strong>reporte PDF</strong>.</li>
        </ul>
      `,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      confirmButtonText: '<i class="fas fa-file-import me-1"></i>Sí, importar',
      cancelButtonText: "Cancelar",
    });

    if (!confirm.isConfirmed) return;

    // Cerramos el modal y mostramos el loading
    modalImportarExcel.hide();
    Swal.fire({
      title: "⏳ Procesando archivo...",
      text: "Esto puede tardar unos segundos. Por favor espera.",
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const token = getToken();

      // Usamos FormData para enviar el archivo al backend
      const formData = new FormData();
      formData.append("archivo", archivo); // "archivo" es el nombre que espera multer

      const res = await fetch(API_IMPORTAR_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // ¡No ponemos Content-Type! Lo maneja FormData
        body: formData,
      });

      Swal.close();

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || `Error HTTP ${res.status}`);
      }

      // El backend nos devuelve el PDF del reporte, lo abrimos en nueva pestaña
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");

      // Recargamos la tabla de productos para ver los cambios
      cargarProductos();

      Swal.fire({
        title: "¡Importación Completa!",
        text: "El reporte de importación se abrió en una nueva pestaña.",
        icon: "success",
        timer: 3000,
        timerProgressBar: true,
      });
    } catch (error) {
      Swal.close();
      Swal.fire({
        title: "Error en la importación",
        text: error.message,
        icon: "error",
      });
    }
  });

  // ============================================================
  // 🔢 BOTÓN: Nuevo Producto — Limpia el formulario
  // ============================================================
  btnNuevoProducto.addEventListener("click", () => {
    formProducto.reset();
    productoId.value = "";
    ubicacion.value = "";
    modalProductoLabel.textContent = "Crear Nuevo Producto";
    document.getElementById("margenPorcentaje").value = 50; // Margen por defecto
    cargarCategorias();
    modalProducto.show();
  });

  // ============================================================
  // 🏷️ MODO CLIENTE — Oculta columnas y botones de gestión
  // ============================================================
  const modoClienteSwitch = document.getElementById("modoClienteSwitch");
  modoClienteSwitch.addEventListener("change", () => {
    const isActivo = modoClienteSwitch.checked;
    document.body.classList.toggle("modo-cliente-activo", isActivo);
    
    // Actualizar encabezados de la tabla
    const thUbicacion = document.querySelector("th:nth-child(5)");
    const thStock = document.querySelector("th:nth-child(7)");
    
    if (isActivo) {
        if (thUbicacion) thUbicacion.style.display = "none";
        if (thStock) thStock.textContent = "Disponibilidad";
    } else {
        if (thUbicacion) thUbicacion.style.display = "";
        if (thStock) thStock.textContent = "Stock";
    }

    cargarProductos(); // Recargar datos desde el backend con el filtro de privacidad
  });

  // Botón para añadir categoría desde el modal
  btnAnadirCategoria.addEventListener("click", anadirNuevaCategoria);

  // ============================================================
  // � CONTROL DE ACCESO POR ROL
  // Los vendedores NO pueden importar productos desde Excel
  // ============================================================
  const verificarPermisosPorRol = () => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user && user.rol !== "Administrador") {
          // 🚫 Ocultar botón de Importar Excel para vendedores
          if (btnImportarExcel) {
            btnImportarExcel.style.display = "none";
          }
          console.log("👤 Usuario Vendedor: Importación Excel deshabilitada");
        } else {
          console.log("👑 Usuario Administrador: Acceso completo habilitado");
        }
      } catch (e) {
        console.error("❌ Error al verificar permisos:", e);
      }
    }
  };

  // ============================================================
  // � CONFIGURAR CAMPOS POR ROL — Restringir edición según permisos
  // ============================================================
  const configurarCamposPorRol = () => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const user = JSON.parse(userData);
        if (user && user.rol !== "Administrador") {
          // 🚫 Deshabilitar campos de precio para vendedores
          const camposPrecio = document.querySelectorAll(".campo-precio");
          camposPrecio.forEach((campo) => {
            campo.disabled = true;
            campo.style.backgroundColor = "#f8f9fa";
            campo.style.cursor = "not-allowed";
            campo.title = "Solo administradores pueden modificar precios";
          });

          // 🚫 Deshabilitar campos de stock para vendedores
          const camposStock = document.querySelectorAll(".campo-stock");
          camposStock.forEach((campo) => {
            campo.disabled = true;
            campo.style.backgroundColor = "#f8f9fa";
            campo.style.cursor = "not-allowed";
            campo.title = "Solo administradores pueden modificar stock";
          });

          console.log(
            "👤 Usuario Vendedor: Campos precio/stock deshabilitados",
          );
        } else {
          console.log("👑 Usuario Administrador: Todos los campos habilitados");
        }
      } catch (e) {
        console.error("❌ Error al configurar campos por rol:", e);
      }
    }
  };

  // ============================================================
  // 🚀 INICIALIZACIÓN — Cargamos productos y categorías al abrir
  // ============================================================
  verificarPermisosPorRol(); // 🔐 Verificar permisos primero
  configurarCamposPorRol(); // 🔒 Configurar campos por rol
  cargarProductos();
  cargarCategorias();
});
