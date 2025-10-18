CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE unit_type AS ENUM ('lb', 'kg', 'atado');
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'supplier', 'customer');

-- Tabla de usuarios simplificada
CREATE TABLE auth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Tabla de clientes
CREATE TABLE customer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    contact VARCHAR(200),
    phone VARCHAR(20),
    user_id UUID NOT NULL REFERENCES auth(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);


-- Tabla de coordinadores (operators)
CREATE TABLE operator (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    user_id UUID NOT NULL REFERENCES auth(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de administradores (admins)
CREATE TABLE admin (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(20),
    user_id UUID NOT NULL REFERENCES auth(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de proveedores
CREATE TABLE supplier (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    contact VARCHAR(200),
    phone VARCHAR(20),
    user_id UUID NOT NULL REFERENCES auth(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW()
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


-- Tabla de ofertas de proveedores
CREATE TABLE offer (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES product(id) ON DELETE RESTRICT,
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    price DECIMAL(12,2) NOT NULL,
    available BOOLEAN DEFAULT true,
    UNIQUE(product_id, supplier_id)
);

-- Tabla de carrito de compras (temporal antes de crear orden)
CREATE TABLE shopping_cart (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product(id),
    quantity DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (customer_id, product_id)
);

-- === Distribution Plan (operación diaria) ===

-- Enums de estado
CREATE TYPE distribution_plan_status AS ENUM ('planned', 'preparing', 'in_progress', 'completed', 'cancelled');

-- Entidad principal del plan
CREATE TABLE distribution_plan (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_date DATE NOT NULL,
    status distribution_plan_status NOT NULL DEFAULT 'planned',
    operator_id UUID REFERENCES operator(id),
    notes TEXT,
    cutoff_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- Identificador humano: número secuencial global (ej: 000123)
    plan_seq INTEGER,
    plan_code TEXT UNIQUE
);

-- Tabla de órdenes de venta (a clientes)

CREATE TYPE sale_order_status AS ENUM ('pending', 'processing', 'out_for_delivery', 'delivered', 'cancelled');

CREATE TABLE sale_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES customer(id),
    distribution_plan_id UUID NOT NULL REFERENCES distribution_plan(id),
    status sale_order_status NOT NULL DEFAULT 'pending',
    service_fee DECIMAL(12,2) DEFAULT 0,
    delivery_fee DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_by_admin_id UUID REFERENCES admin(id) ON DELETE RESTRICT,
    created_by_customer_id UUID REFERENCES customer(id) ON DELETE RESTRICT,
    CONSTRAINT sale_order_exactly_one_creator CHECK (
        (created_by_admin_id IS NOT NULL) <> (created_by_customer_id IS NOT NULL)
    )
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Identificador humano: número secuencial global (ej: 000123)
    order_seq INTEGER,
    order_code TEXT UNIQUE,
);

-- Tabla de items de venta
CREATE TABLE sale_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_order_id UUID NOT NULL REFERENCES sale_order(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES product(id),
    required_quantity DECIMAL(12,2) NOT NULL,
    delivered_quantity DECIMAL(12,2),
    delivered_at TIMESTAMPTZ,
    delivered_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sale_order_id, product_id)
);

CREATE TYPE purchase_order_status AS ENUM ('created', 'published', 'accepted', 'delivered', 'cancelled', 'rejected');

-- Tabla de órdenes de compra (a proveedores)
CREATE TABLE purchase_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    supplier_id UUID NOT NULL REFERENCES supplier(id) ON DELETE RESTRICT,
    distribution_plan_id UUID NOT NULL REFERENCES distribution_plan(id) ON DELETE RESTRICT,
    status purchase_order_status NOT NULL DEFAULT 'created',
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    received_at TIMESTAMPTZ,
    -- Identificador humano: número secuencial global (ej: 000123)
    purchase_seq INTEGER,
    purchase_code TEXT UNIQUE,
    UNIQUE (supplier_id, distribution_plan_id)
);

-- Tabla de items de compra
CREATE TABLE purchase_item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
    offer_id UUID NOT NULL REFERENCES offer(id),
    quantity DECIMAL(12,2) NOT NULL,
    actual_price DECIMAL(12,2),
    received_quantity DECIMAL(12,2),
    received_by UUID REFERENCES auth(id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de cumplimiento (relación entre ventas y compras)
CREATE TABLE fulfillment (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_item_id UUID NOT NULL REFERENCES sale_item(id) ON DELETE CASCADE,
    purchase_item_id UUID NOT NULL REFERENCES purchase_item(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sale_item_id, purchase_item_id)
);

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
    NEW.order_code := LPAD(seq::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sale_order_code
BEFORE INSERT ON sale_order
FOR EACH ROW EXECUTE FUNCTION set_sale_order_code();

CREATE OR REPLACE FUNCTION set_purchase_order_code() RETURNS TRIGGER AS $$
DECLARE
    seq INT;
BEGIN
    seq := nextval('purchase_order_seq');
    NEW.purchase_seq := seq;
    NEW.purchase_code := LPAD(seq::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_purchase_order_code
BEFORE INSERT ON purchase_order
FOR EACH ROW EXECUTE FUNCTION set_purchase_order_code();

CREATE OR REPLACE FUNCTION set_distribution_plan_code() RETURNS TRIGGER AS $$
DECLARE
    seq INT;
BEGIN
    seq := nextval('distribution_plan_seq');
    NEW.plan_seq := seq;
    NEW.plan_code := LPAD(seq::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_distribution_plan_code
BEFORE INSERT ON distribution_plan
FOR EACH ROW EXECUTE FUNCTION set_distribution_plan_code();
