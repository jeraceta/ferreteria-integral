const mysql = require('mysql2/promise');
require('dotenv').config();

async function addEmailColumn() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ferreteria'
  });

  try {
    console.log('Adding email column to empresa_datos...');
    await connection.execute('ALTER TABLE empresa_datos ADD COLUMN email VARCHAR(255) DEFAULT "info@empresa.com"');
    console.log('Column added successfully.');
  } catch (error) {
    if (error.code === 'ER_DUP_COLUMN_NAME') {
      console.log('Column already exists.');
    } else {
      console.error('Error adding column:', error);
    }
  } finally {
    await connection.end();
  }
}

addEmailColumn();
