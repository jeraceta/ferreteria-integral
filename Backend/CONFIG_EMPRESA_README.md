# 📋 CONFIGURACIÓN DE DATOS DE LA EMPRESA

¡Hola! Aquí te explicamos cómo cambiar los datos de tu ferretería en todo el sistema.

## 🎯 ¿Dónde están los datos?

Los datos de la empresa están centralizados en un solo archivo:

```
Backend/config/empresa.js
```

## 🔄 ¿Cómo cambiar los datos?

### Opción 1: Edición Manual (Recomendada para principiantes)

1. **Abre el archivo:** `Backend/config/empresa.js`
2. **Modifica los valores** que necesites cambiar:

```javascript
const EMPRESA_CONFIG = {
  nombre: "TU FERRETERÍA, C.A.", // ← Cambia aquí
  rif: "J-12345678-9", // ← Cambia aquí
  direccion: "Tu dirección real", // ← Cambia aquí
  telefono: "0212-1234567", // ← Cambia aquí
  email: "tu-email@ferreteria.com", // ← Cambia aquí
  // ... otros campos
};
```

3. **Guarda el archivo**
4. **Reinicia el servidor:**
   ```bash
   cd Backend
   npm run dev
   ```

### Opción 2: Script Automático (Más fácil)

1. **Edita el script:** `Backend/actualizar-empresa.js`
2. **Modifica los valores** en la sección `empresaData`
3. **Ejecuta el script:**
   ```bash
   cd Backend
   node actualizar-empresa.js
   ```
4. **Reinicia el servidor**

## 📄 ¿En qué se usan estos datos?

Los datos de la empresa aparecen en:

- ✅ **PDFs de Ajustes de Inventario**
- ✅ **PDFs de Ventas**
- ✅ **PDFs de Compras**
- ✅ **PDFs de Reportes de Clientes**
- ✅ **PDFs de Reportes de Proveedores**
- ✅ **PDFs de Presupuestos**
- ✅ **PDFs de Tesorería**
- ✅ **Reportes Excel**
- ✅ **Cualquier documento oficial**

## 🎉 ¡Listo!

Después de cambiar los datos y reiniciar el servidor, todos los PDFs y reportes usarán la nueva información de tu empresa.

## 📞 ¿Necesitas ayuda?

Si tienes dudas, revisa los comentarios en el código - están explicados paso a paso como si fueras un aprendiz entusiasta. 🚀
