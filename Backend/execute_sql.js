const fs = require("fs").promises;
const mysql = require("mysql2/promise");
require("dotenv").config();

async function executeSql(filename = "update_schema.sql") {
  let connection;
  try {
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      multipleStatements: true,
    });

    const sql = await fs.readFile(filename, "utf-8");
    await connection.query(sql);
    console.log("Database schema updated successfully.");
  } catch (error) {
    console.error("Error updating database schema:", error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Tomar el nombre del archivo desde los argumentos de línea de comandos
const filename = process.argv[2] || "update_schema.sql";
executeSql(filename);
