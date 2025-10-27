-- MVP schema aligned with Supabase Auth (Pattern B: profiles + role-specific tables)

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM ('admin','operator','supplier','customer');
  END IF;
END $$;

-- Profiles (1:1 to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role user_role NOT NULL DEFAULT 'customer',
  name text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- RLS simplificada: acceso solo para usuarios con rol admin (en tabla public.admin)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all
ON public.profiles FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_self_all ON public.admin;
CREATE POLICY admin_self_all
ON public.admin FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
-- Role-specific tables (1:1 to profiles)
CREATE TABLE IF NOT EXISTS public.admin (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Nota: la policy de acceso admin a perfiles ya se define arriba como FOR ALL

CREATE TABLE IF NOT EXISTS public.operator (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  phone text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.operator ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operator_admin_all ON public.operator;
CREATE POLICY operator_admin_all
ON public.operator FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.supplier (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  contact text,
  phone text,
  bank_accounts jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS supplier_admin_all ON public.supplier;
CREATE POLICY supplier_admin_all
ON public.supplier FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idetification_type') THEN
    CREATE TYPE idetification_type AS ENUM ('CC','NIT','PPT','PEP');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.customer (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text,
  identification_type idetification_type NOT NULL,
  identification_number text NOT NULL,
  contact text,
  phone text,
  preferred_store text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_admin_all ON public.customer;
CREATE POLICY customer_admin_all
ON public.customer FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

-- Product and catalog
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_type') THEN
    CREATE TYPE unit_type AS ENUM ('lb', 'kg', 'unidad');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  unit unit_type NOT NULL,
  main_photo text,
  reference_price numeric(12,2),
  siigo_id text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_admin_all ON public.product;
CREATE POLICY product_admin_all
ON public.product FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.offer (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES public.product(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.supplier(id) ON DELETE RESTRICT,
  price numeric(12,2) NOT NULL,
  available boolean DEFAULT true,
  UNIQUE(product_id, supplier_id)
);
ALTER TABLE public.offer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offer_admin_all ON public.offer;
CREATE POLICY offer_admin_all
ON public.offer FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

-- Shopping cart
CREATE TABLE IF NOT EXISTS public.shopping_cart (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.product(id),
  quantity numeric(12,2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (customer_id, product_id)
);
ALTER TABLE public.shopping_cart ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS shopping_cart_admin_all ON public.shopping_cart;
CREATE POLICY shopping_cart_admin_all
ON public.shopping_cart FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

-- Distribution plan domain
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'distribution_plan_status') THEN
    CREATE TYPE distribution_plan_status AS ENUM ('planned','preparing','in_progress','completed','cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.distribution_plan (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_date date NOT NULL,
  status distribution_plan_status NOT NULL DEFAULT 'planned',
  operator_id uuid REFERENCES public.operator(id),
  notes text,
  cutoff_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  plan_seq integer,
  plan_code text UNIQUE
);
ALTER TABLE public.distribution_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distribution_plan_admin_all ON public.distribution_plan;
CREATE POLICY distribution_plan_admin_all
ON public.distribution_plan FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sale_order_status') THEN
    CREATE TYPE sale_order_status AS ENUM ('pending','processing','out_for_delivery','delivered','cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.sale_order (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id uuid NOT NULL REFERENCES public.customer(id),
  distribution_plan_id uuid NOT NULL REFERENCES public.distribution_plan(id),
  status sale_order_status NOT NULL DEFAULT 'pending',
  service_fee numeric(12,2) DEFAULT 0,
  delivery_fee numeric(12,2) DEFAULT 0,
  notes text,
  created_by_admin_id uuid REFERENCES public.admin(id) ON DELETE RESTRICT,
  created_by_customer_id uuid REFERENCES public.customer(id) ON DELETE RESTRICT,
  CONSTRAINT sale_order_exactly_one_creator CHECK (
    (created_by_admin_id IS NOT NULL) <> (created_by_customer_id IS NOT NULL)
  ),
  created_at timestamptz DEFAULT now(),
  order_seq integer,
  order_code text UNIQUE
);
ALTER TABLE public.sale_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_order_admin_all ON public.sale_order;
CREATE POLICY sale_order_admin_all
ON public.sale_order FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.sale_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_order_id uuid NOT NULL REFERENCES public.sale_order(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.product(id),
  required_quantity numeric(12,2) NOT NULL,
  delivered_quantity numeric(12,2),
  delivered_at timestamptz,
  delivered_by uuid,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sale_order_id, product_id)
);
ALTER TABLE public.sale_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sale_item_admin_all ON public.sale_item;
CREATE POLICY sale_item_admin_all
ON public.sale_item FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'purchase_order_status') THEN
    CREATE TYPE purchase_order_status AS ENUM ('created','published','accepted','received','cancelled','rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.purchase_order (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id uuid NOT NULL REFERENCES public.supplier(id) ON DELETE RESTRICT,
  distribution_plan_id uuid NOT NULL REFERENCES public.distribution_plan(id) ON DELETE RESTRICT,
  status purchase_order_status NOT NULL DEFAULT 'created',
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz,
  purchase_seq integer,
  purchase_code text UNIQUE,
  UNIQUE (supplier_id, distribution_plan_id)
);
ALTER TABLE public.purchase_order ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_order_admin_all ON public.purchase_order;
CREATE POLICY purchase_order_admin_all
ON public.purchase_order FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.purchase_item (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_order(id) ON DELETE CASCADE,
  offer_id uuid NOT NULL REFERENCES public.offer(id),
  quantity numeric(12,2) NOT NULL,
  actual_price numeric(12,2),
  received_quantity numeric(12,2),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.purchase_item ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchase_item_admin_all ON public.purchase_item;
CREATE POLICY purchase_item_admin_all
ON public.purchase_item FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.fulfillment (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sale_item_id uuid NOT NULL REFERENCES public.sale_item(id) ON DELETE CASCADE,
  purchase_item_id uuid NOT NULL REFERENCES public.purchase_item(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (sale_item_id, purchase_item_id)
);
ALTER TABLE public.fulfillment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fulfillment_admin_all ON public.fulfillment;
CREATE POLICY fulfillment_admin_all
ON public.fulfillment FOR ALL
USING (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.admin a WHERE a.user_id = auth.uid()));

-- Sequences and triggers for human codes
CREATE SEQUENCE IF NOT EXISTS sale_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS purchase_order_seq START 1;
CREATE SEQUENCE IF NOT EXISTS distribution_plan_seq START 1;

CREATE OR REPLACE FUNCTION public.set_sale_order_code() RETURNS TRIGGER AS $$
DECLARE seq INT; BEGIN
  seq := nextval('sale_order_seq');
  NEW.order_seq := seq;
  NEW.order_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_sale_order_code ON public.sale_order;
CREATE TRIGGER trg_set_sale_order_code
BEFORE INSERT ON public.sale_order
FOR EACH ROW EXECUTE FUNCTION public.set_sale_order_code();

CREATE OR REPLACE FUNCTION public.set_purchase_order_code() RETURNS TRIGGER AS $$
DECLARE seq INT; BEGIN
  seq := nextval('purchase_order_seq');
  NEW.purchase_seq := seq;
  NEW.purchase_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_purchase_order_code ON public.purchase_order;
CREATE TRIGGER trg_set_purchase_order_code
BEFORE INSERT ON public.purchase_order
FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_code();

CREATE OR REPLACE FUNCTION public.set_distribution_plan_code() RETURNS TRIGGER AS $$
DECLARE seq INT; BEGIN
  seq := nextval('distribution_plan_seq');
  NEW.plan_seq := seq;
  NEW.plan_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_distribution_plan_code ON public.distribution_plan;
CREATE TRIGGER trg_set_distribution_plan_code
BEFORE INSERT ON public.distribution_plan
FOR EACH ROW EXECUTE FUNCTION public.set_distribution_plan_code();

-- Cleanup trigger stays the same
CREATE OR REPLACE FUNCTION public.cleanup_purchase_items_on_fulfillment_delete() RETURNS TRIGGER AS $$
DECLARE po_id UUID; BEGIN
  SELECT purchase_order_id INTO po_id FROM public.purchase_item WHERE id = OLD.purchase_item_id;
  IF NOT EXISTS (SELECT 1 FROM public.fulfillment WHERE purchase_item_id = OLD.purchase_item_id) THEN
    DELETE FROM public.purchase_item WHERE id = OLD.purchase_item_id;
  END IF;
  IF po_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.purchase_item WHERE purchase_order_id = po_id) THEN
      IF EXISTS (SELECT 1 FROM public.purchase_order WHERE id = po_id AND status = 'created') THEN
        DELETE FROM public.purchase_order WHERE id = po_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_purchase_items_on_fulfillment_delete ON public.fulfillment;
CREATE TRIGGER trg_cleanup_purchase_items_on_fulfillment_delete
AFTER DELETE ON public.fulfillment
FOR EACH ROW EXECUTE FUNCTION public.cleanup_purchase_items_on_fulfillment_delete();

-- Trigger to auto-create profile on new auth.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();