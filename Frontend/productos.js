// Espera a que todo el contenido del DOM (la página web) se haya cargado completamente antes de ejecutar el script.
document.addEventListener('DOMContentLoaded', () => {
    
    // --- CONFIGURACIÓN Y URLs ---
    // Define la URL base para las peticiones a la API.
    const API_BASE_URL = 'http://localhost:3000/api/productos';

    // --- ELEMENTOS DEL DOM ---
    // Obtiene referencias a los elementos HTML con los que vamos a interactuar.
    const tablaProductos = document.getElementById('tablaProductos');
    const inputBuscarProducto = document.getElementById('inputBuscarProducto');
    const btnNuevoProducto = document.getElementById('btnNuevoProducto');
    const modalProducto = new bootstrap.Modal(document.getElementById('modalProducto'));
    const formProducto = document.getElementById('formProducto');
    const modalProductoLabel = document.getElementById('modalProductoLabel');
    const btnAnadirCategoria = document.getElementById('btnAnadirCategoria');


    // Campos del formulario dentro del modal.
    const productoId = document.getElementById('productoId');
    const codigo = document.getElementById('codigo');
    const nombre = document.getElementById('nombre');
    const descripcion = document.getElementById('descripcion');
    const selectCategoria = document.getElementById('selectCategoria');
    const precioCosto = document.getElementById('precioCosto');
    const precioVenta = document.getElementById('precioVenta');
    const stockActual = document.getElementById('stockActual');
    const margenPorcentaje = document.getElementById('margenPorcentaje');

    // --- LÓGICA DE CÁLCULO DE PRECIOS ---

    const calcularVenta = () => {
        const costo = parseFloat(precioCosto.value);
        const margen = parseFloat(margenPorcentaje.value);
        if (!isNaN(costo) && !isNaN(margen)) {
            const venta = costo * (1 + margen / 100);
            precioVenta.value = venta.toFixed(2);
        }
    };

    const calcularMargen = () => {
        const costo = parseFloat(precioCosto.value);
        const venta = parseFloat(precioVenta.value);
        if (!isNaN(costo) && !isNaN(venta) && costo > 0) {
            const margen = ((venta / costo) - 1) * 100;
            margenPorcentaje.value = margen.toFixed(2);
        } else if (costo === 0 && venta > 0) {
            margenPorcentaje.value = ''; // O se podría mostrar infinito
        }
    };

    precioCosto.addEventListener('input', calcularVenta);
    margenPorcentaje.addEventListener('input', calcularVenta);
    precioVenta.addEventListener('input', calcularMargen);


    // --- ESTADO DE LA APLICACIÓN ---
    // Almacena la lista de productos y categorías cargadas desde el backend.
    let productos = [];
    let categorias = [];


    // --- FUNCIONES AUXILIARES ---
    
    /**
     * Obtiene el token de autenticación guardado en el localStorage del navegador.
     * @returns {string|null} El token si existe, o null si no.
     */
    const getToken = () => {
        return localStorage.getItem('token');
    };

    /**
     * Muestra una notificación usando SweetAlert2.
     * @param {string} title - El título de la alerta.
     * @param {string} message - El mensaje a mostrar.
     * @param {string} icon - 'success', 'error', 'warning', 'info'.
     */
    const showAlert = (title, message, icon) => {
        Swal.fire({
            title: title,
            text: message,
            icon: icon,
            timer: icon === 'success' ? 2000 : 4000,
            timerProgressBar: true,
            confirmButtonColor: '#0d6efd'
        });
    };

    // --- FUNCIONES PRINCIPALES ---

    /**
     * 1. Carga los productos desde el backend y los muestra en la tabla.
     */
    const cargarProductos = async () => {
        tablaProductos.innerHTML = '<tr><td colspan="9" class="text-center">Cargando productos...</td></tr>';
        try {
            const token = getToken();
            if (!token) {
                showAlert('Error de autenticación', 'No se encontró token. Por favor, inicie sesión de nuevo.', 'error');
                return;
            }

            const response = await fetch(`${API_BASE_URL}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                 showAlert('Sesión Expirada', 'Su sesión ha expirado. Por favor, inicie sesión de nuevo.', 'warning');
                 // Opcional: Redirigir al login: window.location.href = '/login.html';
                return;
            }
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            productos = await response.json();
            mostrarProductos(productos);

        } catch (error) {
            console.error('Error al cargar productos:', error);
            showAlert('Error', 'No se pudieron cargar los productos.', 'error');
            tablaProductos.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error al cargar productos.</td></tr>';
        }
    };

    /**
     * 2. Renderiza los productos en la tabla HTML.
     * @param {Array} productosAMostrar - El array de productos que se van a mostrar.
     */
    const mostrarProductos = (productosAMostrar) => {
        tablaProductos.innerHTML = '';
        if (productosAMostrar.length === 0) {
            tablaProductos.innerHTML = '<tr><td colspan="9" class="text-center">No hay productos para mostrar.</td></tr>';
            return;
        }

        productosAMostrar.forEach(producto => {
            const row = tablaProductos.insertRow();
            row.innerHTML = `
                <td>${producto.id}</td>
                <td>${producto.codigo}</td>
                <td>${producto.nombre}</td>
                <td>${producto.descripcion || ''}</td>
                <td>${producto.nombre_categoria || 'Sin categoría'}</td>
                <td>$${Number(producto.precio_venta || 0).toFixed(2)}</td>
                <td>${producto.stock_actual || 0}</td>
                <td class="columna-acciones">
                    <button class="btn btn-warning btn-sm btn-edit" data-id="${producto.id}">Editar</button>
                    <button class="btn btn-danger btn-sm btn-delete" data-id="${producto.id}">Eliminar</button>
                </td>
            `;
        });
        
        // Asignar eventos a los botones de editar y eliminar
        document.querySelectorAll('.btn-edit').forEach(button => {
            button.addEventListener('click', (e) => editarProducto(e.target.dataset.id));
        });

        document.querySelectorAll('.btn-delete').forEach(button => {
            button.addEventListener('click', (e) => eliminarProducto(e.target.dataset.id));
        });
    };

    /**
     * 3. Carga las categorías desde el backend y las puebla en el menú desplegable (select).
     *    También actualiza el array local 'categorias'.
     */
    const cargarCategorias = async () => {
        try {
            const token = getToken();
            if (!token) return;

            const response = await fetch(`${API_BASE_URL}/categorias`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            // Actualizar el estado local y el dropdown
            categorias = await response.json();
            
            const selectedValue = selectCategoria.value; // Guardar valor seleccionado
            selectCategoria.innerHTML = '<option value="">Seleccione una categoría</option>';
            
            categorias.forEach(categoria => {
                const option = document.createElement('option');
                option.value = categoria.id;
                option.textContent = categoria.nombre;
                selectCategoria.appendChild(option);
            });
            selectCategoria.value = selectedValue; // Restaurar valor si aún existe
        } catch (error) {
            console.error('Error al cargar categorías:', error);
            showAlert('Error', 'No se pudieron cargar las categorías.', 'error');
        }
    };

    /**
     * 4. Abre un prompt para añadir una nueva categoría y la envía al backend.
     */
    const anadirNuevaCategoria = async () => {
        const { value: nombreCategoria } = await Swal.fire({
            title: 'Nueva Categoría',
            input: 'text',
            inputLabel: 'Nombre de la nueva categoría',
            inputPlaceholder: 'Ej: Herramientas Manuales',
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputValidator: (value) => {
                if (!value) {
                    return '¡Necesitas escribir un nombre!';
                }
            }
        });

        if (nombreCategoria) {
            const nombreNormalizado = nombreCategoria.trim();
            // Verificación local primero
            if (categorias.some(cat => cat.nombre.toLowerCase() === nombreNormalizado.toLowerCase())) {
                showAlert('Error', `La categoría "${nombreNormalizado}" ya existe.`, 'warning');
                return;
            }

            // Si no existe localmente, intentar crearla en el backend
            try {
                const token = getToken();
                const response = await fetch(`${API_BASE_URL}/categorias`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ nombre: nombreNormalizado })
                });

                const resultado = await response.json();

                if (!response.ok) {
                    // El backend también valida, mostramos su error
                    throw new Error(resultado.error || 'Error del servidor');
                }
                
                showAlert('Éxito', `Categoría "${resultado.categoria.nombre}" creada.`, 'success');
                
                // Recargar las categorías y seleccionar la nueva
                await cargarCategorias();
                selectCategoria.value = resultado.categoria.id;

            } catch (error) {
                console.error('Error al crear categoría:', error);
                showAlert('Error', error.message, 'error');
            }
        }
    };
    
    /**
     * 5. Abre el modal para crear un nuevo producto.
     */
    btnNuevoProducto.addEventListener('click', () => {
        formProducto.reset();
        productoId.value = '';
        modalProductoLabel.textContent = 'Crear Nuevo Producto';
        margenPorcentaje.value = 50; // Establecer margen por defecto
        cargarCategorias();
        modalProducto.show();
    });

    /**
     * 6. Obtiene los datos de un producto por ID y los muestra en el modal para editarlos.
     * @param {number} id - El ID del producto a editar.
     */
    const editarProducto = async (id) => {
        try {
            const token = getToken();
            const response = await fetch(`${API_BASE_URL}/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('No se pudo cargar el producto.');

            const producto = await response.json();
            
            productoId.value = producto.id;
            codigo.value = producto.codigo;
            nombre.value = producto.nombre;
            descripcion.value = producto.descripcion;
            precioCosto.value = producto.precio_costo;
            precioVenta.value = producto.precio_venta;
            stockActual.value = producto.stock_actual || 0; // Asumir 0 si es null

            calcularMargen(); // Calcular y mostrar el margen

            await cargarCategorias();
            selectCategoria.value = producto.id_categoria;

            modalProductoLabel.textContent = 'Editar Producto';
            modalProducto.show();

        } catch (error) {
            console.error('Error al cargar datos para edición:', error);
            showAlert('Error', 'No se pudieron cargar los datos del producto.', 'error');
        }
    };

    /**
     * 7. Elimina un producto por su ID, con confirmación.
     * @param {number} id - El ID del producto a eliminar.
     */
    const eliminarProducto = async (id) => {
        const confirmacion = await Swal.fire({
            title: '¿Estás seguro?',
            text: "¡No podrás revertir esta acción!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, ¡eliminar!',
            cancelButtonText: 'Cancelar'
        });

        if (confirmacion.isConfirmed) {
            try {
                const token = getToken();
                const response = await fetch(`${API_BASE_URL}/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await response.json();

                if (!response.ok) throw new Error(data.error || 'Error desconocido.');

                showAlert('Eliminado', data.message || 'El producto ha sido eliminado.', 'success');
                cargarProductos();
            } catch (error) {
                console.error('Error al eliminar producto:', error);
                showAlert('Error', error.message, 'error');
            }
        }
    };

    /**
     * 8. Maneja el envío del formulario para crear o actualizar un producto.
     */
    formProducto.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = productoId.value;
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_BASE_URL}/${id}` : API_BASE_URL;

        const productoData = {
            codigo: codigo.value,
            nombre: nombre.value,
            descripcion: descripcion.value,
            stock: parseInt(stockActual.value),
            precio_costo: parseFloat(precioCosto.value),
            precio_venta: parseFloat(precioVenta.value),
            id_categoria: parseInt(selectCategoria.value)
        };

        try {
            const token = getToken();
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(productoData)
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Error al guardar.');

            showAlert('Guardado', 'Producto guardado exitosamente.', 'success');
            modalProducto.hide();
            cargarProductos();
        } catch (error) {
            console.error('Error al guardar producto:', error);
            showAlert('Error', error.message, 'error');
        }
    });

    /**
     * 9. Filtra los productos en tiempo real según el texto introducido en el campo de búsqueda.
     */
    inputBuscarProducto.addEventListener('keyup', () => {
        const searchTerm = inputBuscarProducto.value.toLowerCase();
        const productosFiltrados = productos.filter(p => 
            (p.nombre?.toLowerCase() || '').includes(searchTerm) ||
            (p.nombre_categoria?.toLowerCase() || '').includes(searchTerm)
        );
        mostrarProductos(productosFiltrados);
    });

    /**
     * 10. Asigna el evento al botón de añadir categoría.
     */
    btnAnadirCategoria.addEventListener('click', anadirNuevaCategoria);


    // --- MODO CLIENTE ---
    const modoClienteSwitch = document.getElementById('modoClienteSwitch');
    modoClienteSwitch.addEventListener('change', () => {
        document.body.classList.toggle('modo-cliente-activo');
    });


    // --- INICIALIZACIÓN ---
    // Llama a estas funciones cuando la página se carga por primera vez.
    cargarProductos();
    cargarCategorias();
});