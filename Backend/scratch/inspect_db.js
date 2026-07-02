const { query } = require('../database');

async function inspect() {
  try {
    const tables = await query('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Tables in database:', tableNames);
    
    const users = await query('SELECT id, username, nombre, rol FROM usuarios');
    console.log('Users in database:', users);
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

inspect();
