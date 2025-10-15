-- Reset de datos al estado inicial (MVP)
-- Vacía las tablas, reinicia secuencias globales y repuebla datos de ejemplo

BEGIN;

-- 1) Vaciar datos (con CASCADE) y reiniciar identidades
TRUNCATE TABLE 
  distribution_plan_order,
  distribution_plan,
  fulfillment,
  purchase_item,
  purchase_order,
  sale_item,
  sale_order,
  shopping_cart,
  offer,
  product,
  supplier,
  customer,
  admin,
  coordinator,
  driver,
  app_user
RESTART IDENTITY CASCADE;

-- 2) Reiniciar secuencias globales (si existen)
ALTER SEQUENCE IF EXISTS sale_order_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS purchase_order_seq RESTART WITH 1;
ALTER SEQUENCE IF EXISTS distribution_plan_seq RESTART WITH 1;

-- 3) Repoblar datos de ejemplo

-- Usuarios
INSERT INTO app_user (email, password_hash, role) VALUES
('admin@jepri.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'admin'),
('operador@jepri.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'operator'),
('proveedor1@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'supplier'),
('proveedor2@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'supplier'),
('cliente1@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'customer'),
('cliente2@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'customer');

-- Proveedores
INSERT INTO supplier (name, contact, phone) VALUES
('Frutas y Verduras El Campesino', 'Carlos Martínez', '3001234567'),
('Plaza Bazurto - Puesto 45', 'Ana Rodríguez', '3009876543'),
('Distribuidora La Cosecha', 'Juan Pérez', '3156789012'),
('Mercado Central - Local 12', 'María González', '3207654321'),
('Agroventas del Caribe', 'Luis Hernández', '3108765432');

-- Clientes
INSERT INTO customer (name, contact, phone) VALUES
('Restaurante El Buen Sabor', 'Pedro Gómez', '3112345678'),
('Cafetería Central', 'Laura Díaz', '3223456789'),
('Hotel Caribe Real', 'Roberto Sánchez', '3134567890'),
('Restaurante La Parrilla', 'Carmen Jiménez', '3045678901'),
('Comidas Rápidas El Muelle', 'Javier Torres', '3156789012');

-- Asignar usuarios a proveedores (por email)
UPDATE supplier 
SET user_id = (SELECT id FROM app_user WHERE email = 'proveedor1@ejemplo.com')
WHERE name = 'Frutas y Verduras El Campesino';

UPDATE supplier 
SET user_id = (SELECT id FROM app_user WHERE email = 'proveedor2@ejemplo.com')
WHERE name = 'Plaza Bazurto - Puesto 45';

-- Asignar usuarios a clientes (por email)
UPDATE customer 
SET user_id = (SELECT id FROM app_user WHERE email = 'cliente1@ejemplo.com')
WHERE name = 'Restaurante El Buen Sabor';

UPDATE customer 
SET user_id = (SELECT id FROM app_user WHERE email = 'cliente2@ejemplo.com')
WHERE name = 'Cafetería Central';

-- Productos
INSERT INTO product (name, description, unit, reference_price, main_photo) VALUES
('Tomate', 'Tomate fresco de la región', 'kg', 4500, 'https://images.unsplash.com/photo-1607305387299-a3d9611cd469?w=300&auto=format&fit=crop'),
('Cebolla', 'Cebolla cabezona blanca', 'kg', 3800, 'https://images.unsplash.com/photo-1580201092675-a0a6a6cafbb1?w=300&auto=format&fit=crop'),
('Papa', 'Papa pastusa', 'kg', 2500, 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=300&auto=format&fit=crop'),
('Zanahoria', 'Zanahoria fresca', 'kg', 2200, 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=300&auto=format&fit=crop'),
('Plátano', 'Plátano verde', 'kg', 2800, 'https://images.unsplash.com/photo-1603833665858-e61d17a86224?w=300&auto=format&fit=crop'),
('Yuca', 'Yuca fresca', 'kg', 2000, 'https://images.unsplash.com/photo-1598512752271-33f913a5af13?w=300&auto=format&fit=crop'),
('Lechuga', 'Lechuga crespa', 'kg', 3500, 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=300&auto=format&fit=crop'),
('Cilantro', 'Cilantro fresco', 'atado', 1500, 'https://images.unsplash.com/photo-1600512264242-a0811d093856?w=300&auto=format&fit=crop'),
('Ajo', 'Ajo importado', 'kg', 12000, 'https://images.unsplash.com/photo-1615477550927-6ec8445fcf2d?w=300&auto=format&fit=crop'),
('Pimentón', 'Pimentón rojo', 'kg', 4200, 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=300&auto=format&fit=crop');

-- Ofertas (relación producto-proveedor)
INSERT INTO offer (product_id, supplier_id, price, available) VALUES
((SELECT id FROM product WHERE name = 'Tomate'), (SELECT id FROM supplier WHERE name = 'Frutas y Verduras El Campesino'), 4200, true),
((SELECT id FROM product WHERE name = 'Cebolla'), (SELECT id FROM supplier WHERE name = 'Frutas y Verduras El Campesino'), 3500, true),
((SELECT id FROM product WHERE name = 'Papa'), (SELECT id FROM supplier WHERE name = 'Frutas y Verduras El Campesino'), 2300, true),
((SELECT id FROM product WHERE name = 'Zanahoria'), (SELECT id FROM supplier WHERE name = 'Frutas y Verduras El Campesino'), 2000, true),
((SELECT id FROM product WHERE name = 'Tomate'), (SELECT id FROM supplier WHERE name = 'Plaza Bazurto - Puesto 45'), 4300, true),
((SELECT id FROM product WHERE name = 'Plátano'), (SELECT id FROM supplier WHERE name = 'Plaza Bazurto - Puesto 45'), 2600, true),
((SELECT id FROM product WHERE name = 'Yuca'), (SELECT id FROM supplier WHERE name = 'Plaza Bazurto - Puesto 45'), 1800, true),
((SELECT id FROM product WHERE name = 'Lechuga'), (SELECT id FROM supplier WHERE name = 'Distribuidora La Cosecha'), 3300, true),
((SELECT id FROM product WHERE name = 'Cilantro'), (SELECT id FROM supplier WHERE name = 'Distribuidora La Cosecha'), 1300, true),
((SELECT id FROM product WHERE name = 'Ajo'), (SELECT id FROM supplier WHERE name = 'Mercado Central - Local 12'), 11500, true),
((SELECT id FROM product WHERE name = 'Pimentón'), (SELECT id FROM supplier WHERE name = 'Mercado Central - Local 12'), 4000, true),
((SELECT id FROM product WHERE name = 'Tomate'), (SELECT id FROM supplier WHERE name = 'Agroventas del Caribe'), 4400, true),
((SELECT id FROM product WHERE name = 'Cebolla'), (SELECT id FROM supplier WHERE name = 'Agroventas del Caribe'), 3700, true);

COMMIT;

-- Nota: Este script asume que el esquema (tipos, tablas, triggers y secuencias)
-- ya está creado. Si necesitas resetear también el esquema completo, avísame
-- y preparo un script que haga DROP/CREATE de todo con la versión actual.