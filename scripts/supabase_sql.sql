CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE unit_type AS ENUM ('lb', 'kg', 'atado');
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'supplier', 'customer');
-- Estados de órdenes
CREATE TYPE sale_order_status AS ENUM ('pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled');
CREATE TYPE purchase_order_status AS ENUM ('created', 'accepted', 'delivered', 'cancelled', 'rejected');

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
    status sale_order_status NOT NULL DEFAULT 'pending',
    service_fee DECIMAL(12,2) DEFAULT 0,
    delivery_charge DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Identificador humano: número secuencial global (ej: 000123)
    order_seq INTEGER,
    order_code TEXT UNIQUE
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
    status purchase_order_status NOT NULL DEFAULT 'created',
    total DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Identificador humano: número secuencial global (ej: 000123)
    purchase_seq INTEGER,
    purchase_code TEXT UNIQUE
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

-- Vista que agrega estado efectivo derivado del distribution plan
CREATE OR REPLACE VIEW sale_order_with_total_and_status AS
SELECT 
    so.*,
    COALESCE(SUM(si.quantity * si.unit_price), 0) + so.service_fee + so.delivery_charge AS total,
    CASE
        WHEN so.status = 'cancelled' THEN 'cancelled'
        WHEN dpo.status IS NULL THEN so.status
        WHEN dpo.status = 'pending' THEN 'processing'
        WHEN dpo.status = 'out_for_delivery' THEN 'out_for_delivery'
        WHEN dpo.status = 'delivered' THEN 'delivered'
        WHEN dpo.status = 'failed' THEN 'processing'
        WHEN dpo.status = 'cancelled' THEN CASE WHEN so.status = 'cancelled' THEN 'cancelled' ELSE 'processing' END
    END AS effective_status
FROM 
    sale_order so
LEFT JOIN 
    sale_item si ON so.id = si.sale_order_id
LEFT JOIN LATERAL (
    SELECT dpo.status
    FROM distribution_plan_order dpo
    JOIN distribution_plan dp ON dp.id = dpo.distribution_plan_id
    WHERE dpo.sale_order_id = so.id
    ORDER BY dp.plan_date DESC, dpo.created_at DESC
    LIMIT 1
) dpo ON TRUE
GROUP BY 
    so.id, dpo.status;

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

-- === Distribution Plan (operación diaria) ===

-- Enums de estado
CREATE TYPE distribution_plan_status AS ENUM ('planned', 'preparing', 'in_progress', 'completed', 'cancelled');
CREATE TYPE distribution_plan_order_status AS ENUM ('pending', 'out_for_delivery', 'delivered', 'failed', 'cancelled');

-- Entidad principal del plan
CREATE TABLE distribution_plan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_date DATE NOT NULL,
    status distribution_plan_status NOT NULL DEFAULT 'planned',
    notes TEXT,
    cutoff_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Identificador humano: número secuencial global (ej: 000123)
    plan_seq INTEGER,
    plan_code TEXT UNIQUE
);

-- Personal asignado al plan (roles se consultan desde app_user)
CREATE TABLE distribution_plan_worker (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    distribution_plan_id UUID NOT NULL REFERENCES distribution_plan(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (distribution_plan_id, user_id)
);

-- Órdenes incluidas en el plan (lista ordenada)
CREATE TABLE distribution_plan_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    distribution_plan_id UUID NOT NULL REFERENCES distribution_plan(id) ON DELETE CASCADE,
    sale_order_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    status distribution_plan_order_status NOT NULL DEFAULT 'pending',
    delivered_at TIMESTAMPTZ,
    assigned_user_id UUID REFERENCES app_user(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (distribution_plan_id, sale_order_id),
    UNIQUE (distribution_plan_id, sequence)
);

-- Índices
CREATE INDEX idx_distribution_plan_date ON distribution_plan(plan_date);
CREATE INDEX idx_distribution_plan_worker_plan ON distribution_plan_worker(distribution_plan_id);
CREATE INDEX idx_distribution_plan_order_plan ON distribution_plan_order(distribution_plan_id);
CREATE INDEX idx_distribution_plan_order_assignee ON distribution_plan_order(assigned_user_id);

-- ================================
-- Códigos humanos con contador global (sin fecha)
-- ================================

-- Sequences globales
CREATE SEQUENCE IF NOT EXISTS sale_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS distribution_plan_seq START 1;

-- Funciones y triggers secuenciales (sin fecha)
CREATE OR REPLACE FUNCTION set_sale_order_code() RETURNS TRIGGER AS $$
DECLARE
    seq INT;
BEGIN
    seq := nextval('sale_order_seq');
    NEW.order_seq := seq;
    NEW.order_code := LPAD(seq::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_sale_order_code ON sale_order;
CREATE TRIGGER trg_set_sale_order_code
BEFORE INSERT ON sale_order
FOR EACH ROW EXECUTE FUNCTION set_sale_order_code();

CREATE OR REPLACE FUNCTION set_purchase_order_code() RETURNS TRIGGER AS $$
DECLARE
    seq INT;
BEGIN
    seq := nextval('purchase_order_seq');
    NEW.purchase_seq := seq;
    NEW.purchase_code := LPAD(seq::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_purchase_order_code ON purchase_order;
CREATE TRIGGER trg_set_purchase_order_code
BEFORE INSERT ON purchase_order
FOR EACH ROW EXECUTE FUNCTION set_purchase_order_code();

CREATE OR REPLACE FUNCTION set_distribution_plan_code() RETURNS TRIGGER AS $$
DECLARE
    seq INT;
BEGIN
    seq := nextval('distribution_plan_seq');
    NEW.plan_seq := seq;
    NEW.plan_code := LPAD(seq::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_distribution_plan_code ON distribution_plan;
CREATE TRIGGER trg_set_distribution_plan_code
BEFORE INSERT ON distribution_plan
FOR EACH ROW EXECUTE FUNCTION set_distribution_plan_code();

-- Índices únicos (si no existen)
CREATE UNIQUE INDEX IF NOT EXISTS sale_order_order_code_unique_idx ON sale_order(order_code);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_purchase_code_unique_idx ON purchase_order(purchase_code);
CREATE UNIQUE INDEX IF NOT EXISTS distribution_plan_plan_code_unique_idx ON distribution_plan(plan_code);
CREATE UNIQUE INDEX IF NOT EXISTS sale_order_order_seq_unique_idx ON sale_order(order_seq);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_order_purchase_seq_unique_idx ON purchase_order(purchase_seq);
CREATE UNIQUE INDEX IF NOT EXISTS distribution_plan_plan_seq_unique_idx ON distribution_plan(plan_seq);

-- Migración: backfill códigos globales para filas existentes sin código y ajustar sequences
DO $$
DECLARE
    max_so INT;
    max_po INT;
    max_dp INT;
BEGIN
    -- Sale orders
    UPDATE sale_order
    SET order_seq = s.seq,
        order_code = LPAD(s.seq::text, 6, '0')
    FROM (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS seq
        FROM sale_order WHERE order_code IS NULL
    ) AS s
    WHERE sale_order.id = s.id;

    SELECT COALESCE(MAX(order_seq), 0) INTO max_so FROM sale_order;
    PERFORM setval('sale_order_seq', max_so);

    -- Purchase orders
    UPDATE purchase_order
    SET purchase_seq = p.seq,
        purchase_code = LPAD(p.seq::text, 6, '0')
    FROM (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS seq
        FROM purchase_order WHERE purchase_code IS NULL
    ) AS p
    WHERE purchase_order.id = p.id;

    SELECT COALESCE(MAX(purchase_seq), 0) INTO max_po FROM purchase_order;
    PERFORM setval('purchase_order_seq', max_po);

    -- Distribution plans
    UPDATE distribution_plan
    SET plan_seq = d.seq,
        plan_code = LPAD(d.seq::text, 6, '0')
    FROM (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS seq
        FROM distribution_plan WHERE plan_code IS NULL
    ) AS d
    WHERE distribution_plan.id = d.id;

    SELECT COALESCE(MAX(plan_seq), 0) INTO max_dp FROM distribution_plan;
    PERFORM setval('distribution_plan_seq', max_dp);
END $$;

-- ================================
-- Órdenes de venta de ejemplo (pendientes)
-- ================================

-- Pedido 1: Restaurante El Buen Sabor
WITH so1 AS (
  INSERT INTO sale_order (customer_id, status, service_fee, delivery_charge, notes)
  VALUES ((SELECT id FROM customer WHERE name = 'Restaurante El Buen Sabor'), 'pending', 5000, 10000, 'Entrega mañana')
  RETURNING id
)
INSERT INTO sale_item (sale_order_id, product_id, quantity, unit_price)
SELECT so1.id, (SELECT id FROM product WHERE name = 'Tomate'), 10, (SELECT reference_price FROM product WHERE name = 'Tomate') FROM so1
UNION ALL
SELECT so1.id, (SELECT id FROM product WHERE name = 'Cebolla'), 5, (SELECT reference_price FROM product WHERE name = 'Cebolla') FROM so1
UNION ALL
SELECT so1.id, (SELECT id FROM product WHERE name = 'Lechuga'), 3, (SELECT reference_price FROM product WHERE name = 'Lechuga') FROM so1;

-- Pedido 2: Cafetería Central
WITH so2 AS (
  INSERT INTO sale_order (customer_id, status, service_fee, delivery_charge, notes)
  VALUES ((SELECT id FROM customer WHERE name = 'Cafetería Central'), 'pending', 3500, 8000, 'Entrega por la tarde')
  RETURNING id
)
INSERT INTO sale_item (sale_order_id, product_id, quantity, unit_price)
SELECT so2.id, (SELECT id FROM product WHERE name = 'Papa'), 8, (SELECT reference_price FROM product WHERE name = 'Papa') FROM so2
UNION ALL
SELECT so2.id, (SELECT id FROM product WHERE name = 'Zanahoria'), 6, (SELECT reference_price FROM product WHERE name = 'Zanahoria') FROM so2
UNION ALL
SELECT so2.id, (SELECT id FROM product WHERE name = 'Ajo'), 2, (SELECT reference_price FROM product WHERE name = 'Ajo') FROM so2;