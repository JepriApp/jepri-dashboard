-- Tarea 25: un mismo punto de entrega puede hacer varios pedidos el mismo día.
--
-- 1) bot_create_order ya no rechaza un segundo pedido para el mismo cliente + plan
--    (se elimina ORDER_ALREADY_EXISTS).
-- 2) bot_get_current_order ya no corta en LIMIT 1: devuelve todos los pedidos no
--    cancelados del cliente en el plan vigente, el más antiguo primero. Se mantiene
--    el nombre y la firma a propósito (ahora devuelve un conjunto de filas): así el
--    código nuevo sigue funcionando contra una base que todavía no tiene esta
--    migración, y solo degrada a "un pedido" hasta que se aplique.
--
-- IMPORTANTE: aquel tope era, sin querer, lo que impedía un pedido duplicado por doble
-- toque en "Confirmar" (Telegram manda dos callbacks con update_id distintos). Sin él,
-- bot_create_order se vuelve idempotente de forma explícita: si el mismo cliente creó
-- hace menos de 30 segundos, en el mismo plan, un pedido con exactamente los mismos
-- items, devuelve ese pedido en vez de crear otro. Un advisory lock por cliente
-- serializa las llamadas concurrentes para que la segunda vea la fila de la primera.

CREATE OR REPLACE FUNCTION public.bot_create_order(p_customer_id uuid, p_items jsonb)
RETURNS TABLE(order_id uuid, order_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_plan_id uuid;
    v_cutoff_at timestamptz;
    v_order_id uuid;
    v_order_code text;
BEGIN
    SELECT p.plan_id, p.cutoff_at INTO v_plan_id, v_cutoff_at
    FROM public.bot_get_active_plan() p;

    IF v_plan_id IS NULL THEN
        RAISE EXCEPTION 'NO_ACTIVE_PLAN: no hay un plan de operación activo para recibir pedidos';
    END IF;

    IF NOT public.bot_is_within_cutoff(v_cutoff_at) THEN
        RAISE EXCEPTION 'PAST_CUTOFF: ya pasó la hora límite de hoy para hacer pedidos';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_customer_id::text));

    SELECT so.id, so.order_code INTO v_order_id, v_order_code
    FROM public.sale_order so
    WHERE so.created_by_customer_id = p_customer_id
      AND so.distribution_plan_id = v_plan_id
      AND so.status <> 'cancelled'
      AND so.created_at > now() - interval '30 seconds'
      AND (
          SELECT jsonb_agg(
              jsonb_build_object('product_id', si.product_id, 'quantity', si.required_quantity)
              ORDER BY si.product_id
          )
          FROM public.sale_item si
          WHERE si.sale_order_id = so.id
      ) = (
          SELECT jsonb_agg(
              jsonb_build_object(
                  'product_id', (item->>'product_id')::uuid,
                  'quantity', (item->>'required_quantity')::numeric
              )
              ORDER BY (item->>'product_id')::uuid
          )
          FROM jsonb_array_elements(p_items) AS item
      )
    LIMIT 1;

    IF v_order_id IS NOT NULL THEN
        RETURN QUERY SELECT v_order_id, v_order_code;
        RETURN;
    END IF;

    -- created_by_admin_id se deja NULL a propósito: el CHECK sale_order_exactly_one_creator
    -- exige exactamente uno de los dos "creador" no nulo, y este pedido lo crea el cliente.
    INSERT INTO public.sale_order (customer_id, distribution_plan_id, status, created_by_customer_id)
    VALUES (p_customer_id, v_plan_id, 'pending', p_customer_id)
    RETURNING id, sale_order.order_code INTO v_order_id, v_order_code;

    INSERT INTO public.sale_item (sale_order_id, product_id, required_quantity)
    SELECT v_order_id, (item->>'product_id')::uuid, (item->>'required_quantity')::numeric
    FROM jsonb_array_elements(p_items) AS item;

    RETURN QUERY SELECT v_order_id, v_order_code;
END;
$$;

COMMENT ON FUNCTION public.bot_create_order(uuid, jsonb) IS 'Crea un sale_order + sus sale_item en una sola transacción, atado al plan activo (§3.1). p_items: [{"product_id": uuid, "required_quantity": numeric}, ...]. Un cliente puede tener varios pedidos en el mismo plan (Tarea 25); un reintento idéntico dentro de 30 s devuelve el pedido ya creado en vez de duplicarlo. Errores: NO_ACTIVE_PLAN, PAST_CUTOFF.';

CREATE OR REPLACE FUNCTION public.bot_get_current_order(p_customer_id uuid)
RETURNS TABLE(order_id uuid, order_code text, status text, items jsonb)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        so.id,
        so.order_code,
        so.status::text,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'product_id', si.product_id,
                'product_name', p.name,
                'unit', p.unit,
                'required_quantity', si.required_quantity
            ))
            FROM public.sale_item si
            JOIN public.product p ON p.id = si.product_id
            WHERE si.sale_order_id = so.id
        )
    FROM public.sale_order so
    WHERE so.created_by_customer_id = p_customer_id
      AND so.distribution_plan_id = (SELECT plan_id FROM public.bot_get_active_plan())
      AND so.status <> 'cancelled'
    ORDER BY so.created_at, so.id;
$$;

COMMENT ON FUNCTION public.bot_get_current_order(uuid) IS 'Pedidos activos (no cancelados) del cliente en el plan vigente (bot_get_active_plan), no en todo su historial, el más antiguo primero (Tarea 25: puede haber varios). Sin filas -> el cliente no tiene pedido hoy. Cada item incluye product_name/unit.';
