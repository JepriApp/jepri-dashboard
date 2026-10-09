-- Lectura/escritura de bot_conversation_state (§8, Tarea 14). Misma historia que las
-- Tareas 5/6/12/13: la tabla tiene RLS sin ninguna policy, así que la clave anon
-- necesita una función SECURITY DEFINER para tocarla.
--
-- La expiración por inactividad (15 min, §8) se calcula en TypeScript
-- (lib/bot/services/conversation.ts), no acá — así se puede probar con tiempo
-- simulado (vi.useFakeTimers) sin depender de manipular now() en Postgres. Esta
-- función solo devuelve el estado crudo tal cual está guardado.

CREATE OR REPLACE FUNCTION public.bot_get_conversation_state(p_customer_id uuid, p_channel text)
RETURNS TABLE(state text, context jsonb, updated_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT bcs.state, bcs.context, bcs.updated_at
    FROM public.bot_conversation_state bcs
    WHERE bcs.customer_id = p_customer_id
      AND bcs.channel = p_channel;
$$;

COMMENT ON FUNCTION public.bot_get_conversation_state(uuid, text) IS 'Estado crudo de la conversación (§8), sin aplicar la expiración de 15 minutos — eso lo hace la capa de servicio en TypeScript. Sin fila -> el cliente nunca tuvo un estado guardado para este canal.';

GRANT EXECUTE ON FUNCTION public.bot_get_conversation_state(uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bot_set_conversation_state(
    p_customer_id uuid,
    p_channel text,
    p_state text,
    p_context jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.bot_conversation_state (customer_id, channel, state, context, updated_at)
    VALUES (p_customer_id, p_channel, p_state, p_context, now())
    ON CONFLICT (customer_id, channel)
    DO UPDATE SET
        state = EXCLUDED.state,
        context = EXCLUDED.context,
        updated_at = now();
$$;

COMMENT ON FUNCTION public.bot_set_conversation_state(uuid, text, text, jsonb) IS 'Persiste una transición de estado de conversación (§8) — una fila por (customer_id, channel), se sobreescribe en cada paso (no acumula historial; el historial va en bot_interaction_log).';

GRANT EXECUTE ON FUNCTION public.bot_set_conversation_state(uuid, text, text, jsonb) TO anon, authenticated;
