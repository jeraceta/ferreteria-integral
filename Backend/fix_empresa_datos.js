const fs = require('fs');
const path = require('path');

const controllersDir = path.join(__dirname, 'controllers');

const files = fs.readdirSync(controllersDir).filter(f => f.endsWith('.controller.js'));

for (const file of files) {
  const filePath = path.join(controllersDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  if (content.includes("SELECT nombre, rif, direccion, telefono FROM empresa_datos WHERE id = 1")) {
    content = content.replace(
      /SELECT nombre, rif, direccion, telefono FROM empresa_datos WHERE id = 1/g,
      "SELECT razon_social AS nombre, rif, direccion, telefono FROM empresa_datos WHERE id = 1"
    );
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
console.log('All files updated successfully!');
