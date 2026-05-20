/**
 * historial-cierres.js
 * Módulo de Historial de Cierres de Caja (Reportes Z).
 * Consulta todos los cierres registrados y permite ver el desglose de cada uno.
 */

const API_URL = "http://localhost:3000/api/ventas";

// Formatea un número como moneda dólares
function fmt(valor) {
  return `$${parseFloat(valor || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Carga el historial de cierres desde el backend y renderiza la tabla
async function cargarHistorial() {
  const token = localStorage.getItem("token");
  if (!token) return (window.location.href = "login.html");

  try {
    const res = await fetch(`${API_URL}/historial-cierres`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Error al obtener el historial.");

    const cierres = await res.json();
    renderizarTabla(cierres);
    calcularKPIs(cierres);
  } catch (err) {
    console.error(err);
    document.getElementById("tabla-cierres").innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-danger">
          <i class="fas fa-exclamation-circle fa-2x mb-2"></i>
          <p class="mb-0">${err.message}</p>
        </td>
      </tr>`;
  }
}

// Renderiza las filas de la tabla principal
function renderizarTabla(cierres) {
  const tbody = document.getElementById("tabla-cierres");

  if (cierres.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="text-center py-5">
            <i class="fas fa-archive fa-3x text-muted opacity-25 mb-3"></i>
            <h6 class="text-muted">No hay cierres registrados aún</h6>
            <p class="text-muted small mb-0">Realice un Cierre Z desde el módulo de Caja para ver el historial aquí.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = cierres
    .map((c, index) => {
      const utilidadColor =
        parseFloat(c.utilidad_neta) >= 0 ? "text-success" : "text-danger";
      return `
      <tr>
        <td class="ps-4">
          <span class="badge bg-primary bg-opacity-10 text-primary fw-bold">#${c.id}</span>
        </td>
        <td><i class="fas fa-calendar-alt me-1 text-muted"></i>${c.fecha}</td>
        <td><i class="fas fa-clock me-1 text-muted"></i>${c.hora}</td>
        <td class="text-success fw-semibold">${fmt(c.ingresos_totales)}</td>
        <td class="text-danger">${fmt(c.costo_mercancia)}</td>
        <td class="${utilidadColor} fw-bold">${fmt(c.utilidad_neta)}</td>
        <td>
          <span class="badge bg-secondary bg-opacity-10 text-secondary">
            <i class="fas fa-user me-1"></i>${c.usuario_cierre || "Sistema"}
          </span>
        </td>
        <td class="text-center">
          <button class="btn btn-sm btn-outline-primary" onclick="verDetalleCierre(${c.id})" title="Ver desglose completo">
            <i class="fas fa-search me-1"></i>Ver
          </button>
        </td>
      </tr>`;
    })
    .join("");
}

// Calcula los KPIs de resumen acumulados
function calcularKPIs(cierres) {
  document.getElementById("kpi-total-cierres").textContent = cierres.length;

  const totalIngresos = cierres.reduce(
    (acc, c) => acc + parseFloat(c.ingresos_totales || 0),
    0,
  );
  const totalUtilidad = cierres.reduce(
    (acc, c) => acc + parseFloat(c.utilidad_neta || 0),
    0,
  );

  document.getElementById("kpi-ingresos-totales").textContent =
    fmt(totalIngresos);
  document.getElementById("kpi-utilidad-total").textContent =
    fmt(totalUtilidad);
}

// Abre el modal con el detalle de un cierre específico
async function verDetalleCierre(id) {
  const modal = new bootstrap.Modal(
    document.getElementById("modalDetalleCierre"),
  );
  const bodyEl = document.getElementById("detalle-cierre-body");

  // Mostrar spinner mientras carga
  bodyEl.innerHTML = `<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div><p class="text-muted mt-2">Cargando detalle...</p></div>`;
  modal.show();

  try {
    const token = localStorage.getItem("token");
    const res = await fetch(`${API_URL}/historial-cierres/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("No se pudo cargar el detalle del cierre.");

    const { cierre, desglose_pagos, ventas } = await res.json();

    // Construir HTML del desglose de pagos
    let desgloseHtml = "<p class='text-muted small'>Sin desglose disponible.</p>";
    if (desglose_pagos && desglose_pagos.length > 0) {
      desgloseHtml = desglose_pagos
        .map(
          (p) => `
        <div class="d-flex justify-content-between align-items-center py-1 border-bottom">
          <span class="text-muted"><i class="fas fa-credit-card me-2"></i>${p.metodo_pago}</span>
          <strong>${fmt(p.total)}</strong>
        </div>`,
        )
        .join("");
    }

    // Construir HTML de las ventas incluidas
    let ventasHtml = "<p class='text-muted small'>Sin ventas asociadas.</p>";
    if (ventas && ventas.length > 0) {
      ventasHtml = `
        <div class="table-responsive mt-2">
          <table class="table table-sm table-hover mb-0">
            <thead class="table-light">
              <tr>
                <th>N° Control</th>
                <th>Hora</th>
                <th>Cliente</th>
                <th class="text-end">Total</th>
              </tr>
            </thead>
            <tbody>
              ${ventas
                .map(
                  (v) => `
                <tr>
                  <td><span class="text-primary fw-semibold">#${v.numero_control || v.id}</span></td>
                  <td>${v.hora}</td>
                  <td>${v.cliente || "—"}</td>
                  <td class="text-end text-success">${fmt(v.total)}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`;
    }

    // Renderizar el contenido completo del modal
    bodyEl.innerHTML = `
      <!-- Resumen del cierre -->
      <div class="row g-3 mb-4">
        <div class="col-12">
          <div class="alert alert-light border mb-0">
            <div class="row text-center">
              <div class="col-4">
                <div class="text-muted small">Fecha de Cierre</div>
                <strong>${cierre.fecha_cierre}</strong>
              </div>
              <div class="col-4">
                <div class="text-muted small">Ejecutado por</div>
                <strong>${cierre.usuario_cierre || "Sistema"}</strong>
              </div>
              <div class="col-4">
                <div class="text-muted small">N° Ventas</div>
                <strong>${ventas.length}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Totales financieros -->
      <div class="row g-3 mb-4">
        <div class="col-md-4 text-center">
          <div class="card border-0 bg-success bg-opacity-10 h-100 py-3">
            <div class="text-success small">Ingresos Totales</div>
            <h4 class="text-success fw-bold">${fmt(cierre.ingresos_totales)}</h4>
          </div>
        </div>
        <div class="col-md-4 text-center">
          <div class="card border-0 bg-danger bg-opacity-10 h-100 py-3">
            <div class="text-danger small">Costo Mercancía</div>
            <h4 class="text-danger fw-bold">${fmt(cierre.costo_mercancia)}</h4>
          </div>
        </div>
        <div class="col-md-4 text-center">
          <div class="card border-0 bg-warning bg-opacity-10 h-100 py-3">
            <div class="text-warning small">Utilidad Neta</div>
            <h4 class="text-warning fw-bold">${fmt(cierre.utilidad_neta)}</h4>
          </div>
        </div>
      </div>

      <!-- Desglose de medios de pago -->
      <h6 class="fw-bold mb-2"><i class="fas fa-credit-card me-2 text-primary"></i>Desglose por Medio de Pago</h6>
      <div class="mb-4">${desgloseHtml}</div>

      <!-- Listado de ventas incluidas -->
      <h6 class="fw-bold mb-2"><i class="fas fa-list me-2 text-primary"></i>Ventas del Cierre (${ventas.length})</h6>
      ${ventasHtml}
    `;
  } catch (err) {
    bodyEl.innerHTML = `<div class="alert alert-danger">${err.message}</div>`;
  }
}

// Inicialización al cargar la página
document.addEventListener("DOMContentLoaded", cargarHistorial);
