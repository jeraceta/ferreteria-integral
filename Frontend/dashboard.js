document.addEventListener('DOMContentLoaded', async () => {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    // Personalización de Bienvenida
    if (user && user.nombre) {
        document.getElementById('welcome-message').textContent = `¡Bienvenido, ${user.nombre}!`;
        document.getElementById('user-role-display').textContent = user.rol || 'Usuario';
    }

    document.getElementById('currentDate').textContent = new Date().toLocaleDateString('es-ES', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Cargar todos los datos
    cargarKPIs(token);
    cargarVentasMensuales(token);
    cargarGananciasPorCategoria(token);
    cargarEstadoCaja(token);
    cargarRendimientoVendedores(token);
    cargarInventarioCritico(token);
    cargarMasVendidos(token);
});

// 1. CARGAR KPIs (Ventas día, Ganancia mes, Transacciones, Producto Top)
async function cargarKPIs(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/dashboard-kpis', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        if (result.success) {
            const data = result.data;
            document.getElementById('kpi-ventas-dia').textContent = formatoMoneda(data.ventas_hoy);
            document.getElementById('kpi-ganancias').textContent = formatoMoneda(data.ganancia_estimada_mes);
            document.getElementById('kpi-transacciones').textContent = data.transacciones_hoy;
            document.getElementById('kpi-top-producto').textContent = data.producto_top;
            document.getElementById('kpi-top-producto').title = data.producto_top;
        }
    } catch (error) {
        console.error("Error al cargar KPIs:", error);
    }
}

// 2. TENDENCIA DE VENTAS (HISTOGRAMA 6 MESES)
async function cargarVentasMensuales(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/ventas-mensuales', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        const canvas = document.getElementById('graficoTendencia');
        const emptyState = document.getElementById('empty-tendencia');

        if (result.success && result.data.length > 0) {
            canvas.classList.remove('d-none');
            emptyState.classList.add('d-none');

            const labels = result.data.map(item => item.etiqueta);
            const valores = result.data.map(item => item.total_ventas);

            new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ventas Mensuales ($)',
                        data: valores,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 5,
                        pointBackgroundColor: '#0d6efd'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { callback: v => '$' + v } }
                    }
                }
            });
        } else {
            canvas.classList.add('d-none');
            emptyState.classList.remove('d-none');
        }
    } catch (error) {
        console.error("Error al cargar tendencia:", error);
    }
}

// 3. GANANCIAS POR CATEGORÍA (DOUGHNUT)
async function cargarGananciasPorCategoria(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/ganancias-por-categoria', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        const canvas = document.getElementById('graficoGananciasPorCategoria');
        const emptyState = document.getElementById('empty-ganancias');

        if (result.success && result.data.length > 0) {
            canvas.classList.remove('d-none');
            emptyState.classList.add('d-none');

            const labels = result.data.map(item => item.nombre_categoria);
            const montos = result.data.map(item => item.total_ganancia);

            new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: labels,
                    datasets: [{
                        data: montos,
                        backgroundColor: ['#0d6efd', '#198754', '#ffc107', '#dc3545', '#6610f2', '#fd7e14', '#20c997'],
                        borderWidth: 2,
                        borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right', labels: { boxWidth: 12, font: { size: 10 } } }
                    },
                    cutout: '70%'
                }
            });
        } else {
            canvas.classList.add('d-none');
            emptyState.classList.remove('d-none');
        }
    } catch (error) {
        console.error("Error al cargar ganancias por categoría:", error);
    }
}

// 4. ESTADO DE CAJA (TURNO ACTUAL)
async function cargarEstadoCaja(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/reporte-ganancias', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        if (result.success) {
            const data = result.data;
            // Fondo Inicial fijo $100
            const fondo = 100.00;
            const ventas = parseFloat(data.ingresos_totales || 0);
            const egresos = 0.00; // Por ahora 0

            document.getElementById('caja-fondo-inicial').textContent = formatoMoneda(fondo);
            document.getElementById('caja-total-ventas').textContent = `+${formatoMoneda(ventas)}`;
            document.getElementById('caja-total-egresos').textContent = `-${formatoMoneda(egresos)}`;
            document.getElementById('caja-saldo-esperado').textContent = formatoMoneda(fondo + ventas - egresos);
        }
    } catch (error) {
        console.error("Error al cargar estado de caja:", error);
    }
}

// 5. RENDIMIENTO DE VENDEDORES (RANKING + COMISIÓN 5%)
async function cargarRendimientoVendedores(token) {
    try {
        const hoy = new Date();
        const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().split('T')[0];
        const finMes = hoy.toISOString().split('T')[0];

        const resp = await fetch(`http://localhost:3000/api/inventario/ventas-por-vendedor?fechaInicio=${inicioMes}&fechaFin=${finMes}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        const container = document.getElementById('vendedores-container');
        
        if (result.success && result.data.length > 0) {
            let html = "";
            const maxVenta = Math.max(...result.data.map(v => v.total_ventas_brutas));

            result.data.forEach((v, index) => {
                const porcentaje = maxVenta > 0 ? (v.total_ventas_brutas / maxVenta) * 100 : 0;
                const comision = v.total_ventas_brutas * 0.05;

                html += `
                    <div class="d-flex align-items-center mb-3">
                        <div class="me-3 fw-bold text-muted small" style="width: 20px;">${index + 1}</div>
                        <div class="flex-grow-1">
                            <div class="d-flex justify-content-between mb-1">
                                <span class="fw-semibold text-dark small">${v.vendedor}</span>
                                <div class="text-end">
                                    <span class="fw-bold d-block small">${formatoMoneda(v.total_ventas_brutas)}</span>
                                    <span class="text-success extra-small" style="font-size: 0.7rem;">Comisión (5%): ${formatoMoneda(comision)}</span>
                                </div>
                            </div>
                            <div class="progress" style="height: 5px;">
                                <div class="progress-bar bg-primary rounded-pill" role="progressbar" style="width: ${porcentaje}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-user-friends fa-2x text-muted opacity-25 mb-2"></i>
                    <p class="text-muted small mb-0">No hay ventas este mes.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error("Error al cargar vendedores:", error);
    }
}

// 6. INVENTARIO CRÍTICO (TABLA ALERTAS)
async function cargarInventarioCritico(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/inventario-critico', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        const tabla = document.getElementById('tabla-criticos');
        const badge = document.getElementById('badge-critico-count');
        const emptyState = document.getElementById('empty-criticos');
        const tableContainer = document.getElementById('container-criticos-table');

        if (result.success && result.data.length > 0) {
            badge.textContent = result.data.length;
            emptyState.classList.add('d-none');
            tableContainer.classList.remove('d-none');

            let html = "";
            result.data.forEach(prod => {
                html += `
                    <tr>
                        <td class="ps-4">
                            <div class="fw-semibold text-dark">${prod.nombre}</div>
                            <div class="small text-muted">${prod.codigo}</div>
                        </td>
                        <td class="text-danger fw-bold">${prod.stock_actual}</td>
                        <td class="text-muted">${prod.stock_minimo}</td>
                        <td><span class="badge bg-danger bg-opacity-10 text-danger border border-danger border-opacity-25">Stock Crítico</span></td>
                    </tr>
                `;
            });
            tabla.innerHTML = html;
        } else {
            badge.textContent = "0";
            emptyState.classList.remove('d-none');
            tableContainer.classList.add('d-none');
        }
    } catch (error) {
        console.error("Error al cargar stock crítico:", error);
    }
}

// 7. TOP ROTACIÓN (MÁS VENDIDOS)
async function cargarMasVendidos(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/productos-mas-vendidos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        const tabla = document.getElementById('tabla-mas-vendidos');
        const emptyState = document.getElementById('empty-mas-vendidos');

        if (result.success && result.data.length > 0) {
            emptyState.classList.add('d-none');
            let html = "";
            result.data.forEach(prod => {
                html += `
                    <tr>
                        <td class="ps-4">
                            <div class="fw-semibold text-dark small">${prod.producto}</div>
                            <div class="text-muted extra-small" style="font-size: 0.7rem;">${prod.codigo}</div>
                        </td>
                        <td class="fw-bold small">${prod.cantidad_vendida}</td>
                        <td class="text-primary small">${formatoMoneda(prod.total_generado)}</td>
                    </tr>
                `;
            });
            tabla.innerHTML = html;
        } else {
            emptyState.classList.remove('d-none');
        }
    } catch (error) {
        console.error("Error al cargar más vendidos:", error);
    }
}

function formatoMoneda(valor) {
    return '$' + parseFloat(valor || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}