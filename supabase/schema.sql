--
-- PostgreSQL database dump
--

\restrict uCKzN5XH4vPGq3PmM8eBfZxtITYl3q1g5Tvla0C9C7MQ3Rwy3olc9eCVAX2lwvN

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Ubuntu 17.9-1.pgdg24.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: strategic_profile; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA strategic_profile;


--
-- Name: distribution_plan_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.distribution_plan_status AS ENUM (
    'planned',
    'preparing',
    'in_progress',
    'completed',
    'cancelled',
    'invoicing'
);


--
-- Name: idetification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.idetification_type AS ENUM (
    'CC',
    'NIT',
    'PPT',
    'PEP'
);


--
-- Name: purchase_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_order_status AS ENUM (
    'created',
    'published',
    'accepted',
    'received',
    'cancelled',
    'rejected'
);


--
-- Name: sale_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_order_status AS ENUM (
    'pending',
    'processing',
    'out_for_delivery',
    'delivered',
    'cancelled'
);


--
-- Name: unit_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.unit_type AS ENUM (
    'lb',
    'kg',
    'atado',
    'unidad'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'operator',
    'supplier',
    'customer'
);


--
-- Name: cleanup_purchase_items_on_fulfillment_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_purchase_items_on_fulfillment_delete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
END; $$;


--
-- Name: get_in_progress_operations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_in_progress_operations() RETURNS TABLE(order_id uuid, order_code text, order_status public.sale_order_status, plan_id uuid, plan_date date, plan_code text, plan_status public.distribution_plan_status, customer_name text, product_name text, order_quantity numeric, product_unit public.unit_type, product_image text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    select
        so.id                                    as order_id,
        so.order_code                            as order_code,
        so.status                                as order_status,
        dp.id                                    as plan_id,
        dp.plan_date                             as plan_date,
        dp.plan_code                             as plan_code,
        dp.status                                as plan_status,
        c.name                                   as customer_name,
        p.name                                   as product_name,
        si.required_quantity                     as order_quantity,
        p.unit                                   as product_unit,
        p.main_photo                             as product_image
    from public.sale_order so
    join public.distribution_plan dp on dp.id = so.distribution_plan_id
    join public.customer c           on c.id = so.customer_id
    join public.sale_item si         on si.sale_order_id = so.id
    join public.product p            on p.id = si.product_id
    where dp.status = 'in_progress'
    order by so.created_at desc;
$$;


--
-- Name: FUNCTION get_in_progress_operations(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_in_progress_operations() IS 'Reporte de operaciones en ejecución: flat read-only operations dataset for Dagster operations PDF generation.';


--
-- Name: get_invoice_values_by_plan(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invoice_values_by_plan(p_plan_code text) RETURNS TABLE(plan_code text, plan_date date, order_id uuid, order_code text, customer_id uuid, customer_name text, identification_type public.idetification_type, identification_number text, product_id uuid, siigo_id text, product_name text, product_unit public.unit_type, order_quantity numeric, purchase_unit_price numeric, service_fee_percentage numeric, unit_price numeric, line_total numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with product_price as (
        select
            po.distribution_plan_id,
            of.product_id,
            case
                when sum(coalesce(pi.quantity, 0)) > 0 then
                    sum(coalesce(pi.actual_price, 0) * coalesce(pi.quantity, 0)) / sum(coalesce(pi.quantity, 0))
                else
                    max(pi.actual_price)
            end as purchase_unit_price
        from public.purchase_order po
        inner join public.purchase_item pi on pi.purchase_order_id = po.id
        inner join public.offer of on of.id = pi.offer_id
        where pi.actual_price is not null
        group by
            po.distribution_plan_id,
            of.product_id
    )
    select
        dp.plan_code                                      as plan_code,
        dp.plan_date                                      as plan_date,
        so.id                                             as order_id,
        so.order_code                                     as order_code,
        c.id                                              as customer_id,
        c.name                                            as customer_name,
        c.identification_type                             as identification_type,
        c.identification_number                           as identification_number,
        p.id                                              as product_id,
        p.siigo_id                                        as siigo_id,
        p.name                                            as product_name,
        p.unit                                            as product_unit,
        si.required_quantity                              as order_quantity,
        round(product_price.purchase_unit_price, 2)        as purchase_unit_price,
        dp.service_fee_percentage                         as service_fee_percentage,
        round(
            product_price.purchase_unit_price * (1 + dp.service_fee_percentage / 100),
            2
        )                                                 as unit_price,
        round(
            si.required_quantity * product_price.purchase_unit_price * (1 + dp.service_fee_percentage / 100),
            2
        )                                                 as line_total
    from public.sale_order so
    inner join public.distribution_plan dp on dp.id = so.distribution_plan_id
    inner join public.customer c on c.id = so.customer_id
    inner join public.sale_item si on si.sale_order_id = so.id
    inner join public.product p on p.id = si.product_id
    inner join product_price on product_price.distribution_plan_id = dp.id
                            and product_price.product_id = p.id
    where dp.plan_code = p_plan_code
    order by
        c.identification_number,
        so.order_code,
        p.siigo_id,
        p.name;
$$;


--
-- Name: FUNCTION get_invoice_values_by_plan(p_plan_code text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_invoice_values_by_plan(p_plan_code text) IS 'Invoice-ready line items for a Jepri distribution plan. Receives plan_code and returns customer/order/product quantities, Siigo IDs, unit prices with service fee, and line totals.';


--
-- Name: get_invoicing_distribution_plan_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_invoicing_distribution_plan_code() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    select dp.plan_code
    from public.distribution_plan dp
    where dp.status = 'invoicing'
    order by
        dp.plan_date desc,
        dp.plan_seq desc nulls last,
        dp.created_at desc
    limit 1;
$$;


--
-- Name: FUNCTION get_invoicing_distribution_plan_code(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_invoicing_distribution_plan_code() IS 'Latest distribution plan code currently in invoicing status for Jepri automation/reporting.';


--
-- Name: get_latest_unfinished_distribution_plan(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_latest_unfinished_distribution_plan() RETURNS TABLE(id uuid, plan_code text, plan_date date, status public.distribution_plan_status, operator_id uuid, notes text, cutoff_at timestamp with time zone, created_at timestamp with time zone, updated_at timestamp with time zone, plan_seq integer, service_fee_percentage numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$select
        dp.id,
        dp.plan_code,
        dp.plan_date,
        dp.status,
        dp.operator_id,
        dp.notes,
        dp.cutoff_at,
        dp.created_at,
        dp.updated_at,
        dp.plan_seq,
        dp.service_fee_percentage
    from public.distribution_plan dp
    where dp.status in ('invoicing', 'in_progress', 'preparing')
    order by
        case dp.status
            when 'invoicing' then 1
            when 'in_progress' then 2
            when 'preparing' then 3
        end,
        dp.plan_date desc,
        dp.plan_seq desc nulls last,
        dp.created_at desc
    limit 1;$$;


--
-- Name: FUNCTION get_latest_unfinished_distribution_plan(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_latest_unfinished_distribution_plan() IS 'Latest non-terminal distribution plan for Jepri automation/reporting. Excludes completed and cancelled plans.';


--
-- Name: get_open_plan_siigo_invoice_lines(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_open_plan_siigo_invoice_lines() RETURNS TABLE(plan_code text, order_code text, identification_number text, siigo_id text, name text, order_quantity numeric, unit_price numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    select
        iv.plan_code,
        iv.order_code,
        iv.identification_number,
        iv.siigo_id,
        iv.product_name as name,
        iv.order_quantity,
        iv.unit_price
    from public.get_latest_unfinished_distribution_plan() latest_plan
    cross join lateral public.get_invoice_values_by_plan(latest_plan.plan_code) iv
    order by
        iv.identification_number,
        iv.order_code,
        iv.siigo_id,
        iv.product_name;
$$;


--
-- Name: FUNCTION get_open_plan_siigo_invoice_lines(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_open_plan_siigo_invoice_lines() IS 'Siigo invoice line structure for the latest non-terminal Jepri distribution plan. Returns plan/order/customer/product quantity and unit price columns required for Siigo API usage.';


--
-- Name: get_siigo_customer_balances(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_siigo_customer_balances(p_date date DEFAULT NULL::date, p_limit integer DEFAULT 30) RETURNS TABLE(snapshot_date date, customer_identification text, customer_name text, invoices_count integer, sales_total numeric, collected_total numeric, balance_total numeric, overdue_balance_total numeric, oldest_due_date date, max_days_overdue integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(sdcbs.snapshot_date) from public.siigo_daily_customer_balance_snapshot sdcbs)
        ) as snapshot_date
    )
    select
        sdcbs.snapshot_date,
        sdcbs.customer_identification,
        sdcbs.customer_name,
        sdcbs.invoices_count,
        sdcbs.sales_total,
        sdcbs.collected_total,
        sdcbs.balance_total,
        sdcbs.overdue_balance_total,
        sdcbs.oldest_due_date,
        sdcbs.max_days_overdue
    from public.siigo_daily_customer_balance_snapshot sdcbs
    join target_date td on td.snapshot_date = sdcbs.snapshot_date
    order by sdcbs.balance_total desc, sdcbs.overdue_balance_total desc, sdcbs.customer_name
    limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;


--
-- Name: FUNCTION get_siigo_customer_balances(p_date date, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_siigo_customer_balances(p_date date, p_limit integer) IS 'Read-only Siigo customer balances for one snapshot date. Defaults to latest available snapshot and top 30 by balance.';


--
-- Name: get_siigo_daily_indicators(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_siigo_daily_indicators(p_date date DEFAULT NULL::date) RETURNS TABLE(snapshot_date date, sales_today numeric, collections_today numeric, accounts_receivable_total numeric, overdue_receivable_total numeric, invoices_count integer, payment_receipts_count integer, customers_with_balance_count integer, customers_overdue_count integer, last_sync_status text, last_sync_started_at timestamp with time zone, last_sync_completed_at timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(sdis.snapshot_date) from public.siigo_daily_indicator_snapshot sdis)
        ) as snapshot_date
    ),
    latest_run as (
        select distinct on (ssr.sync_date)
            ssr.sync_date,
            ssr.status,
            ssr.started_at,
            ssr.completed_at
        from public.siigo_sync_run ssr
        join target_date td on td.snapshot_date = ssr.sync_date
        order by
            ssr.sync_date,
            case ssr.status when 'success' then 0 when 'partial_success' then 1 when 'running' then 2 else 3 end,
            ssr.started_at desc
    )
    select
        sdis.snapshot_date,
        sdis.sales_today,
        sdis.collections_today,
        sdis.accounts_receivable_total,
        sdis.overdue_receivable_total,
        sdis.invoices_count,
        sdis.payment_receipts_count,
        sdis.customers_with_balance_count,
        sdis.customers_overdue_count,
        latest_run.status as last_sync_status,
        latest_run.started_at as last_sync_started_at,
        latest_run.completed_at as last_sync_completed_at
    from target_date td
    join public.siigo_daily_indicator_snapshot sdis on sdis.snapshot_date = td.snapshot_date
    left join latest_run on latest_run.sync_date = sdis.snapshot_date;
$$;


--
-- Name: FUNCTION get_siigo_daily_indicators(p_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_siigo_daily_indicators(p_date date) IS 'Read-only executive Siigo indicators for one snapshot date. Defaults to latest available snapshot.';


--
-- Name: get_siigo_overdue_customers(date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_siigo_overdue_customers(p_date date DEFAULT NULL::date, p_limit integer DEFAULT 20) RETURNS TABLE(snapshot_date date, customer_identification text, customer_name text, overdue_balance_total numeric, balance_total numeric, oldest_due_date date, max_days_overdue integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(sdcbs.snapshot_date) from public.siigo_daily_customer_balance_snapshot sdcbs)
        ) as snapshot_date
    )
    select
        sdcbs.snapshot_date,
        sdcbs.customer_identification,
        sdcbs.customer_name,
        sdcbs.overdue_balance_total,
        sdcbs.balance_total,
        sdcbs.oldest_due_date,
        sdcbs.max_days_overdue
    from public.siigo_daily_customer_balance_snapshot sdcbs
    join target_date td on td.snapshot_date = sdcbs.snapshot_date
    where sdcbs.overdue_balance_total > 0
    order by sdcbs.overdue_balance_total desc, sdcbs.max_days_overdue desc, sdcbs.customer_name
    limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;


--
-- Name: FUNCTION get_siigo_overdue_customers(p_date date, p_limit integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_siigo_overdue_customers(p_date date, p_limit integer) IS 'Read-only list of customers with overdue Siigo balances for one snapshot date. Defaults to latest available snapshot.';


--
-- Name: get_siigo_sales_collections_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_siigo_sales_collections_summary(p_start_date date DEFAULT ((CURRENT_DATE - '7 days'::interval))::date, p_end_date date DEFAULT CURRENT_DATE) RETURNS TABLE(start_date date, end_date date, days_count integer, sales_total numeric, collections_total numeric, net_receivable_change numeric, invoices_count integer, payment_receipts_count integer, latest_accounts_receivable_total numeric, latest_overdue_receivable_total numeric, latest_snapshot_date date)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with bounds as (
        select
            least(coalesce(p_start_date, current_date), coalesce(p_end_date, current_date)) as start_date,
            greatest(coalesce(p_start_date, current_date), coalesce(p_end_date, current_date)) as end_date
    ),
    daily as (
        select sdis.*
        from public.siigo_daily_indicator_snapshot sdis
        cross join bounds b
        where sdis.snapshot_date between b.start_date and b.end_date
    ),
    latest as (
        select
            d.snapshot_date,
            d.accounts_receivable_total,
            d.overdue_receivable_total
        from daily d
        order by d.snapshot_date desc
        limit 1
    )
    select
        b.start_date,
        b.end_date,
        count(d.snapshot_date)::integer as days_count,
        coalesce(sum(d.sales_today), 0)::numeric as sales_total,
        coalesce(sum(d.collections_today), 0)::numeric as collections_total,
        (coalesce(sum(d.sales_today), 0) - coalesce(sum(d.collections_today), 0))::numeric as net_receivable_change,
        coalesce(sum(d.invoices_count), 0)::integer as invoices_count,
        coalesce(sum(d.payment_receipts_count), 0)::integer as payment_receipts_count,
        latest.accounts_receivable_total as latest_accounts_receivable_total,
        latest.overdue_receivable_total as latest_overdue_receivable_total,
        latest.snapshot_date as latest_snapshot_date
    from bounds b
    left join daily d on true
    left join latest on true
    group by
        b.start_date,
        b.end_date,
        latest.accounts_receivable_total,
        latest.overdue_receivable_total,
        latest.snapshot_date;
$$;


--
-- Name: FUNCTION get_siigo_sales_collections_summary(p_start_date date, p_end_date date); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_siigo_sales_collections_summary(p_start_date date, p_end_date date) IS 'Read-only Siigo sales/collections summary across a date range. Defaults to the last 7 days.';


--
-- Name: handle_new_auth_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_auth_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  RETURN NEW;
END; $$;


--
-- Name: log_product_reference_price_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_product_reference_price_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_plan_id uuid;
BEGIN
  IF NEW.reference_price IS DISTINCT FROM OLD.reference_price THEN
    -- Intenta leer un plan_id desde configuración de la app (si existe)
    BEGIN
      v_plan_id := NULLIF(current_setting('app.distribution_plan_id', true), '')::uuid;
    EXCEPTION WHEN others THEN
      v_plan_id := NULL;
    END;

    INSERT INTO public.product_reference_price_history (
      product_id,
      product_name,
      product_unit,
      old_reference_price,
      new_reference_price,
      distribution_plan_id,
      changed_by
    ) VALUES (
      NEW.id,
      NEW.name,
      NEW.unit,
      OLD.reference_price,
      NEW.reference_price,
      v_plan_id,
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: set_distribution_plan_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_distribution_plan_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE seq INT; BEGIN
  seq := nextval('distribution_plan_seq');
  NEW.plan_seq := seq;
  NEW.plan_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$;


--
-- Name: set_purchase_order_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_purchase_order_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE seq INT; BEGIN
  seq := nextval('purchase_order_seq');
  NEW.purchase_seq := seq;
  NEW.purchase_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$;


--
-- Name: set_sale_order_code(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_sale_order_code() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE seq INT; BEGIN
  seq := nextval('sale_order_seq');
  NEW.order_seq := seq;
  NEW.order_code := LPAD(seq::text, 4, '0');
  RETURN NEW;
END; $$;


--
-- Name: simulate_transition_to_completed_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.simulate_transition_to_completed_state(plan_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  resultado jsonb;
BEGIN
  -- 1. Extraemos los datos crudos del plan solicitado
  WITH items_crudos AS (
    SELECT 
      o.id AS offer_id,
      o.supplier_id,
      o.product_id,
      p.name AS nombre_producto,
      o.price AS precio_oferta_actual,
      pi.actual_price AS nuevo_precio_item,
      p.reference_price AS precio_ref_actual
    FROM purchase_item pi
    INNER JOIN purchase_order po ON pi.purchase_order_id = po.id
    INNER JOIN offer o ON pi.offer_id = o.id
    INNER JOIN product p ON o.product_id = p.id
    WHERE po.distribution_plan_id = plan_id
      AND pi.actual_price > 0
  ),
  -- 2. Consolidamos las OFERTAS por proveedor/producto calculando su PROMEDIO
  ofertas_consolidadas AS (
    SELECT 
      supplier_id,
      product_id,
      nombre_producto,
      ROUND(AVG(precio_oferta_actual), 2) AS precio_oferta_anterior,
      ROUND(AVG(nuevo_precio_item), 2) AS nuevo_precio_oferta
    FROM items_crudos
    GROUP BY supplier_id, product_id, nombre_producto
  ),
  -- 3. Consolidamos los PRODUCTOS calculando su PROMEDIO GLOBAL
  -- CLAVE: COUNT(DISTINCT supplier_id) cuenta cuántas ofertas reales e independientes cambiarán
  promedios_productos AS (
    SELECT 
      product_id,
      nombre_producto,
      ROUND(AVG(precio_ref_actual), 2) AS precio_referencia_anterior,
      ROUND(AVG(nuevo_precio_item), 2) AS nuevo_precio_referencia,
      COUNT(DISTINCT supplier_id) AS ofertas_asociadas -- <-- REGLA: Cuenta solo proveedores distintos
    FROM items_crudos
    GROUP BY product_id, nombre_producto
  )
  -- 4. Construimos el JSON estructurado final
  SELECT jsonb_build_object(
    'total_ofertas_a_crear', (SELECT COUNT(*) FROM ofertas_consolidadas),
    'productos_a_actualizar', (
      SELECT jsonb_agg(jsonb_build_object(
        'product_id', product_id,
        'nombre', nombre_producto,
        'precio_referencia_anterior', precio_referencia_anterior,
        'nuevo_precio_referencia', nuevo_precio_referencia,
        'ofertas_asociadas', ofertas_asociadas
      )) FROM promedios_productos
    ),
    'detalles_ofertas', (
      SELECT jsonb_agg(jsonb_build_object(
        'supplier_id', supplier_id,
        'product_id', product_id,
        'nombre_producto', nombre_producto,
        'precio_oferta_anterior', precio_oferta_anterior,
        'nuevo_precio_oferta', nuevo_precio_oferta
      )) FROM ofertas_consolidadas
    )
  ) INTO resultado;

  RETURN resultado;
END;
$$;


--
-- Name: transition_to_completed_state(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.transition_to_completed_state(plan_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  porcentaje_comision numeric;
BEGIN
  -- =========================================================================
  -- PASO NUEVO A: Actualizar el estado del plan de distribución a "completed"
  -- y capturar el porcentaje de comisión (service_fee_percentage)
  -- =========================================================================
  UPDATE distribution_plan
  SET status = 'completed'
  WHERE id = plan_id
  RETURNING service_fee_percentage INTO porcentaje_comision;

  -- Validación de seguridad por si el plan_id ingresado no existe
  IF porcentaje_comision IS NULL THEN
    porcentaje_comision := 0;
  END IF;

  -- =========================================================================
  -- PASO NUEVO B: Actualizar las órdenes de venta (sale_order) vinculadas
  -- =========================================================================
  UPDATE sale_order
  SET 
    status = 'delivered',
    service_fee_percentage = porcentaje_comision
  WHERE distribution_plan_id = plan_id;

  -- =========================================================================
  -- PASO 1: Crear la tabla temporal con todos los datos del plan solicitado
  -- =========================================================================
  CREATE TEMP TABLE items_a_procesar AS
  SELECT 
    o.id AS old_offer_id,
    o.supplier_id,
    o.product_id,
    pi.actual_price
  FROM purchase_item pi
  INNER JOIN purchase_order po ON pi.purchase_order_id = po.id
  INNER JOIN offer o ON pi.offer_id = o.id
  WHERE po.distribution_plan_id = plan_id
    AND pi.actual_price > 0;

  -- =========================================================================
  -- PASO 2: Desactivar cualquier oferta externa o interna que esté activa
  -- =========================================================================
  UPDATE offer
  SET available = false
  WHERE available = true 
    AND (supplier_id, product_id) IN (
      SELECT DISTINCT supplier_id, product_id FROM items_a_procesar
    );

  -- =========================================================================
  -- PASO 3: Insertar la oferta consolidada con el precio promedio
  --  (AHORA: enlazamos cada oferta creada con el distribution_plan_id que disparó la transición)
  -- =========================================================================
  INSERT INTO offer (supplier_id, product_id, available, price, distribution_plan_id)
  SELECT 
    supplier_id,
    product_id,
    true,
    ROUND(AVG(actual_price), 2) AS price,
    plan_id AS distribution_plan_id
  FROM items_a_procesar
  GROUP BY supplier_id, product_id;

  -- =========================================================================
  -- PASO 4: Actualizar el precio de referencia en la entidad producto
  -- =========================================================================
  UPDATE product p
  SET reference_price = sub.precio_promedio
  FROM (
    SELECT 
      product_id,
      ROUND(AVG(actual_price), 2) AS precio_promedio
    FROM items_a_procesar
    GROUP BY product_id
  ) sub
  WHERE p.id = sub.product_id;

  DROP TABLE items_a_procesar;
END;
$$;


--
-- Name: get_japest_siigo_collections(date, date, integer, text); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_collections(p_start_date date DEFAULT ((CURRENT_DATE - '7 days'::interval))::date, p_end_date date DEFAULT CURRENT_DATE, p_limit integer DEFAULT 100, p_busqueda text DEFAULT NULL::text) RETURNS TABLE(snapshot_date date, recibo text, fecha_recaudo date, tercero text, identificacion text, metodo_pago text, valor numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with bounds as (
        select
            least(coalesce(p_start_date, current_date), coalesce(p_end_date, current_date)) as start_date,
            greatest(coalesce(p_start_date, current_date), coalesce(p_end_date, current_date)) as end_date
    ),
    term as (
        select nullif(btrim(p_busqueda), '') as q
    )
    select
        r.snapshot_date,
        coalesce(r.receipt_name, r.number) as recibo,
        r.receipt_date as fecha_recaudo,
        r.third_party_name as tercero,
        r.third_party_identification as identificacion,
        r.payment_name as metodo_pago,
        r.payment_value as valor
    from public.siigo_daily_payment_receipt_snapshot r
    cross join bounds b
    cross join term
    where r.receipt_date between b.start_date and b.end_date
      and (
          term.q is null
          or r.third_party_name ilike '%' || term.q || '%'
          or r.third_party_identification ilike '%' || term.q || '%'
          or r.receipt_name ilike '%' || term.q || '%'
          or r.number ilike '%' || term.q || '%'
      )
    order by r.receipt_date desc, r.payment_value desc, r.receipt_name
    limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;


--
-- Name: FUNCTION get_japest_siigo_collections(p_start_date date, p_end_date date, p_limit integer, p_busqueda text); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_collections(p_start_date date, p_end_date date, p_limit integer, p_busqueda text) IS 'Read-only Siigo collections/payment receipts for Paola through Japest. Defaults to last 7 days.';


--
-- Name: get_japest_siigo_customer(text, date); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_customer(p_busqueda text, p_date date DEFAULT NULL::date) RETURNS TABLE(snapshot_date date, cliente text, identificacion text, cartera_total numeric, cartera_vencida numeric, facturas_abiertas jsonb, recaudos_recientes jsonb)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(snapshot_date) from public.siigo_daily_customer_balance_snapshot)
        ) as snapshot_date
    ),
    term as (
        select nullif(btrim(p_busqueda), '') as q
    ),
    matched_customer as (
        select b.*
        from public.siigo_daily_customer_balance_snapshot b
        join target_date td on td.snapshot_date = b.snapshot_date
        cross join term
        where term.q is not null
          and (
              b.customer_name ilike '%' || term.q || '%'
              or b.customer_identification ilike '%' || term.q || '%'
          )
        order by b.balance_total desc, b.customer_name
        limit 1
    ),
    invoices as (
        select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
        from (
            select
                inv.full_number as factura,
                inv.invoice_date as fecha_factura,
                inv.total,
                inv.paid_value as pagado,
                inv.balance as saldo,
                inv.stamp_status as estado_dian,
                inv.mail_status as estado_correo,
                inv.public_url as url_publica
            from public.siigo_daily_invoice_snapshot inv
            join matched_customer c on c.customer_identification = inv.customer_identification
            where inv.snapshot_date = c.snapshot_date
              and inv.balance > 0
            order by inv.balance desc, inv.invoice_date asc
            limit 20
        ) x
    ),
    receipts as (
        select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
        from (
            select
                r.receipt_date as fecha_recaudo,
                coalesce(r.receipt_name, r.number) as recibo,
                r.payment_name as metodo_pago,
                r.payment_value as valor
            from public.siigo_daily_payment_receipt_snapshot r
            join matched_customer c on c.customer_identification = r.third_party_identification
            where r.receipt_date >= (c.snapshot_date - interval '90 days')::date
            order by r.receipt_date desc, r.payment_value desc
            limit 20
        ) x
    )
    select
        c.snapshot_date,
        c.customer_name as cliente,
        c.customer_identification as identificacion,
        c.balance_total as cartera_total,
        c.overdue_balance_total as cartera_vencida,
        invoices.rows as facturas_abiertas,
        receipts.rows as recaudos_recientes
    from matched_customer c
    cross join invoices
    cross join receipts;
$$;


--
-- Name: FUNCTION get_japest_siigo_customer(p_busqueda text, p_date date); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_customer(p_busqueda text, p_date date) IS 'Read-only customer lookup for Paola through Japest: balance, open invoices and recent collections. Search by name or identification.';


--
-- Name: get_japest_siigo_dashboard(date); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_dashboard(p_date date DEFAULT NULL::date) RETURNS TABLE(snapshot_date date, ventas_hoy numeric, ventas_mes numeric, recaudo_hoy numeric, recaudo_mes numeric, cartera_total numeric, cartera_vencida numeric, facturas_count integer, recibos_recaudo_count integer, clientes_con_saldo_count integer, clientes_vencidos_count integer, top_clientes_cartera jsonb, top_clientes_vencidos jsonb, ultimas_facturas_abiertas jsonb, ultimo_sync_estado text, ultimo_sync_inicio timestamp with time zone, ultimo_sync_fin timestamp with time zone)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(snapshot_date) from public.siigo_daily_indicator_snapshot)
        ) as snapshot_date
    ),
    indicator as (
        select i.*
        from public.siigo_daily_indicator_snapshot i
        join target_date td on td.snapshot_date = i.snapshot_date
    ),
    latest_run as (
        select distinct on (r.sync_date)
            r.sync_date,
            r.status,
            r.started_at,
            r.completed_at
        from public.siigo_sync_run r
        join target_date td on td.snapshot_date = r.sync_date
        order by
            r.sync_date,
            case r.status
                when 'success' then 0
                when 'partial_success' then 1
                when 'running' then 2
                else 3
            end,
            r.started_at desc
    ),
    top_balances as (
        select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
        from (
            select
                b.customer_name as cliente,
                b.customer_identification as identificacion,
                b.balance_total as cartera,
                b.overdue_balance_total as cartera_vencida,
                b.oldest_due_date as fecha_mas_antigua,
                b.max_days_overdue as dias_max_vencido
            from public.siigo_daily_customer_balance_snapshot b
            join target_date td on td.snapshot_date = b.snapshot_date
            where b.balance_total > 0
            order by b.balance_total desc, b.overdue_balance_total desc, b.customer_name
            limit 5
        ) x
    ),
    top_overdue as (
        select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
        from (
            select
                b.customer_name as cliente,
                b.customer_identification as identificacion,
                b.overdue_balance_total as cartera_vencida,
                b.balance_total as cartera,
                b.oldest_due_date as fecha_mas_antigua,
                b.max_days_overdue as dias_max_vencido
            from public.siigo_daily_customer_balance_snapshot b
            join target_date td on td.snapshot_date = b.snapshot_date
            where b.overdue_balance_total > 0
            order by b.overdue_balance_total desc, b.max_days_overdue desc, b.customer_name
            limit 5
        ) x
    ),
    open_invoices as (
        select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) as rows
        from (
            select
                inv.full_number as factura,
                inv.invoice_date as fecha_factura,
                inv.customer_name as cliente,
                inv.total,
                inv.paid_value as pagado,
                inv.balance as saldo,
                inv.stamp_status as estado_dian,
                inv.mail_status as estado_correo
            from public.siigo_daily_invoice_snapshot inv
            join target_date td on td.snapshot_date = inv.snapshot_date
            where inv.balance > 0
            order by inv.balance desc, inv.invoice_date asc, inv.full_number
            limit 8
        ) x
    )
    select
        i.snapshot_date,
        i.sales_today as ventas_hoy,
        i.sales_month_to_date as ventas_mes,
        i.collections_today as recaudo_hoy,
        i.collections_month_to_date as recaudo_mes,
        i.accounts_receivable_total as cartera_total,
        i.overdue_receivable_total as cartera_vencida,
        i.invoices_count as facturas_count,
        i.payment_receipts_count as recibos_recaudo_count,
        i.customers_with_balance_count as clientes_con_saldo_count,
        i.customers_overdue_count as clientes_vencidos_count,
        top_balances.rows as top_clientes_cartera,
        top_overdue.rows as top_clientes_vencidos,
        open_invoices.rows as ultimas_facturas_abiertas,
        latest_run.status as ultimo_sync_estado,
        latest_run.started_at as ultimo_sync_inicio,
        latest_run.completed_at as ultimo_sync_fin
    from indicator i
    left join latest_run on latest_run.sync_date = i.snapshot_date
    cross join top_balances
    cross join top_overdue
    cross join open_invoices;
$$;


--
-- Name: FUNCTION get_japest_siigo_dashboard(p_date date); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_dashboard(p_date date) IS 'Read-only dashboard for Paola through Japest: sales, collections, cartera, overdue and open invoice highlights. No raw JSON.';


--
-- Name: get_japest_siigo_open_invoices(date, integer, text); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_open_invoices(p_date date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_busqueda text DEFAULT NULL::text) RETURNS TABLE(snapshot_date date, factura text, fecha_factura date, cliente text, identificacion text, total numeric, pagado numeric, saldo numeric, estado_dian text, estado_correo text, url_publica text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(snapshot_date) from public.siigo_daily_invoice_snapshot)
        ) as snapshot_date
    ),
    term as (
        select nullif(btrim(p_busqueda), '') as q
    )
    select
        inv.snapshot_date,
        inv.full_number as factura,
        inv.invoice_date as fecha_factura,
        inv.customer_name as cliente,
        inv.customer_identification as identificacion,
        inv.total,
        inv.paid_value as pagado,
        inv.balance as saldo,
        inv.stamp_status as estado_dian,
        inv.mail_status as estado_correo,
        inv.public_url as url_publica
    from public.siigo_daily_invoice_snapshot inv
    join target_date td on td.snapshot_date = inv.snapshot_date
    cross join term
    where inv.balance > 0
      and (
          term.q is null
          or inv.customer_name ilike '%' || term.q || '%'
          or inv.customer_identification ilike '%' || term.q || '%'
          or inv.full_number ilike '%' || term.q || '%'
      )
    order by inv.balance desc, inv.invoice_date asc, inv.full_number
    limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


--
-- Name: FUNCTION get_japest_siigo_open_invoices(p_date date, p_limit integer, p_busqueda text); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_open_invoices(p_date date, p_limit integer, p_busqueda text) IS 'Read-only open Siigo invoices for Paola through Japest. Optional search by customer, ID or invoice number.';


--
-- Name: get_japest_siigo_receivables(date, integer, boolean); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_receivables(p_date date DEFAULT NULL::date, p_limit integer DEFAULT 30, p_solo_vencidos boolean DEFAULT false) RETURNS TABLE(snapshot_date date, cliente text, identificacion text, sucursal integer, facturas_count integer, ventas_total numeric, recaudo_total numeric, cartera_total numeric, cartera_vencida numeric, fecha_mas_antigua date, dias_max_vencido integer)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with target_date as (
        select coalesce(
            p_date,
            (select max(snapshot_date) from public.siigo_daily_customer_balance_snapshot)
        ) as snapshot_date
    )
    select
        b.snapshot_date,
        b.customer_name as cliente,
        b.customer_identification as identificacion,
        b.customer_branch_office as sucursal,
        b.invoices_count as facturas_count,
        b.sales_total as ventas_total,
        b.collected_total as recaudo_total,
        b.balance_total as cartera_total,
        b.overdue_balance_total as cartera_vencida,
        b.oldest_due_date as fecha_mas_antigua,
        b.max_days_overdue as dias_max_vencido
    from public.siigo_daily_customer_balance_snapshot b
    join target_date td on td.snapshot_date = b.snapshot_date
    where b.balance_total > 0
      and (not coalesce(p_solo_vencidos, false) or b.overdue_balance_total > 0)
    order by
        case when coalesce(p_solo_vencidos, false) then b.overdue_balance_total else b.balance_total end desc,
        b.max_days_overdue desc,
        b.customer_name
    limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;


--
-- Name: FUNCTION get_japest_siigo_receivables(p_date date, p_limit integer, p_solo_vencidos boolean); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_receivables(p_date date, p_limit integer, p_solo_vencidos boolean) IS 'Read-only cartera list for Paola through Japest. Defaults to latest snapshot, top 30 customers with balance.';


--
-- Name: get_japest_siigo_sync_status(integer); Type: FUNCTION; Schema: strategic_profile; Owner: -
--

CREATE FUNCTION strategic_profile.get_japest_siigo_sync_status(p_limit integer DEFAULT 10) RETURNS TABLE(sync_date date, run_type text, status text, started_at timestamp with time zone, completed_at timestamp with time zone, invoices_count integer, payment_receipts_count integer, changes_count integer, error_message text)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    select
        r.sync_date,
        r.run_type,
        r.status,
        r.started_at,
        r.completed_at,
        r.invoices_count,
        r.payment_receipts_count,
        r.changes_count,
        r.error_message
    from public.siigo_sync_run r
    order by r.started_at desc
    limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;


--
-- Name: FUNCTION get_japest_siigo_sync_status(p_limit integer); Type: COMMENT; Schema: strategic_profile; Owner: -
--

COMMENT ON FUNCTION strategic_profile.get_japest_siigo_sync_status(p_limit integer) IS 'Read-only Siigo sync status for Japest operational answers. No secrets or raw payloads.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    phone text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: customer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    name text,
    identification_type public.idetification_type NOT NULL,
    identification_number text NOT NULL,
    contact text,
    phone text,
    preferred_store text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: distribution_plan; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.distribution_plan (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    plan_date date NOT NULL,
    status public.distribution_plan_status DEFAULT 'planned'::public.distribution_plan_status NOT NULL,
    operator_id uuid,
    notes text,
    cutoff_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    plan_seq integer,
    plan_code text,
    service_fee_percentage numeric DEFAULT '24'::numeric NOT NULL
);


--
-- Name: distribution_plan_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.distribution_plan_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: fulfillment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fulfillment (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sale_item_id uuid NOT NULL,
    purchase_item_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: offer; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.offer (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    price numeric(12,2) NOT NULL,
    available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    distribution_plan_id uuid
);


--
-- Name: operator; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operator (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    phone text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: product; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name character varying(200) NOT NULL,
    description text,
    unit public.unit_type NOT NULL,
    main_photo text,
    reference_price numeric(12,2),
    created_at timestamp with time zone DEFAULT now(),
    siigo_id text
);


--
-- Name: product_reference_price_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_reference_price_history (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    product_name text NOT NULL,
    product_unit public.unit_type NOT NULL,
    old_reference_price numeric,
    new_reference_price numeric,
    distribution_plan_id uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    changed_by uuid
);


--
-- Name: product_with_active_offers; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.product_with_active_offers AS
SELECT
    NULL::uuid AS id,
    NULL::character varying(200) AS name,
    NULL::text AS description,
    NULL::public.unit_type AS unit,
    NULL::numeric(12,2) AS reference_price,
    NULL::text AS main_photo,
    NULL::text AS siigo_id,
    NULL::json AS offers;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    role public.user_role DEFAULT 'customer'::public.user_role NOT NULL,
    name text,
    phone text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchase_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_item (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    purchase_order_id uuid NOT NULL,
    offer_id uuid NOT NULL,
    quantity numeric(12,2) NOT NULL,
    actual_price numeric(12,2),
    received_quantity numeric(12,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: purchase_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    supplier_id uuid NOT NULL,
    distribution_plan_id uuid NOT NULL,
    status public.purchase_order_status DEFAULT 'created'::public.purchase_order_status NOT NULL,
    notes text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    updated_at timestamp with time zone,
    purchase_seq integer,
    purchase_code text
);


--
-- Name: purchase_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.purchase_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sale_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_item (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sale_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    required_quantity numeric(12,2) NOT NULL,
    delivered_quantity numeric(12,2),
    delivered_at timestamp with time zone,
    delivered_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: sale_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_order (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    distribution_plan_id uuid NOT NULL,
    status public.sale_order_status DEFAULT 'pending'::public.sale_order_status NOT NULL,
    service_fee numeric(12,2) DEFAULT 0,
    delivery_fee numeric(12,2) DEFAULT 0,
    notes text,
    created_by_admin_id uuid,
    created_by_customer_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    order_seq integer,
    order_code text,
    service_fee_percentage numeric,
    CONSTRAINT sale_order_exactly_one_creator CHECK (((created_by_admin_id IS NOT NULL) <> (created_by_customer_id IS NOT NULL)))
);


--
-- Name: sale_order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sale_order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shopping_cart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.shopping_cart (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    customer_id uuid NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(12,2) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: siigo_daily_change_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_change_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    change_date date DEFAULT CURRENT_DATE NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    change_type text NOT NULL,
    previous_snapshot_date date,
    current_snapshot_date date NOT NULL,
    previous_raw_hash text,
    current_raw_hash text,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_change_log_change_type_check CHECK ((change_type = ANY (ARRAY['created'::text, 'updated'::text, 'deleted_or_missing'::text, 'unchanged_to_changed'::text]))),
    CONSTRAINT siigo_daily_change_log_entity_type_check CHECK ((entity_type = ANY (ARRAY['invoice'::text, 'invoice_item'::text, 'payment_receipt'::text, 'payment_receipt_item'::text, 'customer_balance'::text, 'daily_indicator'::text])))
);


--
-- Name: TABLE siigo_daily_change_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_change_log IS 'Daily change log for Siigo snapshots, populated by sync jobs using raw_hash comparisons.';


--
-- Name: siigo_daily_customer_balance_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_customer_balance_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    snapshot_date date NOT NULL,
    customer_identification text NOT NULL,
    customer_branch_office integer DEFAULT 0 NOT NULL,
    siigo_customer_id text,
    supabase_customer_id uuid,
    customer_name text,
    invoices_count integer DEFAULT 0 NOT NULL,
    sales_total numeric(18,2) DEFAULT 0 NOT NULL,
    collected_total numeric(18,2) DEFAULT 0 NOT NULL,
    balance_total numeric(18,2) DEFAULT 0 NOT NULL,
    overdue_balance_total numeric(18,2) DEFAULT 0 NOT NULL,
    oldest_due_date date,
    max_days_overdue integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_customer_balance_amounts_check CHECK (((invoices_count >= 0) AND (sales_total >= (0)::numeric) AND (collected_total >= (0)::numeric) AND (balance_total >= (0)::numeric) AND (overdue_balance_total >= (0)::numeric) AND (max_days_overdue >= 0)))
);


--
-- Name: TABLE siigo_daily_customer_balance_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_customer_balance_snapshot IS 'Daily per-customer Siigo rollup: sales, collections, receivable balance, and overdue balance.';


--
-- Name: siigo_daily_indicator_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_indicator_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    snapshot_date date NOT NULL,
    sales_today numeric(18,2) DEFAULT 0 NOT NULL,
    sales_month_to_date numeric(18,2) DEFAULT 0 NOT NULL,
    collections_today numeric(18,2) DEFAULT 0 NOT NULL,
    collections_month_to_date numeric(18,2) DEFAULT 0 NOT NULL,
    accounts_receivable_total numeric(18,2) DEFAULT 0 NOT NULL,
    overdue_receivable_total numeric(18,2) DEFAULT 0 NOT NULL,
    invoices_count integer DEFAULT 0 NOT NULL,
    payment_receipts_count integer DEFAULT 0 NOT NULL,
    customers_with_balance_count integer DEFAULT 0 NOT NULL,
    customers_overdue_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_indicator_amounts_check CHECK (((sales_today >= (0)::numeric) AND (sales_month_to_date >= (0)::numeric) AND (collections_today >= (0)::numeric) AND (collections_month_to_date >= (0)::numeric) AND (accounts_receivable_total >= (0)::numeric) AND (overdue_receivable_total >= (0)::numeric) AND (invoices_count >= 0) AND (payment_receipts_count >= 0) AND (customers_with_balance_count >= 0) AND (customers_overdue_count >= 0)))
);


--
-- Name: TABLE siigo_daily_indicator_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_indicator_snapshot IS 'Daily executive Siigo indicators: sales, collections, accounts receivable, overdue receivables.';


--
-- Name: siigo_daily_invoice_item_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_invoice_item_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    invoice_snapshot_id uuid,
    snapshot_date date NOT NULL,
    siigo_invoice_id text NOT NULL,
    item_index integer NOT NULL,
    siigo_item_id text,
    product_code text,
    product_description text,
    quantity numeric(18,4) DEFAULT 0 NOT NULL,
    unit_price numeric(18,4) DEFAULT 0 NOT NULL,
    discount_percentage numeric(9,4),
    discount_value numeric(18,2),
    line_total numeric(18,2) DEFAULT 0 NOT NULL,
    taxes jsonb DEFAULT '[]'::jsonb NOT NULL,
    raw_hash text NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_invoice_item_snapshot_raw_object_check CHECK ((jsonb_typeof(raw_payload) = 'object'::text))
);


--
-- Name: TABLE siigo_daily_invoice_item_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_invoice_item_snapshot IS 'Daily read-only snapshot of item lines included in Siigo sales invoices.';


--
-- Name: siigo_daily_invoice_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_invoice_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    snapshot_date date NOT NULL,
    siigo_invoice_id text NOT NULL,
    document_id text,
    document_name text,
    prefix text,
    number text,
    full_number text GENERATED ALWAYS AS (btrim(((COALESCE(prefix, ''::text) ||
CASE
    WHEN ((prefix IS NULL) OR (prefix = ''::text)) THEN ''::text
    ELSE '-'::text
END) || COALESCE(number, ''::text)))) STORED,
    invoice_name text,
    invoice_date date,
    customer_id text,
    customer_identification text,
    customer_branch_office integer,
    customer_name text,
    seller_id text,
    total numeric(18,2) DEFAULT 0 NOT NULL,
    balance numeric(18,2) DEFAULT 0 NOT NULL,
    paid_value numeric(18,2) GENERATED ALWAYS AS (GREATEST((COALESCE(total, (0)::numeric) - COALESCE(balance, (0)::numeric)), (0)::numeric)) STORED,
    stamp_status text,
    mail_status text,
    public_url text,
    observations text,
    siigo_created_at timestamp with time zone,
    siigo_updated_at timestamp with time zone,
    raw_hash text NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_invoice_snapshot_amounts_check CHECK (((total >= (0)::numeric) AND (balance >= (0)::numeric))),
    CONSTRAINT siigo_daily_invoice_snapshot_raw_object_check CHECK ((jsonb_typeof(raw_payload) = 'object'::text))
);


--
-- Name: TABLE siigo_daily_invoice_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_invoice_snapshot IS 'Daily read-only snapshot of Siigo sales invoices. Used for sales, cartera, and invoice status history.';


--
-- Name: siigo_daily_payment_receipt_item_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_payment_receipt_item_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    payment_receipt_snapshot_id uuid,
    snapshot_date date NOT NULL,
    siigo_payment_receipt_id text NOT NULL,
    item_index integer NOT NULL,
    due_prefix text,
    due_consecutive text,
    due_quote text,
    due_date date,
    value numeric(18,2) DEFAULT 0 NOT NULL,
    raw_hash text NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_payment_receipt_item_snapshot_amount_check CHECK ((value >= (0)::numeric)),
    CONSTRAINT siigo_daily_payment_receipt_item_snapshot_raw_object_check CHECK ((jsonb_typeof(raw_payload) = 'object'::text))
);


--
-- Name: TABLE siigo_daily_payment_receipt_item_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_payment_receipt_item_snapshot IS 'Invoice/due applications inside each Siigo payment receipt snapshot.';


--
-- Name: siigo_daily_payment_receipt_snapshot; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_daily_payment_receipt_snapshot (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid,
    snapshot_date date NOT NULL,
    siigo_payment_receipt_id text NOT NULL,
    document_id text,
    document_name text,
    number text,
    receipt_name text,
    receipt_date date,
    receipt_type text,
    third_party_id text,
    third_party_identification text,
    third_party_branch_office integer,
    third_party_name text,
    payment_id text,
    payment_name text,
    payment_value numeric(18,2) DEFAULT 0 NOT NULL,
    siigo_created_at timestamp with time zone,
    siigo_updated_at timestamp with time zone,
    raw_hash text NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_daily_payment_receipt_snapshot_amount_check CHECK ((payment_value >= (0)::numeric)),
    CONSTRAINT siigo_daily_payment_receipt_snapshot_raw_object_check CHECK ((jsonb_typeof(raw_payload) = 'object'::text))
);


--
-- Name: TABLE siigo_daily_payment_receipt_snapshot; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_daily_payment_receipt_snapshot IS 'Daily read-only snapshot of Siigo payment receipts. Used for recaudo indicators.';


--
-- Name: siigo_latest_customer_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.siigo_latest_customer_balances AS
 SELECT DISTINCT ON (customer_identification, customer_branch_office) snapshot_date,
    customer_identification,
    customer_branch_office,
    customer_name,
    invoices_count,
    sales_total,
    collected_total,
    balance_total,
    overdue_balance_total,
    oldest_due_date,
    max_days_overdue,
    updated_at
   FROM public.siigo_daily_customer_balance_snapshot
  ORDER BY customer_identification, customer_branch_office, snapshot_date DESC, updated_at DESC;


--
-- Name: VIEW siigo_latest_customer_balances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.siigo_latest_customer_balances IS 'Latest per-customer Siigo balances for cartera reporting.';


--
-- Name: siigo_latest_daily_indicators; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.siigo_latest_daily_indicators AS
 SELECT DISTINCT ON (snapshot_date) snapshot_date,
    sales_today,
    sales_month_to_date,
    collections_today,
    collections_month_to_date,
    accounts_receivable_total,
    overdue_receivable_total,
    invoices_count,
    payment_receipts_count,
    customers_with_balance_count,
    customers_overdue_count,
    updated_at
   FROM public.siigo_daily_indicator_snapshot
  ORDER BY snapshot_date DESC, updated_at DESC;


--
-- Name: VIEW siigo_latest_daily_indicators; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.siigo_latest_daily_indicators IS 'Latest daily Siigo indicators for executive reporting.';


--
-- Name: siigo_latest_open_invoices_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.siigo_latest_open_invoices_summary AS
 SELECT DISTINCT ON (siigo_invoice_id) snapshot_date,
    invoice_date,
    full_number,
    customer_name,
    total,
    balance,
    paid_value,
    stamp_status,
    mail_status,
    updated_at
   FROM public.siigo_daily_invoice_snapshot
  WHERE (balance > (0)::numeric)
  ORDER BY siigo_invoice_id, snapshot_date DESC, updated_at DESC;


--
-- Name: VIEW siigo_latest_open_invoices_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.siigo_latest_open_invoices_summary IS 'Latest open Siigo invoices summary for cartera reporting. Does not expose raw JSON.';


--
-- Name: siigo_sync_run; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.siigo_sync_run (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_type text DEFAULT 'daily_snapshot'::text NOT NULL,
    sync_date date DEFAULT CURRENT_DATE NOT NULL,
    source text DEFAULT 'siigo_api'::text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    window_start timestamp with time zone,
    window_end timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    invoices_count integer DEFAULT 0 NOT NULL,
    invoice_items_count integer DEFAULT 0 NOT NULL,
    payment_receipts_count integer DEFAULT 0 NOT NULL,
    payment_receipt_items_count integer DEFAULT 0 NOT NULL,
    customers_count integer DEFAULT 0 NOT NULL,
    changes_count integer DEFAULT 0 NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT siigo_sync_run_status_check CHECK ((status = ANY (ARRAY['running'::text, 'success'::text, 'partial_success'::text, 'failed'::text]))),
    CONSTRAINT siigo_sync_run_window_check CHECK (((window_start IS NULL) OR (window_end IS NULL) OR (window_start <= window_end)))
);


--
-- Name: TABLE siigo_sync_run; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.siigo_sync_run IS 'Execution log for daily Siigo API syncs into Supabase. One row per sync attempt.';


--
-- Name: supplier; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    name text,
    contact text,
    phone text,
    bank_accounts jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: admin admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_pkey PRIMARY KEY (id);


--
-- Name: admin admin_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_user_id_key UNIQUE (user_id);


--
-- Name: customer customer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_pkey PRIMARY KEY (id);


--
-- Name: customer customer_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_user_id_key UNIQUE (user_id);


--
-- Name: distribution_plan distribution_plan_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_plan
    ADD CONSTRAINT distribution_plan_pkey PRIMARY KEY (id);


--
-- Name: distribution_plan distribution_plan_plan_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_plan
    ADD CONSTRAINT distribution_plan_plan_code_key UNIQUE (plan_code);


--
-- Name: fulfillment fulfillment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment
    ADD CONSTRAINT fulfillment_pkey PRIMARY KEY (id);


--
-- Name: fulfillment fulfillment_sale_item_id_purchase_item_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment
    ADD CONSTRAINT fulfillment_sale_item_id_purchase_item_id_key UNIQUE (sale_item_id, purchase_item_id);


--
-- Name: offer offer_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_pkey PRIMARY KEY (id);


--
-- Name: operator operator_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator
    ADD CONSTRAINT operator_pkey PRIMARY KEY (id);


--
-- Name: operator operator_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator
    ADD CONSTRAINT operator_user_id_key UNIQUE (user_id);


--
-- Name: product product_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_pkey PRIMARY KEY (id);


--
-- Name: product_reference_price_history product_reference_price_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_reference_price_history
    ADD CONSTRAINT product_reference_price_history_pkey PRIMARY KEY (id);


--
-- Name: product product_siigo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product
    ADD CONSTRAINT product_siigo_id_key UNIQUE (siigo_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: purchase_item purchase_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_item
    ADD CONSTRAINT purchase_item_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_pkey PRIMARY KEY (id);


--
-- Name: purchase_order purchase_order_purchase_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_purchase_code_key UNIQUE (purchase_code);


--
-- Name: purchase_order purchase_order_supplier_id_distribution_plan_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_supplier_id_distribution_plan_id_key UNIQUE (supplier_id, distribution_plan_id);


--
-- Name: sale_item sale_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT sale_item_pkey PRIMARY KEY (id);


--
-- Name: sale_item sale_item_sale_order_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT sale_item_sale_order_id_product_id_key UNIQUE (sale_order_id, product_id);


--
-- Name: sale_order sale_order_order_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_order_code_key UNIQUE (order_code);


--
-- Name: sale_order sale_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_pkey PRIMARY KEY (id);


--
-- Name: shopping_cart shopping_cart_customer_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart
    ADD CONSTRAINT shopping_cart_customer_id_product_id_key UNIQUE (customer_id, product_id);


--
-- Name: shopping_cart shopping_cart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart
    ADD CONSTRAINT shopping_cart_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_change_log siigo_daily_change_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_change_log
    ADD CONSTRAINT siigo_daily_change_log_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_customer_balance_snapshot siigo_daily_customer_balance_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_customer_balance_snapshot
    ADD CONSTRAINT siigo_daily_customer_balance_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_customer_balance_snapshot siigo_daily_customer_balance_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_customer_balance_snapshot
    ADD CONSTRAINT siigo_daily_customer_balance_unique UNIQUE (snapshot_date, customer_identification, customer_branch_office);


--
-- Name: siigo_daily_indicator_snapshot siigo_daily_indicator_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_indicator_snapshot
    ADD CONSTRAINT siigo_daily_indicator_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_indicator_snapshot siigo_daily_indicator_snapshot_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_indicator_snapshot
    ADD CONSTRAINT siigo_daily_indicator_snapshot_snapshot_date_key UNIQUE (snapshot_date);


--
-- Name: siigo_daily_invoice_item_snapshot siigo_daily_invoice_item_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_item_snapshot
    ADD CONSTRAINT siigo_daily_invoice_item_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_invoice_item_snapshot siigo_daily_invoice_item_snapshot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_item_snapshot
    ADD CONSTRAINT siigo_daily_invoice_item_snapshot_unique UNIQUE (snapshot_date, siigo_invoice_id, item_index);


--
-- Name: siigo_daily_invoice_snapshot siigo_daily_invoice_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_snapshot
    ADD CONSTRAINT siigo_daily_invoice_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_invoice_snapshot siigo_daily_invoice_snapshot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_snapshot
    ADD CONSTRAINT siigo_daily_invoice_snapshot_unique UNIQUE (snapshot_date, siigo_invoice_id);


--
-- Name: siigo_daily_payment_receipt_item_snapshot siigo_daily_payment_receipt_item_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_item_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_item_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_payment_receipt_item_snapshot siigo_daily_payment_receipt_item_snapshot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_item_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_item_snapshot_unique UNIQUE (snapshot_date, siigo_payment_receipt_id, item_index);


--
-- Name: siigo_daily_payment_receipt_snapshot siigo_daily_payment_receipt_snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_snapshot_pkey PRIMARY KEY (id);


--
-- Name: siigo_daily_payment_receipt_snapshot siigo_daily_payment_receipt_snapshot_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_snapshot_unique UNIQUE (snapshot_date, siigo_payment_receipt_id);


--
-- Name: siigo_sync_run siigo_sync_run_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_sync_run
    ADD CONSTRAINT siigo_sync_run_pkey PRIMARY KEY (id);


--
-- Name: supplier supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_pkey PRIMARY KEY (id);


--
-- Name: supplier supplier_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_user_id_key UNIQUE (user_id);


--
-- Name: offer_one_active_per_product_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX offer_one_active_per_product_supplier_idx ON public.offer USING btree (product_id, supplier_id) WHERE (available = true);


--
-- Name: siigo_daily_change_log_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_change_log_date_idx ON public.siigo_daily_change_log USING btree (change_date DESC, entity_type, entity_id);


--
-- Name: siigo_daily_change_log_once_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX siigo_daily_change_log_once_idx ON public.siigo_daily_change_log USING btree (change_date, entity_type, entity_id, change_type);


--
-- Name: siigo_daily_customer_balance_snapshot_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_customer_balance_snapshot_customer_idx ON public.siigo_daily_customer_balance_snapshot USING btree (customer_identification, snapshot_date DESC);


--
-- Name: siigo_daily_customer_balance_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_customer_balance_snapshot_date_idx ON public.siigo_daily_customer_balance_snapshot USING btree (snapshot_date DESC, balance_total DESC);


--
-- Name: siigo_daily_indicator_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_indicator_snapshot_date_idx ON public.siigo_daily_indicator_snapshot USING btree (snapshot_date DESC);


--
-- Name: siigo_daily_invoice_item_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_item_snapshot_date_idx ON public.siigo_daily_invoice_item_snapshot USING btree (snapshot_date DESC);


--
-- Name: siigo_daily_invoice_item_snapshot_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_item_snapshot_invoice_idx ON public.siigo_daily_invoice_item_snapshot USING btree (siigo_invoice_id, snapshot_date DESC);


--
-- Name: siigo_daily_invoice_item_snapshot_product_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_item_snapshot_product_idx ON public.siigo_daily_invoice_item_snapshot USING btree (product_code, snapshot_date DESC);


--
-- Name: siigo_daily_invoice_snapshot_balance_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_snapshot_balance_idx ON public.siigo_daily_invoice_snapshot USING btree (snapshot_date DESC, balance DESC) WHERE (balance > (0)::numeric);


--
-- Name: siigo_daily_invoice_snapshot_customer_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_snapshot_customer_idx ON public.siigo_daily_invoice_snapshot USING btree (customer_identification, snapshot_date DESC);


--
-- Name: siigo_daily_invoice_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_snapshot_date_idx ON public.siigo_daily_invoice_snapshot USING btree (snapshot_date DESC, invoice_date DESC);


--
-- Name: siigo_daily_invoice_snapshot_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_snapshot_hash_idx ON public.siigo_daily_invoice_snapshot USING btree (siigo_invoice_id, raw_hash, snapshot_date DESC);


--
-- Name: siigo_daily_invoice_snapshot_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_invoice_snapshot_number_idx ON public.siigo_daily_invoice_snapshot USING btree (full_number, snapshot_date DESC);


--
-- Name: siigo_daily_payment_receipt_item_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_payment_receipt_item_snapshot_date_idx ON public.siigo_daily_payment_receipt_item_snapshot USING btree (snapshot_date DESC);


--
-- Name: siigo_daily_payment_receipt_item_snapshot_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_payment_receipt_item_snapshot_due_idx ON public.siigo_daily_payment_receipt_item_snapshot USING btree (due_prefix, due_consecutive, due_quote);


--
-- Name: siigo_daily_payment_receipt_snapshot_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_payment_receipt_snapshot_date_idx ON public.siigo_daily_payment_receipt_snapshot USING btree (snapshot_date DESC, receipt_date DESC);


--
-- Name: siigo_daily_payment_receipt_snapshot_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_payment_receipt_snapshot_hash_idx ON public.siigo_daily_payment_receipt_snapshot USING btree (siigo_payment_receipt_id, raw_hash, snapshot_date DESC);


--
-- Name: siigo_daily_payment_receipt_snapshot_third_party_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_daily_payment_receipt_snapshot_third_party_idx ON public.siigo_daily_payment_receipt_snapshot USING btree (third_party_identification, snapshot_date DESC);


--
-- Name: siigo_sync_run_one_success_per_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX siigo_sync_run_one_success_per_day_idx ON public.siigo_sync_run USING btree (run_type, sync_date) WHERE (status = 'success'::text);


--
-- Name: siigo_sync_run_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_sync_run_status_idx ON public.siigo_sync_run USING btree (status, sync_date DESC);


--
-- Name: siigo_sync_run_sync_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX siigo_sync_run_sync_date_idx ON public.siigo_sync_run USING btree (sync_date DESC, started_at DESC);


--
-- Name: product_with_active_offers _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.product_with_active_offers WITH (security_invoker='on') AS
 SELECT p.id,
    p.name,
    p.description,
    p.unit,
    p.reference_price,
    p.main_photo,
    p.siigo_id,
    json_agg(json_build_object('id', o.id, 'price', o.price, 'available', o.available, 'supplier', json_build_object('id', s.id, 'name', s.name, 'phone', s.phone))) FILTER (WHERE (o.id IS NOT NULL)) AS offers
   FROM ((public.product p
     LEFT JOIN public.offer o ON (((o.product_id = p.id) AND (o.available = true))))
     LEFT JOIN public.supplier s ON ((s.id = o.supplier_id)))
  GROUP BY p.id;


--
-- Name: product product_reference_price_history_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER product_reference_price_history_trigger AFTER UPDATE OF reference_price ON public.product FOR EACH ROW EXECUTE FUNCTION public.log_product_reference_price_change();


--
-- Name: fulfillment trg_cleanup_purchase_items_on_fulfillment_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cleanup_purchase_items_on_fulfillment_delete AFTER DELETE ON public.fulfillment FOR EACH ROW EXECUTE FUNCTION public.cleanup_purchase_items_on_fulfillment_delete();


--
-- Name: distribution_plan trg_set_distribution_plan_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_distribution_plan_code BEFORE INSERT ON public.distribution_plan FOR EACH ROW EXECUTE FUNCTION public.set_distribution_plan_code();


--
-- Name: purchase_order trg_set_purchase_order_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_purchase_order_code BEFORE INSERT ON public.purchase_order FOR EACH ROW EXECUTE FUNCTION public.set_purchase_order_code();


--
-- Name: sale_order trg_set_sale_order_code; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_sale_order_code BEFORE INSERT ON public.sale_order FOR EACH ROW EXECUTE FUNCTION public.set_sale_order_code();


--
-- Name: admin admin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin
    ADD CONSTRAINT admin_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: customer customer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer
    ADD CONSTRAINT customer_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: distribution_plan distribution_plan_operator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.distribution_plan
    ADD CONSTRAINT distribution_plan_operator_id_fkey FOREIGN KEY (operator_id) REFERENCES public.operator(id);


--
-- Name: fulfillment fulfillment_purchase_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment
    ADD CONSTRAINT fulfillment_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES public.purchase_item(id) ON DELETE CASCADE;


--
-- Name: fulfillment fulfillment_sale_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fulfillment
    ADD CONSTRAINT fulfillment_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_item(id) ON DELETE CASCADE;


--
-- Name: offer offer_distribution_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_distribution_plan_id_fkey FOREIGN KEY (distribution_plan_id) REFERENCES public.distribution_plan(id);


--
-- Name: offer offer_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id) ON DELETE RESTRICT;


--
-- Name: offer offer_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.offer
    ADD CONSTRAINT offer_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(id) ON DELETE RESTRICT;


--
-- Name: operator operator_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.operator
    ADD CONSTRAINT operator_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: purchase_item purchase_item_offer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_item
    ADD CONSTRAINT purchase_item_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offer(id);


--
-- Name: purchase_item purchase_item_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_item
    ADD CONSTRAINT purchase_item_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_order(id) ON DELETE CASCADE;


--
-- Name: purchase_order purchase_order_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: purchase_order purchase_order_distribution_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_distribution_plan_id_fkey FOREIGN KEY (distribution_plan_id) REFERENCES public.distribution_plan(id) ON DELETE RESTRICT;


--
-- Name: purchase_order purchase_order_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.supplier(id) ON DELETE RESTRICT;


--
-- Name: purchase_order purchase_order_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order
    ADD CONSTRAINT purchase_order_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: sale_item sale_item_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT sale_item_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id);


--
-- Name: sale_item sale_item_sale_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_item
    ADD CONSTRAINT sale_item_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_order(id) ON DELETE CASCADE;


--
-- Name: sale_order sale_order_created_by_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_created_by_admin_id_fkey FOREIGN KEY (created_by_admin_id) REFERENCES public.admin(id) ON DELETE RESTRICT;


--
-- Name: sale_order sale_order_created_by_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_created_by_customer_id_fkey FOREIGN KEY (created_by_customer_id) REFERENCES public.customer(id) ON DELETE RESTRICT;


--
-- Name: sale_order sale_order_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id);


--
-- Name: sale_order sale_order_distribution_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_order
    ADD CONSTRAINT sale_order_distribution_plan_id_fkey FOREIGN KEY (distribution_plan_id) REFERENCES public.distribution_plan(id);


--
-- Name: shopping_cart shopping_cart_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart
    ADD CONSTRAINT shopping_cart_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE;


--
-- Name: shopping_cart shopping_cart_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.shopping_cart
    ADD CONSTRAINT shopping_cart_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.product(id);


--
-- Name: siigo_daily_change_log siigo_daily_change_log_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_change_log
    ADD CONSTRAINT siigo_daily_change_log_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_customer_balance_snapshot siigo_daily_customer_balance_snapshot_supabase_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_customer_balance_snapshot
    ADD CONSTRAINT siigo_daily_customer_balance_snapshot_supabase_customer_id_fkey FOREIGN KEY (supabase_customer_id) REFERENCES public.customer(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_customer_balance_snapshot siigo_daily_customer_balance_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_customer_balance_snapshot
    ADD CONSTRAINT siigo_daily_customer_balance_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_indicator_snapshot siigo_daily_indicator_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_indicator_snapshot
    ADD CONSTRAINT siigo_daily_indicator_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_invoice_item_snapshot siigo_daily_invoice_item_snapshot_invoice_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_item_snapshot
    ADD CONSTRAINT siigo_daily_invoice_item_snapshot_invoice_snapshot_id_fkey FOREIGN KEY (invoice_snapshot_id) REFERENCES public.siigo_daily_invoice_snapshot(id) ON DELETE CASCADE;


--
-- Name: siigo_daily_invoice_item_snapshot siigo_daily_invoice_item_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_item_snapshot
    ADD CONSTRAINT siigo_daily_invoice_item_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_invoice_snapshot siigo_daily_invoice_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_invoice_snapshot
    ADD CONSTRAINT siigo_daily_invoice_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_payment_receipt_item_snapshot siigo_daily_payment_receipt_it_payment_receipt_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_item_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_it_payment_receipt_snapshot_id_fkey FOREIGN KEY (payment_receipt_snapshot_id) REFERENCES public.siigo_daily_payment_receipt_snapshot(id) ON DELETE CASCADE;


--
-- Name: siigo_daily_payment_receipt_item_snapshot siigo_daily_payment_receipt_item_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_item_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_item_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: siigo_daily_payment_receipt_snapshot siigo_daily_payment_receipt_snapshot_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.siigo_daily_payment_receipt_snapshot
    ADD CONSTRAINT siigo_daily_payment_receipt_snapshot_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.siigo_sync_run(id) ON DELETE SET NULL;


--
-- Name: supplier supplier_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier
    ADD CONSTRAINT supplier_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: admin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin ENABLE ROW LEVEL SECURITY;

--
-- Name: admin admin_self_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_self_all ON public.admin USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: customer authenticated_customer_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_customer_read ON public.customer FOR SELECT TO authenticated USING (true);


--
-- Name: customer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer ENABLE ROW LEVEL SECURITY;

--
-- Name: customer customer_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_admin_all ON public.customer USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: customer customer_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_anon_read ON public.customer FOR SELECT TO anon USING (true);


--
-- Name: distribution_plan; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.distribution_plan ENABLE ROW LEVEL SECURITY;

--
-- Name: distribution_plan distribution_plan_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY distribution_plan_admin_all ON public.distribution_plan USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: distribution_plan distribution_plan_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY distribution_plan_anon_read ON public.distribution_plan FOR SELECT TO anon USING (true);


--
-- Name: fulfillment; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fulfillment ENABLE ROW LEVEL SECURITY;

--
-- Name: fulfillment fulfillment_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfillment_admin_all ON public.fulfillment USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: fulfillment fulfillment_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fulfillment_anon_read ON public.fulfillment FOR SELECT TO anon USING (true);


--
-- Name: offer; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.offer ENABLE ROW LEVEL SECURITY;

--
-- Name: offer offer_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_admin_all ON public.offer USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: offer offer_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY offer_anon_read ON public.offer FOR SELECT TO anon USING (true);


--
-- Name: operator; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.operator ENABLE ROW LEVEL SECURITY;

--
-- Name: operator operator_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operator_admin_all ON public.operator USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: operator operator_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY operator_anon_read ON public.operator FOR SELECT TO anon USING (true);


--
-- Name: product; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product ENABLE ROW LEVEL SECURITY;

--
-- Name: product product_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_admin_all ON public.product USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: product product_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY product_anon_read ON public.product FOR SELECT TO anon USING (true);


--
-- Name: product_reference_price_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_reference_price_history ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_admin_all ON public.profiles USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: profiles profiles_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_anon_read ON public.profiles FOR SELECT TO anon USING (true);


--
-- Name: purchase_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_item ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_item purchase_item_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_item_admin_all ON public.purchase_item USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: purchase_item purchase_item_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_item_anon_read ON public.purchase_item FOR SELECT TO anon USING (true);


--
-- Name: purchase_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order ENABLE ROW LEVEL SECURITY;

--
-- Name: purchase_order purchase_order_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_admin_all ON public.purchase_order USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: purchase_order purchase_order_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY purchase_order_anon_read ON public.purchase_order FOR SELECT TO anon USING (true);


--
-- Name: sale_item; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_item ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_item sale_item_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_item_admin_all ON public.sale_item USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: sale_item sale_item_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_item_anon_read ON public.sale_item FOR SELECT TO anon USING (true);


--
-- Name: sale_order; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sale_order ENABLE ROW LEVEL SECURITY;

--
-- Name: sale_order sale_order_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_order_admin_all ON public.sale_order USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: sale_order sale_order_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sale_order_anon_read ON public.sale_order FOR SELECT TO anon USING (true);


--
-- Name: shopping_cart; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.shopping_cart ENABLE ROW LEVEL SECURITY;

--
-- Name: shopping_cart shopping_cart_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shopping_cart_admin_all ON public.shopping_cart USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: shopping_cart shopping_cart_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY shopping_cart_anon_read ON public.shopping_cart FOR SELECT TO anon USING (true);


--
-- Name: siigo_daily_change_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_change_log ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_customer_balance_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_customer_balance_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_indicator_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_indicator_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_invoice_item_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_invoice_item_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_invoice_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_invoice_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_payment_receipt_item_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_payment_receipt_item_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_daily_payment_receipt_snapshot; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_daily_payment_receipt_snapshot ENABLE ROW LEVEL SECURITY;

--
-- Name: siigo_sync_run; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.siigo_sync_run ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier supplier_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_admin_all ON public.supplier USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


--
-- Name: supplier supplier_anon_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_anon_read ON public.supplier FOR SELECT TO anon USING (true);


--
-- PostgreSQL database dump complete
--

\unrestrict uCKzN5XH4vPGq3PmM8eBfZxtITYl3q1g5Tvla0C9C7MQ3Rwy3olc9eCVAX2lwvN

