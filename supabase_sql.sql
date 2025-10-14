CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE unit_type AS ENUM ('lb', 'kg', 'atado');
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'supplier', 'customer');

-- Tabla de usuarios simplificada
CREATE TABLE app_user (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de productos
CREATE TABLE product (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    unit unit_type NOT NULL,
    main_photo TEXT,
    reference_price DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de proveedores
CREATE TABLE supplier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    contact VARCHAR(200),
    phone VARCHAR(20),
    user_id UUID REFERENCES app_user(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de ofertas de proveedores
CREATE TABLE offer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE CASCADE,
    price DECIMAL(12,2) NOT NULL,
    available BOOLEAN DEFAULT true,
    UNIQUE(product_id, supplier_id)
);

-- Tabla de clientes
CREATE TABLE customer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    contact VARCHAR(200),
    phone VARCHAR(20),
    user_id UUID REFERENCES app_user(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de órdenes de venta (a clientes)
CREATE TABLE sale_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer(id),
    order_date TIMESTAMPTZ DEFAULT NOW(),
    delivery_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending',
    service_fee DECIMAL(12,2) DEFAULT 0,
    delivery_charge DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de items de venta
CREATE TABLE sale_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_order_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product(id),
    quantity DECIMAL(12,2) NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    delivered_quantity DECIMAL(12,2),
    delivered_at TIMESTAMPTZ,
    delivered_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de órdenes de compra (a proveedores)
CREATE TABLE purchase_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES supplier(id),
    order_date TIMESTAMPTZ DEFAULT NOW(),
    expected_delivery_date TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'pending',
    total DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de items de compra
CREATE TABLE purchase_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product(id),
    supplier_id UUID NOT NULL REFERENCES supplier(id),
    quantity DECIMAL(12,2) NOT NULL,
    estimated_price DECIMAL(12,2),
    actual_price DECIMAL(12,2),
    received_quantity DECIMAL(12,2),
    received_by UUID,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de cumplimiento (relación entre ventas y compras)
CREATE TABLE fulfillment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_item_id UUID NOT NULL REFERENCES sale_item(id) ON DELETE CASCADE,
    purchase_item_id UUID NOT NULL REFERENCES purchase_item(id) ON DELETE CASCADE,
    quantity DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(sale_item_id, purchase_item_id)
);

-- Tabla de carrito de compras (temporal antes de crear orden)
CREATE TABLE shopping_cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product(id),
    quantity DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vista para calcular el total de las órdenes de venta
CREATE OR REPLACE VIEW sale_order_with_total AS
SELECT 
    so.*,
    COALESCE(SUM(si.quantity * si.unit_price), 0) + so.service_fee + so.delivery_charge AS total
FROM 
    sale_order so
LEFT JOIN 
    sale_item si ON so.id = si.sale_order_id
GROUP BY 
    so.id;

-- Índices para mejorar el rendimiento
CREATE INDEX idx_offer_product ON offer(product_id);
CREATE INDEX idx_offer_supplier ON offer(supplier_id);
CREATE INDEX idx_sale_item_order ON sale_item(sale_order_id);
CREATE INDEX idx_sale_item_product ON sale_item(product_id);
CREATE INDEX idx_purchase_item_order ON purchase_item(purchase_order_id);
CREATE INDEX idx_purchase_item_product ON purchase_item(product_id);
CREATE INDEX idx_purchase_item_supplier ON purchase_item(supplier_id);
CREATE INDEX idx_fulfillment_sale_item ON fulfillment(sale_item_id);
CREATE INDEX idx_fulfillment_purchase_item ON fulfillment(purchase_item_id);
CREATE INDEX idx_shopping_cart_customer ON shopping_cart(customer_id);
CREATE INDEX idx_shopping_cart_product ON shopping_cart(product_id);

-- Índices para consultas por fecha (reportería)
CREATE INDEX idx_purchase_order_date ON purchase_order(order_date);
CREATE INDEX idx_purchase_order_delivery ON purchase_order(expected_delivery_date);
CREATE INDEX idx_sale_order_date ON sale_order(order_date);
CREATE INDEX idx_sale_order_delivery ON sale_order(delivery_date);
CREATE INDEX idx_sale_order_customer ON sale_order(customer_id);

-- Índices para usuarios
CREATE INDEX idx_app_user_role ON app_user(role);
CREATE INDEX idx_app_user_email ON app_user(email);

-- Data de prueba para usuarios
INSERT INTO app_user (email, password_hash, role) VALUES
('admin@jepri.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'admin'),
('operador@jepri.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'operator'),
('proveedor1@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'supplier'),
('proveedor2@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'supplier'),
('cliente1@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'customer'),
('cliente2@ejemplo.com', '$2a$10$rJJEZpxNK5DnM/I23KnOp.I7D0QeFmB9wVdgvFNwvErgZGl7pNIHe', 'customer');

-- Actualizar proveedores con usuarios
UPDATE supplier SET user_id = (SELECT id FROM app_user WHERE email = 'proveedor1@ejemplo.com') WHERE name = 'Frutas y Verduras El Campesino';
UPDATE supplier SET user_id = (SELECT id FROM app_user WHERE email = 'proveedor2@ejemplo.com') WHERE name = 'Plaza Bazurto - Puesto 45';

-- Actualizar clientes con usuarios
UPDATE customer SET user_id = (SELECT id FROM app_user WHERE email = 'cliente1@ejemplo.com') WHERE name = 'Restaurante El Buen Sabor';
UPDATE customer SET user_id = (SELECT id FROM app_user WHERE email = 'cliente2@ejemplo.com') WHERE name = 'Cafetería Central';

-- Data de prueba para proveedores
INSERT INTO supplier (name, contact, phone) VALUES
('Frutas y Verduras El Campesino', 'Carlos Martínez', '3001234567'),
('Plaza Bazurto - Puesto 45', 'Ana Rodríguez', '3009876543'),
('Distribuidora La Cosecha', 'Juan Pérez', '3156789012'),
('Mercado Central - Local 12', 'María González', '3207654321'),
('Agroventas del Caribe', 'Luis Hernández', '3108765432');

-- Data de prueba para clientes
INSERT INTO customer (name, contact, phone) VALUES
('Restaurante El Buen Sabor', 'Pedro Gómez', '3112345678'),
('Cafetería Central', 'Laura Díaz', '3223456789'),
('Hotel Caribe Real', 'Roberto Sánchez', '3134567890'),
('Restaurante La Parrilla', 'Carmen Jiménez', '3045678901'),
('Comidas Rápidas El Muelle', 'Javier Torres', '3156789012');

-- Data de prueba para productos
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

-- Data de prueba para ofertas (relación producto-proveedor)
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