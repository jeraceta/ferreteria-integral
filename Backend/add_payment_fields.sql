USE ferreteria;
ALTER TABLE ventas
ADD COLUMN metodo_pago VARCHAR(50) NOT NULL DEFAULT 'Efectivo',
ADD COLUMN referencia VARCHAR(100);
