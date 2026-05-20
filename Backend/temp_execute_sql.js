const fs = require('fs');
const pool = require('./db.js');

async function run() {
  try {
    const content = fs.readFileSync('db_tesoreria.sql', 'utf8');
    const queries = content.split(';').filter(q => q.trim());
    for (let query of queries) {
      console.log('Running query:', query);
      await pool.query(query);
    }
    console.log("Tablas de Tesoreria creadas exitosamente");
    process.exit(0);
  } catch (err) {
    console.error("Error ejecutando sql:", err);
    process.exit(1);
  }
}

run();