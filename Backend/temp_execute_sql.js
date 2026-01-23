const fs = require('fs').promises;
const mysql = require('mysql2/promise');
require('dotenv').config();

async function executeSql() {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true
    });

    const sql = await fs.readFile('add_payment_fields.sql', 'utf-8');
    await connection.query(sql);
    console.log('Database schema updated successfully with payment fields.');
  } catch (error) {
    console.error('Error updating database schema:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

executeSql();