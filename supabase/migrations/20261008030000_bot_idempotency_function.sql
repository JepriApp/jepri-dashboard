-- Función faltante para la idempotencia del webhook (§9, Tarea 12). bot_processed_update
-- tiene RLS sin ninguna policy (Tarea 4, §11) — el webhook usa la clave anon (nunca
-- service_role), así que necesita una función SECURITY DEFINER para insertar ahí, igual
-- que el resto de las tablas del bot. No estaba en la lista original de la Tarea 5/6
-- porque el diseño (§9) describía el INSERT ... ON CONFLICT como SQL plano sin notar que
-- también necesita pasar por una función — se corrige acá.

CREATE OR REPLACE FUNCTION public.bot_mark_update_processed(p_channel text, p_update_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.bot_processed_update (channel, update_id)
    VALUES (p_channel, p_update_id)
    ON CONFLICT (channel, update_id) DO NOTHING;

    RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.bot_mark_update_processed(text, text) IS 'Idempotencia de updates de canal (§9): intenta marcar (channel, update_id) como procesado. true = primera vez (seguir procesando), false = ya existía (responder 200 sin reprocesar, no llamar ningún otro servicio).';

GRANT EXECUTE ON FUNCTION public.bot_mark_update_processed(text, text) TO anon, authenticated;
