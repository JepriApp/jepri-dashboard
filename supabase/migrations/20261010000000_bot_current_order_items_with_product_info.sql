-- Tarea 17 (flujo "modificar pedido"): bot_get_current_order devolvía cada item como
-- {product_id, required_quantity} nada más — para reutilizar el flujo de crear pedido
-- al editar (lib/bot/flows/createOrder.ts, PendingItem) hace falta también el nombre y
-- la unidad, los mismos que ya expone bot_get_frequent_products/bot_search_catalog.
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
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.bot_get_current_order(uuid) IS 'Pedido activo del cliente en el plan vigente (bot_get_active_plan), no en todo su historial. Sin resultado -> el cliente no tiene pedido hoy. Cada item incluye product_name/unit (Tarea 17) para poder reutilizarlo tal cual en el flujo de editar.';
