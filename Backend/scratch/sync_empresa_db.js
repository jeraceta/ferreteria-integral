const mysql = require('mysql2/promise');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { getEmpresaConfig } = require('../config/empresa');

async function syncEmpresa() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ferreteria'
  });

  try {
    const config = getEmpresaConfig();
    console.log('Syncing database with config/empresa.js data...');
    console.log('Data to sync:', config);

    await connection.execute(
      'UPDATE empresa_datos SET razon_social = ?, rif = ?, direccion = ?, telefono = ? WHERE id = 1',
      [config.nombre, config.rif, config.direccion, config.telefono]
    );
    
    console.log('Database updated successfully.');
  } catch (error) {
    console.error('Error syncing database:', error);
  } finally {
    await connection.end();
  }
}

syncEmpresa();
