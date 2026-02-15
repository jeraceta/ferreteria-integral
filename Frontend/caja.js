document.addEventListener("DOMContentLoaded", () => {
  const btnReporteX = document.getElementById("btnReporteX");
  const btnReporteZ = document.getElementById("btnReporteZ");
  const API_VENTAS_URL = "http://localhost:3000/api/ventas";

  const getToken = () => localStorage.getItem("token");

  // Función para obtener el reporte X
  const obtenerReporteX = async () => {
    try {
      const response = await fetch(`${API_VENTAS_URL}/reporte-x`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Error al obtener el reporte X");

      generarVentanaImpresion("Reporte X (Lectura Parcial)", result.datos);
    } catch (error) {
      Swal.fire("Error", error.message, "error");
    }
  };

  // Función para ejecutar el cierre Z
  const ejecutarCierreZ = async () => {
    Swal.fire({
      title: "¿Está seguro?",
      text: "Esta acción cerrará la caja y marcará todas las ventas como definitivas. ¡No se puede revertir!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, ¡cerrar caja!",
      cancelButtonText: "Cancelar",
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const response = await fetch(`${API_VENTAS_URL}/cierre-z`, {
            method: "POST",
            headers: { Authorization: `Bearer ${getToken()}` },
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.message || "Error al ejecutar el cierre Z");

          Swal.fire("¡Caja Cerrada!", result.message, "success");
          generarVentanaImpresion(
            "Reporte Z (Cierre Definitivo)",
            result.datos,
          );
        } catch (error) {
          Swal.fire("Error", error.message, "error");
        }
      }
    });
  };

  // Función para generar la ventana de impresión
  const generarVentanaImpresion = (titulo, datos) => {
    const user = JSON.parse(localStorage.getItem("user"));
    const cajero = user ? user.nombre : "No identificado";
    const fecha = new Date().toLocaleString("es-VE");

    let desgloseHtml =
      '<h4>Detalle de Medios de Pago</h4><table class="table table-sm"><tbody>';
    if (datos.desglose_pagos && datos.desglose_pagos.length > 0) {
      datos.desglose_pagos.forEach((pago) => {
        desgloseHtml += `<tr><td>${pago.metodo_pago}</td><td class="text-end">${parseFloat(pago.total).toFixed(2)} $</td></tr>`;
      });
    } else {
      desgloseHtml += '<tr><td colspan="2">No hay desglose de pagos.</td></tr>';
    }
    desgloseHtml += "</tbody></table>";

    const contenido = `
            <html>
                <head>
                    <title>${titulo}</title>
                    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.1.3/dist/css/bootstrap.min.css" rel="stylesheet">
                    <style>
                        body { font-family: sans-serif; padding: 20px; }
                        .report-header { text-align: center; margin-bottom: 30px; }
                        .report-header h2 { margin: 0; }
                        .report-details { margin-bottom: 20px; }
                        .summary-table td { font-size: 1.1rem; }
                        .summary-table .total { font-weight: bold; font-size: 1.2rem; }
                        @media print {
                            .no-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="report-header">
                        <h2>FERRETERÍA - REPORTE DE VENTAS</h2>
                        <p>${titulo}</p>
                    </div>
                    <div class="report-details">
                        <p><strong>Fecha y Hora:</strong> ${fecha}</p>
                        <p><strong>Cajero:</strong> ${cajero}</p>
                    </div>

                    <h4>Resumen General</h4>
                    <table class="table summary-table">
                        <tbody>
                            <tr>
                                <td>Total Ventas (Ingresos)</td>
                                <td class="text-end">${parseFloat(datos.ingresos_totales).toFixed(2)} $</td>
                            </tr>
                            <tr>
                                <td>Costo de Mercancía</td>
                                <td class="text-end">${parseFloat(datos.costo_total_mercancia).toFixed(2)} $</td>
                            </tr>
                            <tr class="table-success total">
                                <td>Utilidad Neta</td>
                                <td class="text-end">${parseFloat(datos.utilidad_neta).toFixed(2)} $</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <hr>

                    ${desgloseHtml}

                    <div class="text-center mt-4 no-print">
                        <button class="btn btn-primary" onclick="window.print()">Imprimir</button>
                        <button class="btn btn-secondary" onclick="window.close()">Cerrar</button>
                    </div>
                </body>
            </html>
        `;

    const ventana = window.open("", "_blank", "width=800,height=600");
    ventana.document.write(contenido);
    ventana.document.close();
  };

  btnReporteX.addEventListener("click", obtenerReporteX);
  btnReporteZ.addEventListener("click", ejecutarCierreZ);
});
