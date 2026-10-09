-- Tarea 19 (documentacion/chatbot_diseno.md §10): bot_interaction_log tiene RLS sin
-- policies desde la Tarea 4 (mismo patrón de siempre) — hace falta una función
-- SECURITY DEFINER para poder insertarle filas desde el bot.
CREATE OR REPLACE FUNCTION public.bot_log_interaction(
    p_customer_id uuid,
    p_channel text,
    p_action text,
    p_payload jsonb,
    p_result jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.bot_interaction_log (customer_id, channel, action, payload, result)
    VALUES (p_customer_id, p_channel, p_action, p_payload, p_result);
$$;

COMMENT ON FUNCTION public.bot_log_interaction(uuid, text, text, jsonb, jsonb) IS 'Inserta una fila de auditoría (§10) por cada acción de dominio del bot (create_order/update_order/cancel_order/search). El llamador (lib/bot/services/audit.ts) nunca debe dejar que un fallo acá interrumpa la respuesta al cliente.';

GRANT EXECUTE ON FUNCTION public.bot_log_interaction(uuid, text, text, jsonb, jsonb) TO anon, authenticated;
