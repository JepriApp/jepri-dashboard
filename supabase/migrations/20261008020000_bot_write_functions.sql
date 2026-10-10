-- Funciones de escritura transaccionales del bot (documentacion/chatbot_diseno.md §5,
-- Tarea 6 de tasks/todo.md): bot_create_order, bot_update_order, bot_cancel_order.
-- Cada una es una sola función = una sola transacción (atómica), a diferencia del flujo
-- admin actual (EditSaleOrderModal.tsx / create/page.tsx) que hace varios inserts/updates
-- sueltos desde el cliente. SECURITY DEFINER + search_path fijo, igual que la Tarea 5.
--
-- Convención de errores (§5/§7): cada RAISE EXCEPTION usa un código estable antes del
-- primer ":" — la capa de servicio (Tarea 6 de la Fase 2) parsea ese prefijo y nunca deja
-- pasar el texto SQL crudo al cliente.

-- Helper interno (no se expone al bot — solo lo llaman las funciones de abajo, que ya
-- corren con los privilegios del dueño; no necesita su propio GRANT). Implementa §3.2:
-- válido mientras now() < cutoff_at si está seteado, si no, fallback al lunes/miércoles/
-- viernes antes de las 9pm hora Colombia que pide la spec original.
CREATE OR REPLACE FUNCTION public.bot_is_within_cutoff(p_cutoff_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT CASE
        WHEN p_cutoff_at IS NOT NULL THEN now() < p_cutoff_at
        ELSE
            extract(isodow FROM (now() AT TIME ZONE 'America/Bogota')) IN (1, 3, 5)
            AND (now() AT TIME ZONE 'America/Bogota')::time < time '21:00'
    END;
$$;

COMMENT ON FUNCTION public.bot_is_within_cutoff(timestamptz) IS 'Helper interno (§3.2): ventana de horario válida para crear/editar un pedido. No se otorga a anon/authenticated — solo lo llaman las funciones bot_* que ya corren como su dueño.';

-- 1. Crear pedido (§3.1-§3.3).

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

    IF EXISTS (
        SELECT 1 FROM public.sale_order so
        WHERE so.created_by_customer_id = p_customer_id
          AND so.distribution_plan_id = v_plan_id
          AND so.status <> 'cancelled'
    ) THEN
        RAISE EXCEPTION 'ORDER_ALREADY_EXISTS: ya tienes un pedido para el próximo plan de entrega';
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

COMMENT ON FUNCTION public.bot_create_order(uuid, jsonb) IS 'Crea un sale_order + sus sale_item en una sola transacción, atado al plan activo (§3.1). p_items: [{"product_id": uuid, "required_quantity": numeric}, ...]. Errores: NO_ACTIVE_PLAN, PAST_CUTOFF, ORDER_ALREADY_EXISTS.';

GRANT EXECUTE ON FUNCTION public.bot_create_order(uuid, jsonb) TO anon, authenticated;

-- 2. Modificar pedido existente (§3.4) — replace completo y atómico de sale_item.

CREATE OR REPLACE FUNCTION public.bot_update_order(p_order_id uuid, p_customer_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status public.sale_order_status;
    v_plan_status public.distribution_plan_status;
    v_cutoff_at timestamptz;
BEGIN
    -- el join con created_by_customer_id = p_customer_id hace que un id inexistente, de
    -- otro cliente, o de un pedido creado por un admin (created_by_customer_id null) caiga
    -- siempre en el mismo ORDER_NOT_FOUND — ownership estricto, nunca toca lo del admin.
    SELECT so.status, dp.status, dp.cutoff_at
    INTO v_status, v_plan_status, v_cutoff_at
    FROM public.sale_order so
    JOIN public.distribution_plan dp ON dp.id = so.distribution_plan_id
    WHERE so.id = p_order_id
      AND so.created_by_customer_id = p_customer_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: no se encontró el pedido';
    END IF;

    IF v_status IN ('cancelled', 'delivered', 'out_for_delivery') THEN
        RAISE EXCEPTION 'ORDER_NOT_EDITABLE: este pedido ya no se puede modificar';
    END IF;

    IF v_plan_status <> 'planned' THEN
        RAISE EXCEPTION 'PLAN_NOT_EDITABLE: el plan de este pedido ya no acepta cambios';
    END IF;

    IF NOT public.bot_is_within_cutoff(v_cutoff_at) THEN
        RAISE EXCEPTION 'PAST_CUTOFF: ya pasó la hora límite de hoy para modificar pedidos';
    END IF;

    DELETE FROM public.sale_item WHERE sale_order_id = p_order_id;

    INSERT INTO public.sale_item (sale_order_id, product_id, required_quantity)
    SELECT p_order_id, (item->>'product_id')::uuid, (item->>'required_quantity')::numeric
    FROM jsonb_array_elements(p_items) AS item;
END;
$$;

COMMENT ON FUNCTION public.bot_update_order(uuid, uuid, jsonb) IS 'Reemplaza por completo los sale_item de un pedido propio del cliente, en una sola transacción. Errores: ORDER_NOT_FOUND, ORDER_NOT_EDITABLE, PLAN_NOT_EDITABLE, PAST_CUTOFF.';

GRANT EXECUTE ON FUNCTION public.bot_update_order(uuid, uuid, jsonb) TO anon, authenticated;

-- 3. Cancelar pedido existente (§3.4) — soft-cancel, nunca DELETE. Solo pedidos propios
-- del cliente (created_by_customer_id); el panel admin sigue usando DELETE sin cambios.

CREATE OR REPLACE FUNCTION public.bot_cancel_order(p_order_id uuid, p_customer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status public.sale_order_status;
    v_plan_status public.distribution_plan_status;
BEGIN
    SELECT so.status, dp.status
    INTO v_status, v_plan_status
    FROM public.sale_order so
    JOIN public.distribution_plan dp ON dp.id = so.distribution_plan_id
    WHERE so.id = p_order_id
      AND so.created_by_customer_id = p_customer_id;

    IF v_status IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: no se encontró el pedido';
    END IF;

    IF v_status IN ('cancelled', 'delivered', 'out_for_delivery') THEN
        RAISE EXCEPTION 'ORDER_NOT_CANCELLABLE: este pedido ya no se puede cancelar';
    END IF;

    IF v_plan_status <> 'planned' THEN
        RAISE EXCEPTION 'PLAN_NOT_CANCELLABLE: el plan de este pedido ya no admite cancelaciones';
    END IF;

    -- Sin chequeo de cutoff a propósito (§3.4): cancelar se permite a cualquier hora
    -- mientras el plan siga en 'planned'.
    UPDATE public.sale_order SET status = 'cancelled' WHERE id = p_order_id;
END;
$$;

COMMENT ON FUNCTION public.bot_cancel_order(uuid, uuid) IS 'Soft-cancel (status=cancelled) de un pedido propio del cliente — nunca DELETE. Errores: ORDER_NOT_FOUND, ORDER_NOT_CANCELLABLE, PLAN_NOT_CANCELLABLE.';

GRANT EXECUTE ON FUNCTION public.bot_cancel_order(uuid, uuid) TO anon, authenticated;
