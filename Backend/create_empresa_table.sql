-- Crear tabla para datos de empresa
CREATE TABLE IF NOT EXISTS empresa_datos (
    id INT PRIMARY KEY AUTO_INCREMENT,
    razon_social VARCHAR(255) NOT NULL,
    rif VARCHAR(50) NOT NULL,
    direccion TEXT,
    telefono VARCHAR(50),
    logo_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertar datos por defecto si no existen
INSERT IGNORE INTO empresa_datos (id, razon_social, rif, direccion, telefono)
VALUES (1, 'FERRETERIA XYZ, C.A.', 'J-12345678-9', 'Av. Principal, Local 1, Ciudad, Estado', '0212-1234567');