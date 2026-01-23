const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Función para hacer peticiones HTTP
function hacerPeticion(opciones) {
  return new Promise((resolve, reject) => {
    const req = http.request(opciones, (res) => {
      let data = [];
      res.on('data', (chunk) => {
        data.push(chunk);
      });
      res.on('end', () => {
        resolve({ status: res.statusCode, data: Buffer.concat(data) });
      });
    });
    req.on('error', (error) => {
      reject(error);
    });
    req.end();
  });
}

// Función para obtener la última venta
async function obtenerUltimaVenta() {
  console.log('\n🔍 Obteniendo la última venta...');
  const opciones = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/ventas',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  try {
    const resultado = await hacerPeticion(opciones);
    if (resultado.status === 200) {
      const ventas = JSON.parse(resultado.data.toString());
      if (ventas.length > 0) {
        console.log(`✅ Venta más reciente encontrada con ID: ${ventas[0].id}`);
        return ventas[0].id;
      } else {
        console.log('❌ No se encontraron ventas.');
        return null;
      }
    } else {
      console.log('❌ Error obteniendo ventas:', resultado.status);
      return null;
    }
  } catch (error) {
    console.error('❌ Error de conexión:', error.message);
    return null;
  }
}


// Función para generar el reporte de una venta
async function generarReporte(idVenta) {
  console.log(`\n📄 Generando reporte para la venta ID ${idVenta}...`);

  const opciones = {
    hostname: 'localhost',
    port: 3000,
    path: `/api/ventas/reporte/${idVenta}`,
    method: 'GET',
  };

  try {
    const resultado = await hacerPeticion(opciones);

    if (resultado.status === 200) {
      const filePath = path.join(__dirname, `reporte_venta_${idVenta}.pdf`);
      fs.writeFileSync(filePath, resultado.data);
      console.log(`✅ Reporte guardado en: ${filePath}`);
    } else {
      console.log('❌ Error al generar el reporte:', resultado.status);
      try {
        const errorData = JSON.parse(resultado.data.toString());
        console.error('   Detalles:', errorData);
      } catch (e) {
        console.error('   No se pudo parsear el error.');
      }
    }
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
  }
}

// Ejecutar pruebas
async function ejecutarPruebas() {
  const idVenta = await obtenerUltimaVenta();
  if (idVenta) {
    await generarReporte(idVenta);
  }
}

ejecutarPruebas();
