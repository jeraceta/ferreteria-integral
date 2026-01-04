document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    
    if (!token) {
        alert("No hay token detectado. Por favor, inicia sesión.");
        return;
    }

    // Ejecutamos la carga de datos reales
    await cargarInventarioCritico(token);
    await cargarGraficoVentas(token);
    await cargarGananciasPorCategoria(token);
});

async function cargarGananciasPorCategoria(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/ganancias-por-categoria', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        if (result.success && result.data.length > 0) {
            const labels = result.data.map(item => item.nombre_categoria);
            const ganancias = result.data.map(item => parseFloat(item.total_ganancia));
            const ctx = document.getElementById('graficoGananciasPorCategoria').getContext('2d');
 // Si ya existe un gráfico, destrúyelo antes de crear uno nuevo
            if (window.miGraficoGanancias) { window.miGraficoGanancias.destroy(); }

            window.miGraficoGanancias = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ganancias por Categoría ($)',
                        data: ganancias,
                        backgroundColor: [
                            'rgba(255, 99, 132, 0.6)',
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(153, 102, 255, 0.6)',
                            'rgba(255, 159, 64, 0.6)'
                        ],
                        borderColor: [
                            'rgba(255, 99, 132, 1)',
                            'rgba(54, 162, 235, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(75, 192, 192, 1)',
                            'rgba(153, 102, 255, 1)',
                            'rgba(255, 159, 64, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Ganancias por Categoría'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Ganancia ($)'
                            }
                        }
                    }
                }
            });
        } else {
            console.warn("No se recibieron datos de ganancias por categoría o la respuesta no fue exitosa.");
        }
    } catch (error) {
        console.error("Error al cargar las ganancias por categoría:", error);
    }
}

async function cargarInventarioCritico(token) {
    try {
        // CORRECCIÓN: La ruta real en tu servidor es /api/inventario/inventario-critico
        const resp = await fetch('http://localhost:3000/api/inventario/inventario-critico', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();
        
        if (data.success) {
            // Actualizamos el número en la tarjeta roja
            document.getElementById('cant-critica').innerText = `${data.data.length} productos`;

            // LLENADO DE LA TABLA:
            const tabla = document.getElementById('tabla-criticos');
            tabla.innerHTML = ""; // Limpiamos la tabla antes de llenar

            data.data.forEach(prod => {
                tabla.innerHTML += `
                    <tr>
                        <td>${prod.nombre}</td>
                        <td class="text-danger fw-bold">${prod.stock_actual}</td>
                        <td>${prod.stock_minimo}</td>
                        <td><span class="badge bg-danger">Reponer Urgente</span></td>
                    </tr>
                `;
            });
        }
    } catch (error) {
        console.error("Error en inventario:", error);
    }
}
async function cargarGraficoVentas(token) {
    try {
        const resp = await fetch('http://localhost:3000/api/inventario/ventas-metodo-pago', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await resp.json();

        console.log("Datos recibidos del servidor:", result); // REVISA ESTO EN F12

        if (result.success && result.data.length > 0) {
            // Buscamos dinámicamente el nombre del método y el monto
            const labels = result.data.map(item => item.metodo_pago || item.metodo || "Venta");
            const montos = result.data.map(item => parseFloat(item.total_recaudado || item.total || item.monto || 0));

            const ctx = document.getElementById('graficoVentas').getContext('2d');
            if (window.miGrafico) { window.miGrafico.destroy(); }

            window.miGrafico = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Ventas Reales ($)',
                        data: montos,
                        backgroundColor: ['#28a745', '#007bff', '#ffc107', '#17a2b8'],
                        borderWidth: 1
                    }]
                },
                options: { scales: { y: { beginAtZero: true } } }
            });
        }
    } catch (error) {
        console.error("Error crítico en gráfico:", error);
    }
}