/**
 * ajuste-inventario.js
 * ====================
 * ¡Este archivo controla todo el módulo de Ajuste de Inventario! 🎯
 *
 * ¿Qué hace exactamente?
 *  1. Busca productos de forma predictiva mientras el usuario escribe
 *  2. Los agrega a una tabla donde se puede escribir el ajuste (+/-)
 *  3. Calcula en tiempo real el stock resultante
 *  4. Al procesar, envía los datos al backend y recibe un comprobante PDF
 *  5. Carga y muestra el historial de ajustes anteriores
 *
 * El "ajuste" es un número que puede ser:
 *   +5 → entran 5 unidades (se encontraron más de las que decía el sistema)
 *   -3 → salen 3 unidades (hay 3 menos que en el sistema)
 */

document.addEventListener("DOMContentLoaded", () => {

  // ── URLs base del API ──
  const API_BASE = "http://localhost:3000/api";
  const token = localStorage.getItem("token");

  // ── Referencias a elementos del DOM ──
  const buscarProductoInput = document.getElementById("buscarProductoAjuste");
  const sugerenciasDiv = document.getElementById("sugerenciasAjuste");
  const motivoInput = document.getElementById("motivoAjuste");
  const tablaAjuste = document.getElementById("tablaAjuste");
  const filaVacia = document.getElementById("filaVaciaAjuste");
  const btnProcesar = document.getElementById("btnProcesarAjuste");
  const btnLimpiar = document.getElementById("btnLimpiarAjuste");
  const btnRefrescar = document.getElementById("btnRefrescarHistorial");
  const tablaHistorial = document.getElementById("tablaHistorialAjustes");

  // ── Estado local de la aplicación ──
  // Guardamos los productos que el usuario está ajustando en este array
  let itemsAjuste = [];
  let timeoutBusqueda = null; // Para el debounce de la búsqueda (no llamar API en cada tecla)

  // ============================================================
  // 🔑 HELPER: getToken / getUser
  // ============================================================
  const getToken = () => localStorage.getItem("token");
  const getUser = () => {
    try { return JSON.parse(localStorage.getItem("user") || "{}"); }
    catch (_) { return {}; }
  };

  // ============================================================
  // 🔍 FUNCIÓN: buscarProductos
  // Hace la búsqueda predictiva: llama al API cuando el usuario
  // lleva 2+ caracteres escritos. Usa debounce para no sobrecargar.
  // ============================================================
  async function buscarProductos(termino) {
    if (termino.length < 2) {
      sugerenciasDiv.style.display = "none";
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/productos/buscar?termino=${encodeURIComponent(termino)}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();
      const productos = await res.json();

      // Mostramos las sugerencias como una lista desplegable
      if (productos.length === 0) {
        sugerenciasDiv.innerHTML = '<div class="list-group-item text-muted small">No se encontraron productos.</div>';
      } else {
        sugerenciasDiv.innerHTML = productos.map((p) => `
          <button type="button" class="list-group-item list-group-item-action"
            data-id="${p.id}" data-codigo="${p.codigo}" data-nombre="${p.nombre}"
            data-stock="${p.stock}" data-ubicacion="${p.ubicacion || ''}">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${p.codigo}</strong> — ${p.nombre}
                ${p.ubicacion && p.ubicacion !== 'Sin ubicación'
                  ? `<small class="ms-2 text-primary"><i class="fas fa-map-marker-alt"></i> ${p.ubicacion}</small>`
                  : ""}
              </div>
              <span class="badge ${p.stock <= 0 ? 'bg-danger' : 'bg-success'} ms-2">${p.stock} und.</span>
            </div>
          </button>
        `).join("");
      }

      sugerenciasDiv.style.display = "block";

      // Evento: cuando el usuario hace click en una sugerencia
      sugerenciasDiv.querySelectorAll("button").forEach((btn) => {
        btn.addEventListener("click", () => agregarProducto({
          id: btn.dataset.id,
          codigo: btn.dataset.codigo,
          nombre: btn.dataset.nombre,
          stock: parseInt(btn.dataset.stock) || 0,
          ubicacion: btn.dataset.ubicacion || "",
        }));
      });

    } catch (_) {
      sugerenciasDiv.style.display = "none";
    }
  }

  // Ocultamos sugerencias al hacer click fuera
  document.addEventListener("click", (e) => {
    if (!buscarProductoInput.contains(e.target) && !sugerenciasDiv.contains(e.target)) {
      sugerenciasDiv.style.display = "none";
    }
  });

  // Búsqueda con debounce: esperamos 300ms después de la última tecla
  buscarProductoInput.addEventListener("input", () => {
    clearTimeout(timeoutBusqueda);
    timeoutBusqueda = setTimeout(() => buscarProductos(buscarProductoInput.value.trim()), 300);
  });

  // ============================================================
  // ➕ FUNCIÓN: agregarProducto
  // Agrega un producto a la tabla de ajuste.
  // Si ya está en la tabla, avisa en lugar de duplicar.
  // ============================================================
  function agregarProducto(prod) {
    // Ocultamos las sugerencias y limpiamos el input
    sugerenciasDiv.style.display = "none";
    buscarProductoInput.value = "";
    buscarProductoInput.focus();

    // Verificamos si el producto ya está en la tabla
    if (itemsAjuste.some((item) => item.id === prod.id)) {
      Swal.fire({
        toast: true, position: "top-end", icon: "warning",
        title: `"${prod.nombre}" ya está en la lista.`,
        showConfirmButton: false, timer: 2500,
      });
      return;
    }

    // Si la fila vacía está visible, la quitamos
    filaVacia.style.display = "none";

    // Creamos el ítem de ajuste con ajuste=0 por defecto
    const item = { id: prod.id, codigo: prod.codigo, nombre: prod.nombre, stock: prod.stock, ajuste: 0, ubicacion: prod.ubicacion };
    itemsAjuste.push(item);

    // Creamos la fila en la tabla
    const tr = document.createElement("tr");
    tr.id = `fila-ajuste-${prod.id}`;
    tr.className = "fila-nueva"; // Animación de highlight
    tr.innerHTML = `
      <td><code>${prod.codigo}</code></td>
      <td class="fw-semibold">${prod.nombre}</td>
      <td class="text-center">
        ${prod.ubicacion && prod.ubicacion !== 'Sin ubicación'
          ? `<span style="background:#e8f4ff;color:#0d6efd;border:1px solid #b6d4fe;
              border-radius:4px;padding:2px 8px;font-family:monospace;font-size:0.8rem;">
              <i class="fas fa-map-marker-alt me-1"></i>${prod.ubicacion}</span>`
          : '<span class="text-muted">—</span>'}
      </td>
      <td class="text-center fw-bold fs-5" id="stock-actual-${prod.id}">${prod.stock}</td>
      <td class="text-center">
        <!-- Input del ajuste: el corazón de este módulo! -->
        <input type="number" class="form-control form-control-sm text-center fw-bold"
          id="ajuste-${prod.id}" value="0" style="max-width:110px;margin:auto;"
          title="Positivo (+) para agregar stock, negativo (-) para restar" />
      </td>
      <td class="text-center fw-bold fs-5" id="stock-nuevo-${prod.id}">${prod.stock}</td>
      <td class="text-center">
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="quitarProducto('${prod.id}')">
          <i class="fas fa-times"></i>
        </button>
      </td>`;

    tablaAjuste.appendChild(tr);
    actualizarBotonProcesar();

    // Cuando el usuario escribe el ajuste, recalculamos el stock resultante
    const inputAjuste = document.getElementById(`ajuste-${prod.id}`);
    inputAjuste.addEventListener("input", () => {
      const val = parseInt(inputAjuste.value) || 0;
      const stockNuevo = prod.stock + val;

      // Actualizamos el stock resultante con color según el cambio
      const stockNuevoEl = document.getElementById(`stock-nuevo-${prod.id}`);
      stockNuevoEl.textContent = stockNuevo;
      stockNuevoEl.className = `text-center fw-bold fs-5 ${
        val > 0 ? "text-success" : val < 0 ? "text-danger" : ""
      }`;

      // Actualizamos el item en el array local
      const idx = itemsAjuste.findIndex((i) => i.id === prod.id);
      if (idx !== -1) itemsAjuste[idx].ajuste = val;

      actualizarBotonProcesar();
    });
  }

  // ============================================================
  // ❌ FUNCIÓN: quitarProducto (expuesta globalmente para onclick)
  // Quita un producto de la tabla de ajuste.
  // ============================================================
  window.quitarProducto = (id) => {
    itemsAjuste = itemsAjuste.filter((i) => i.id !== id);
    const fila = document.getElementById(`fila-ajuste-${id}`);
    if (fila) fila.remove();
    if (itemsAjuste.length === 0) filaVacia.style.display = "";
    actualizarBotonProcesar();
  };

  // ============================================================
  // 🔄 FUNCIÓN: actualizarBotonProcesar
  // El botón de procesar solo se habilita cuando:
  //  - Hay al menos 1 producto en la tabla
  //  - Al menos 1 producto tiene un ajuste diferente de 0
  //  - El campo Motivo no está vacío
  // ============================================================
  function actualizarBotonProcesar() {
    const hayProductos = itemsAjuste.length > 0;
    const hayAjustes = itemsAjuste.some((i) => i.ajuste !== 0);
    btnProcesar.disabled = !(hayProductos && hayAjustes);
  }

  // También validamos al escribir el motivo
  motivoInput.addEventListener("input", actualizarBotonProcesar);

  // ============================================================
  // 🗑️ FUNCIÓN: limpiarLista
  // Vacía la tabla de ajuste para empezar de cero.
  // ============================================================
  btnLimpiar.addEventListener("click", () => {
    itemsAjuste = [];
    tablaAjuste.innerHTML = "";
    tablaAjuste.appendChild(filaVacia);
    filaVacia.style.display = "";
    motivoInput.value = "";
    actualizarBotonProcesar();
  });

  // ============================================================
  // ✅ FUNCIÓN: procesarAjuste
  // Esta es la función principal. Al hacer click en "Procesar":
  //  1. Pedimos confirmación con un resumen
  //  2. Enviamos los datos al backend
  //  3. Abrimos el comprobante PDF
  //  4. Recargamos el historial
  // ============================================================
  btnProcesar.addEventListener("click", async () => {
    const motivo = motivoInput.value.trim();

    // Validación: el motivo es obligatorio
    if (!motivo) {
      Swal.fire({
        icon: "warning",
        title: "Falta el Motivo",
        text: "El campo 'Motivo del Ajuste' es obligatorio para procesar.",
      });
      motivoInput.focus();
      return;
    }

    // Solo mandamos los productos que realmente tienen un ajuste
    const detallesAEnviar = itemsAjuste
      .filter((i) => i.ajuste !== 0)
      .map((i) => ({ id_producto: i.id, ajuste: i.ajuste }));

    if (detallesAEnviar.length === 0) {
      Swal.fire({ icon: "info", title: "Sin cambios", text: "No has ingresado ningún ajuste distinto de 0." });
      return;
    }

    // Construimos un resumen bonito para el SweetAlert de confirmación
    const resumenHTML = detallesAEnviar.map((d) => {
      const item = itemsAjuste.find((i) => i.id === d.id_producto);
      const signo = d.ajuste > 0 ? "+" : "";
      return `<li>${item.nombre}: <strong class="${d.ajuste > 0 ? 'text-success' : 'text-danger'}">${signo}${d.ajuste} uds</strong></li>`;
    }).join("");

    const confirm = await Swal.fire({
      title: "¿Procesar Ajuste?",
      html: `
        <p><strong>Motivo:</strong> ${motivo}</p>
        <p class="mb-1"><strong>Cambios a aplicar:</strong></p>
        <ul class="text-start small">${resumenHTML}</ul>
        <p class="text-muted small mt-2">Esta acción actualiza el stock en la base de datos y no se puede revertir.</p>`,
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#198754",
      confirmButtonText: '<i class="fas fa-check me-1"></i>Sí, procesar',
      cancelButtonText: "Revisar",
    });

    if (!confirm.isConfirmed) return;

    Swal.fire({ title: "Procesando...", text: "Actualizando el inventario. Por favor espera.", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      // Enviamos el ajuste al backend
      const res = await fetch(`${API_BASE}/ajustes/procesar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ motivo, detalles: detallesAEnviar }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `Error HTTP ${res.status}`);

      Swal.close();

      // Abrimos el comprobante PDF en nueva pestaña
      const resPDF = await fetch(`${API_BASE}/ajustes/comprobante/${data.id_ajuste}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (resPDF.ok) {
        const blob = await resPDF.blob();
        window.open(URL.createObjectURL(blob), "_blank");
      }

      // Notificamos éxito
      await Swal.fire({
        icon: "success",
        title: `¡Ajuste ${data.numero_ajuste} Procesado!`,
        text: "El comprobante PDF se abrió en una nueva pestaña. Se ha recargado el historial.",
        timer: 3500,
        timerProgressBar: true,
      });

      // Limpiamos la tabla y recargamos el historial
      itemsAjuste = [];
      tablaAjuste.innerHTML = "";
      tablaAjuste.appendChild(filaVacia);
      filaVacia.style.display = "";
      motivoInput.value = "";
      actualizarBotonProcesar();
      cargarHistorial();

    } catch (error) {
      Swal.close();
      Swal.fire({ icon: "error", title: "Error al Procesar", text: error.message });
    }
  });

  // ============================================================
  // 📋 FUNCIÓN: cargarHistorial
  // Trae del backend todos los ajustes realizados y los muestra
  // en la tabla de historial con botón para ver el PDF.
  // ============================================================
  async function cargarHistorial() {
    tablaHistorial.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm me-2"></div>Cargando...</td></tr>';

    try {
      const res = await fetch(`${API_BASE}/ajustes/historial`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error();

      const data = await res.json();
      const ajustes = data.data || [];

      if (ajustes.length === 0) {
        tablaHistorial.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3"><i class="fas fa-inbox me-2"></i>No hay ajustes registrados aún.</td></tr>';
        return;
      }

      tablaHistorial.innerHTML = ajustes.map((a) => `
        <tr>
          <td><span class="badge-ajuste">${a.numero_ajuste}</span></td>
          <td>${new Date(a.fecha_ajuste).toLocaleString("es-VE")}</td>
          <td><i class="fas fa-user-circle me-1 text-muted"></i>${a.responsable || "—"}</td>
          <td class="text-truncate" style="max-width:220px;" title="${a.motivo}">${a.motivo}</td>
          <td class="text-center"><span class="badge bg-secondary">${a.total_productos}</span></td>
          <td class="text-center">
            <button class="btn btn-sm btn-outline-danger" onclick="verComprobante(${a.id})" title="Ver comprobante PDF">
              <i class="fas fa-file-pdf me-1"></i>PDF
            </button>
          </td>
        </tr>`).join("");

    } catch (_) {
      tablaHistorial.innerHTML = '<tr><td colspan="6" class="text-center text-danger py-3">Error al cargar el historial.</td></tr>';
    }
  }

  // ============================================================
  // 📄 FUNCIÓN: verComprobante (global para onclick inline)
  // Abre el PDF de un ajuste específico en una nueva pestaña.
  // ============================================================
  window.verComprobante = async (idAjuste) => {
    Swal.fire({ title: "Cargando PDF...", allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const res = await fetch(`${API_BASE}/ajustes/comprobante/${idAjuste}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Error al obtener el comprobante.");
      const blob = await res.blob();
      Swal.close();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (error) {
      Swal.fire({ icon: "error", title: "Error", text: error.message });
    }
  };

  // Botón refrescar historial
  btnRefrescar.addEventListener("click", cargarHistorial);

  // ============================================================
  // 🚀 INICIALIZACIÓN
  // ============================================================
  cargarHistorial();
});
