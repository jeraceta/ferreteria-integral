/**
 * tesoreria.js
 * Módulo de Tesorería (CxC y CxP) – con buscador inteligente y acciones CRUD.
 */

document.addEventListener("DOMContentLoaded", () => {
  cargarDatos();

  document.getElementById("formAbono").addEventListener("submit", (e) => { e.preventDefault(); procesarAbono(); });
  document.getElementById("formNuevaCxc").addEventListener("submit", (e) => { e.preventDefault(); procesarNuevaCxc(); });
  document.getElementById("formNuevaCxp").addEventListener("submit", (e) => { e.preventDefault(); procesarNuevaCxp(); });
  document.getElementById("formEditarCxc").addEventListener("submit", (e) => { e.preventDefault(); procesarEditarCxc(); });
  document.getElementById("formEditarCxp").addEventListener("submit", (e) => { e.preventDefault(); procesarEditarCxp(); });

  // Cerrar dropdowns al hacer clic fuera
  document.addEventListener("click", (e) => {
    document.querySelectorAll(".search-select-list.show").forEach(list => {
      if (!list.parentElement.contains(e.target)) list.classList.remove("show");
    });
  });
});

const API_URL = "http://localhost:3000/api/tesoreria";

let dataCxC = [];
let dataCxP = [];
let abonosMesCxC = 0;
let abonosMesCxP = 0;
let mostrarCerradasCxP = false;

// Cache de clientes y proveedores para buscador
let cacheClientes = [];
let cacheProveedores = [];

// ============================================
// CARGA DE DATOS PRINCIPAL
// ============================================

async function cargarDatos() {
  try {
    const token = localStorage.getItem("token");
    if (!token) return window.location.href = "login.html";
    const fetchOpts = { headers: { Authorization: `Bearer ${token}` } };

    let resCxC = await fetch(`${API_URL}/cxc`, fetchOpts);
    dataCxC = await resCxC.json();

    let resCxP = await fetch(`${API_URL}/cxp`, fetchOpts);
    dataCxP = await resCxP.json();

    abonosMesCxC = 0;
    abonosMesCxP = 0;

    renderizarCxC();
    renderizarCxP();
    actualizarKPIsCxC();
    actualizarKPIsCxP();
  } catch (err) {
    console.error("Error cargando tesoreria", err);
  }
}

// ============================================
// BUSCADOR INTELIGENTE (SEARCH-SELECT)
// ============================================

function inicializarBuscador(inputId, listaId, hiddenId, datos, campoNombre, campoDoc) {
  const input = document.getElementById(inputId);
  const lista = document.getElementById(listaId);
  const hidden = document.getElementById(hiddenId);

  input.addEventListener("input", () => {
    const q = input.value.toLowerCase().trim();
    hidden.value = "";
    if (q.length === 0) { lista.classList.remove("show"); return; }

    const filtrados = datos.filter(item => {
      const nombre = (item[campoNombre] || "").toLowerCase();
      const doc = (item[campoDoc] || "").toLowerCase();
      return nombre.includes(q) || doc.includes(q);
    });

    if (filtrados.length === 0) {
      lista.innerHTML = '<div class="search-select-item text-muted"><i class="fas fa-search me-2"></i>Sin resultados</div>';
    } else {
      lista.innerHTML = filtrados.map(item => `
        <div class="search-select-item" data-id="${item.id}" data-nombre="${item[campoNombre]}">
          <div class="fw-semibold">${item[campoNombre]}</div>
          <div class="search-doc"><i class="fas fa-id-card me-1"></i>${item[campoDoc] || 'Sin documento'}</div>
        </div>
      `).join("");
    }
    lista.classList.add("show");

    // Delegación de eventos para seleccionar
    lista.querySelectorAll(".search-select-item[data-id]").forEach(el => {
      el.addEventListener("click", () => {
        hidden.value = el.dataset.id;
        input.value = el.dataset.nombre;
        lista.classList.remove("show");
      });
    });
  });

  input.addEventListener("focus", () => {
    if (input.value.trim().length > 0) input.dispatchEvent(new Event("input"));
  });
}

async function cargarClientes() {
  if (cacheClientes.length > 0) return cacheClientes;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3000/api/clientes", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Error cargando clientes");
    cacheClientes = await res.json();
    // Normalizar campo de documento
    cacheClientes.forEach(c => {
      c._doc = c.cedula || c.numero_documento || c.rif || "";
    });
    return cacheClientes;
  } catch (e) {
    Swal.fire("Error", "No se pudo cargar los clientes.", "error");
    return [];
  }
}

async function cargarProveedores() {
  if (cacheProveedores.length > 0) return cacheProveedores;
  try {
    const token = localStorage.getItem("token");
    const res = await fetch("http://localhost:3000/api/proveedores", { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("Error cargando proveedores");
    cacheProveedores = await res.json();
    cacheProveedores.forEach(p => {
      p._doc = p.rif || p.numero_documento || "";
    });
    return cacheProveedores;
  } catch (e) {
    Swal.fire("Error", "No se pudo cargar los proveedores.", "error");
    return [];
  }
}

// ============================================
// LOGICA DE ESTADO Y BADGES
// ============================================

function determinarEstado(total, abonado, vencimiento) {
  const restante = total - abonado;
  const hoy = new Date().toISOString().split("T")[0];
  const estaVencido = vencimiento < hoy;

  if (restante <= 0) return { texto: "Pagado/Cerrado", clase: "bg-success" };
  if (abonado > 0) return { texto: "Abonado/Parcial", clase: estaVencido ? "bg-warning text-dark border border-danger" : "bg-warning text-dark" };
  if (estaVencido) return { texto: "Vencido", clase: "bg-danger" };
  return { texto: "Pendiente", clase: "bg-danger" };
}

function formatoMoneda(valor) {
  return `$${parseFloat(valor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ============================================
// RENDER CXC (Clientes) – con menú de acciones
// ============================================

function renderizarCxC() {
  const tbody = document.getElementById("tabla-cxc");
  tbody.innerHTML = `
    <thead class="table-light small text-muted">
      <tr>
        <th>Cliente</th>
        <th>Factura / Motivo</th>
        <th>Vencimiento</th>
        <th>Total</th>
        <th>Abonado</th>
        <th>Restante</th>
        <th>Estado</th>
        <th class="text-center">Acciones</th>
      </tr>
    </thead>
    <tbody id="cxc-content"></tbody>
  `;

  const content = document.getElementById("cxc-content");
  const activas = dataCxC.filter(item => (item.total - item.abonado) > 0);

  if (activas.length === 0) {
    content.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i class="fas fa-hand-holding-usd empty-state-icon text-muted opacity-50"></i>
            <h5 class="fw-bold text-muted">No hay cuentas por cobrar</h5>
            <p class="text-secondary small">Actualmente no existen registros de deuda pendientes de clientes.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  activas.forEach(item => {
    const restante = item.total - item.abonado;
    const estado = determinarEstado(item.total, item.abonado, item.vencimiento);

    html += `
      <tr>
        <td class="fw-semibold text-dark">${item.cliente}</td>
        <td><i class="fas fa-file-invoice me-1 text-muted"></i>${item.factura}</td>
        <td>${item.vencimiento}</td>
        <td>${formatoMoneda(item.total)}</td>
        <td class="text-success">${formatoMoneda(item.abonado)}</td>
        <td class="fw-bold">${formatoMoneda(restante)}</td>
        <td><span class="badge ${estado.clase}">${estado.texto}</span></td>
        <td class="text-center" style="white-space:nowrap">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirModalAbono('CxC', ${item.id})" title="Registrar Abono">
            <i class="fas fa-dollar-sign"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning me-1" onclick="abrirEditarCxC(${item.id})" title="Editar Cuenta">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarCxC(${item.id})" title="Eliminar Cuenta">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  });
  content.innerHTML = html;
}

// ============================================
// RENDER CXP (Proveedores) – con menú de acciones
// ============================================

function toggleHistorialCxP() {
  mostrarCerradasCxP = !mostrarCerradasCxP;
  renderizarCxP();
}

function renderizarCxP() {
  const tbody = document.getElementById("tabla-cxp");
  tbody.innerHTML = `
    <thead class="table-light small text-muted">
      <tr>
        <th>Proveedor</th>
        <th>Datos / Factura</th>
        <th>Vencimiento</th>
        <th>Total</th>
        <th>Abonado</th>
        <th>Restante</th>
        <th>Estado</th>
        <th class="text-center">Acciones</th>
      </tr>
    </thead>
    <tbody id="cxp-content"></tbody>
  `;

  const content = document.getElementById("cxp-content");

  const filtrarCerradas = mostrarCerradasCxP
    ? dataCxP.filter(item => (item.total - item.abonado) <= 0)
    : dataCxP.filter(item => (item.total - item.abonado) > 0);

  if (filtrarCerradas.length === 0) {
    content.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <i class="fas fa-file-invoice-dollar empty-state-icon text-muted opacity-50"></i>
            <h5 class="fw-bold text-muted">${mostrarCerradasCxP ? 'No hay pagos completados' : 'No hay cuentas por pagar'}</h5>
            <p class="text-secondary small">No se encontraron registros en esta vista.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = "";
  filtrarCerradas.forEach(item => {
    const restante = item.total - item.abonado;
    const estado = determinarEstado(item.total, item.abonado, item.vencimiento);

    html += `
      <tr>
        <td class="fw-semibold text-dark">${item.proveedor}</td>
        <td>
           <div class="small text-muted">${item.rif || ''}</div>
           <div><i class="fas fa-file-invoice me-1 text-muted"></i>${item.factura || '-'} - ${item.concepto || ''}</div>
        </td>
        <td>${item.vencimiento}</td>
        <td>${formatoMoneda(item.total)}</td>
        <td class="text-success">${formatoMoneda(item.abonado)}</td>
        <td class="fw-bold">${formatoMoneda(restante)}</td>
        <td><span class="badge ${estado.clase}">${estado.texto}</span></td>
        <td class="text-center" style="white-space:nowrap">
          ${restante > 0 ? `
          <button class="btn btn-sm btn-outline-primary me-1" onclick="abrirModalAbono('CxP', ${item.id})" title="Registrar Abono">
            <i class="fas fa-dollar-sign"></i>
          </button>` : `
          <button class="btn btn-sm btn-outline-secondary me-1" title="Ver Soportes">
            <i class="fas fa-paperclip"></i>
          </button>`}
          <button class="btn btn-sm btn-outline-warning me-1" onclick="abrirEditarCxP(${item.id})" title="Editar Cuenta">
            <i class="fas fa-edit"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="eliminarCxP(${item.id})" title="Eliminar Cuenta">
            <i class="fas fa-trash-alt"></i>
          </button>
        </td>
      </tr>
    `;
  });
  content.innerHTML = html;
}

// ============================================
// CALCULOS Y KPIs
// ============================================

function actualizarKPIsCxC() {
  const hoy = new Date().toISOString().split("T")[0];
  let pendiente = 0, vencido = 0;
  dataCxC.forEach(item => {
    const restante = item.total - item.abonado;
    if (restante > 0) { pendiente += restante; if (item.vencimiento < hoy) vencido += restante; }
  });
  document.getElementById("kpi-cxc-pendiente").innerText = formatoMoneda(pendiente);
  document.getElementById("kpi-cxc-vencido").innerText = formatoMoneda(vencido);
  document.getElementById("kpi-cxc-vencido").classList.toggle("text-danger", vencido > 0);
  document.getElementById("kpi-cxc-abonos").innerText = formatoMoneda(abonosMesCxC);
}

function actualizarKPIsCxP() {
  const hoy = new Date().toISOString().split("T")[0];
  let pendiente = 0, vencido = 0;
  dataCxP.forEach(item => {
    const restante = item.total - item.abonado;
    if (restante > 0) { pendiente += restante; if (item.vencimiento < hoy) vencido += restante; }
  });
  document.getElementById("kpi-cxp-pendiente").innerText = formatoMoneda(pendiente);
  document.getElementById("kpi-cxp-vencido").innerText = formatoMoneda(vencido);
  document.getElementById("kpi-cxp-vencido").classList.toggle("text-danger", vencido > 0);
  document.getElementById("kpi-cxp-abonos").innerText = formatoMoneda(abonosMesCxP);
}

// ============================================
// MODAL ABONOS
// ============================================

let abonoModalInstance;

function abrirModalAbono(tipo, id) {
  document.getElementById("formAbono").reset();
  document.getElementById("abonoTipo").value = tipo;
  document.getElementById("abonoId").value = id;

  const db = tipo === 'CxC' ? dataCxC : dataCxP;
  const item = db.find(x => x.id === id);
  const restante = item.total - item.abonado;

  document.getElementById("abonoSaldoRestante").innerText = formatoMoneda(restante);
  document.getElementById("montoAbono").max = restante;
  document.getElementById("montoAbono").value = restante.toFixed(2);

  abonoModalInstance = new bootstrap.Modal(document.getElementById('modalAbono'));
  abonoModalInstance.show();
}

async function procesarAbono() {
  const tipo = document.getElementById("abonoTipo").value;
  const id = parseInt(document.getElementById("abonoId").value);
  const monto = parseFloat(document.getElementById("montoAbono").value);
  const soporte = document.getElementById("soporteAbono").value;

  const db = tipo === 'CxC' ? dataCxC : dataCxP;
  const item = db.find(x => x.id === id);
  if (!item || isNaN(monto) || monto <= 0) return;

  const restante = item.total - item.abonado;
  if (monto > restante) { Swal.fire("Error", "No puedes abonar más del saldo restante.", "error"); return; }

  try {
    const token = localStorage.getItem("token");
    const endpoint = tipo === 'CxC' ? `${API_URL}/cxc/${id}/abono` : `${API_URL}/cxp/${id}/abono`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ monto, soporte })
    });
    if (!response.ok) { const err = await response.json(); throw new Error(err.message || "Error registrando abono"); }

    abonoModalInstance.hide();
    Swal.fire({ icon: 'success', title: 'Abono Registrado', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch(error) {
    Swal.fire("Error", error.message, "error");
  }
}

// ============================================
// CREAR NUEVA CXC (con buscador)
// ============================================

async function abrirModalCxC() {
  const clientes = await cargarClientes();
  document.getElementById("formNuevaCxc").reset();
  document.getElementById("cxcClienteId").value = "";
  document.getElementById("cxcClienteBuscar").value = "";
  inicializarBuscador("cxcClienteBuscar", "cxcClienteLista", "cxcClienteId", clientes, "razon_social", "_doc");
  new bootstrap.Modal(document.getElementById('modalNuevaCxc')).show();
}

async function procesarNuevaCxc() {
  const cliente_id = document.getElementById("cxcClienteId").value;
  if (!cliente_id) { Swal.fire("Atención", "Debes seleccionar un cliente de la lista.", "warning"); return; }

  const data = {
    cliente_id,
    factura: document.getElementById("cxcFactura").value,
    vencimiento: document.getElementById("cxcVencimiento").value,
    total: document.getElementById("cxcTotal").value
  };

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error guardando la cuenta");

    bootstrap.Modal.getInstance(document.getElementById('modalNuevaCxc')).hide();
    Swal.fire({ icon: 'success', title: 'Cuenta Creada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// CREAR NUEVA CXP (con buscador)
// ============================================

async function abrirModalCxP() {
  const proveedores = await cargarProveedores();
  document.getElementById("formNuevaCxp").reset();
  document.getElementById("cxpProveedorId").value = "";
  document.getElementById("cxpProveedorBuscar").value = "";
  inicializarBuscador("cxpProveedorBuscar", "cxpProveedorLista", "cxpProveedorId", proveedores, "nombre", "_doc");
  new bootstrap.Modal(document.getElementById('modalNuevaCxp')).show();
}

async function procesarNuevaCxp() {
  const proveedor_id = document.getElementById("cxpProveedorId").value;
  if (!proveedor_id) { Swal.fire("Atención", "Debes seleccionar un proveedor de la lista.", "warning"); return; }

  const data = {
    proveedor_id,
    factura: document.getElementById("cxpFactura").value,
    concepto: document.getElementById("cxpConcepto").value,
    vencimiento: document.getElementById("cxpVencimiento").value,
    total: document.getElementById("cxpTotal").value
  };

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error guardando la cuenta");

    bootstrap.Modal.getInstance(document.getElementById('modalNuevaCxp')).hide();
    Swal.fire({ icon: 'success', title: 'Cuenta Creada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// EDITAR CXC
// ============================================

async function abrirEditarCxC(id) {
  const item = dataCxC.find(x => x.id === id);
  if (!item) return;

  const clientes = await cargarClientes();
  document.getElementById("editCxcId").value = id;
  document.getElementById("editCxcClienteBuscar").value = item.cliente;
  document.getElementById("editCxcClienteId").value = item.cliente_id || "";
  document.getElementById("editCxcFactura").value = item.factura;
  document.getElementById("editCxcVencimiento").value = item.vencimiento;
  document.getElementById("editCxcTotal").value = parseFloat(item.total).toFixed(2);

  inicializarBuscador("editCxcClienteBuscar", "editCxcClienteLista", "editCxcClienteId", clientes, "razon_social", "_doc");
  new bootstrap.Modal(document.getElementById('modalEditarCxc')).show();
}

async function procesarEditarCxc() {
  const id = document.getElementById("editCxcId").value;
  const cliente_id = document.getElementById("editCxcClienteId").value;
  if (!cliente_id) { Swal.fire("Atención", "Debes seleccionar un cliente de la lista.", "warning"); return; }

  const data = {
    cliente_id,
    factura: document.getElementById("editCxcFactura").value,
    vencimiento: document.getElementById("editCxcVencimiento").value,
    total: document.getElementById("editCxcTotal").value
  };

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxc/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error actualizando la cuenta");

    bootstrap.Modal.getInstance(document.getElementById('modalEditarCxc')).hide();
    Swal.fire({ icon: 'success', title: 'Cuenta Actualizada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// ELIMINAR CXC
// ============================================

async function eliminarCxC(id) {
  const result = await Swal.fire({
    title: '¿Eliminar esta cuenta?',
    text: 'Esta acción no se puede deshacer. Se eliminarán también los abonos asociados.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxc/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Error eliminando la cuenta");

    Swal.fire({ icon: 'success', title: 'Cuenta Eliminada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// EDITAR CXP
// ============================================

async function abrirEditarCxP(id) {
  const item = dataCxP.find(x => x.id === id);
  if (!item) return;

  const proveedores = await cargarProveedores();
  document.getElementById("editCxpId").value = id;
  document.getElementById("editCxpProveedorBuscar").value = item.proveedor;
  document.getElementById("editCxpProveedorId").value = item.proveedor_id || "";
  document.getElementById("editCxpFactura").value = item.factura || "";
  document.getElementById("editCxpConcepto").value = item.concepto || "";
  document.getElementById("editCxpVencimiento").value = item.vencimiento;
  document.getElementById("editCxpTotal").value = parseFloat(item.total).toFixed(2);

  inicializarBuscador("editCxpProveedorBuscar", "editCxpProveedorLista", "editCxpProveedorId", proveedores, "nombre", "_doc");
  new bootstrap.Modal(document.getElementById('modalEditarCxp')).show();
}

async function procesarEditarCxp() {
  const id = document.getElementById("editCxpId").value;
  const proveedor_id = document.getElementById("editCxpProveedorId").value;
  if (!proveedor_id) { Swal.fire("Atención", "Debes seleccionar un proveedor de la lista.", "warning"); return; }

  const data = {
    proveedor_id,
    factura: document.getElementById("editCxpFactura").value,
    concepto: document.getElementById("editCxpConcepto").value,
    vencimiento: document.getElementById("editCxpVencimiento").value,
    total: document.getElementById("editCxpTotal").value
  };

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxp/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error("Error actualizando la cuenta");

    bootstrap.Modal.getInstance(document.getElementById('modalEditarCxp')).hide();
    Swal.fire({ icon: 'success', title: 'Cuenta Actualizada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// ELIMINAR CXP
// ============================================

async function eliminarCxP(id) {
  const result = await Swal.fire({
    title: '¿Eliminar esta cuenta?',
    text: 'Esta acción no se puede deshacer. Se eliminarán también los abonos asociados.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#dc3545',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  if (!result.isConfirmed) return;

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/cxp/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Error eliminando la cuenta");

    Swal.fire({ icon: 'success', title: 'Cuenta Eliminada', timer: 1500, showConfirmButton: false });
    cargarDatos();
  } catch (err) {
    Swal.fire("Error", err.message, "error");
  }
}

// ============================================
// EXPORTS (PDF y Excel)
// ============================================

async function descargarReporte(url, isPdf = false, nombreArchivo) {
  try {
    const token = localStorage.getItem("token");
    Swal.fire({ title: "Generando...", text: "Por favor espere", allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error("Error al generar el reporte");

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);
    Swal.close();

    if (isPdf) {
      window.open(blobUrl, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = nombreArchivo;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    }
  } catch (error) {
    console.error(error);
    Swal.fire("Error", "No se pudo generar el reporte.", "error");
  }
}

function exportarExcelCxC() { descargarReporte(`${API_URL}/cxc/exportar-excel`, false, `CxC_${new Date().toISOString().split("T")[0]}.xlsx`); }
function exportarPdfCxC() { descargarReporte(`${API_URL}/cxc/exportar-pdf`, true); }
function exportarExcelCxP() { descargarReporte(`${API_URL}/cxp/exportar-excel`, false, `CxP_${new Date().toISOString().split("T")[0]}.xlsx`); }
function exportarPdfCxP() { descargarReporte(`${API_URL}/cxp/exportar-pdf`, true); }
