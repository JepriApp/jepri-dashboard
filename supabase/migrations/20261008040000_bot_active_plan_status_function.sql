-- Falta una pieza para la "verificación inicial" de §7 (Tarea 13): el dominio del bot
-- necesita saber si hay plan activo Y si estamos dentro del horario de corte, para
-- decidir si muestra el Menú Principal o el mensaje de "no hay ventana activa" — pero
-- bot_is_within_cutoff (Tarea 6) es un helper interno sin GRANT a anon a propósito
-- (solo lo llaman otras funciones bot_* del mismo dueño). Esta función nueva combina
-- bot_get_active_plan + bot_is_within_cutoff para exponer un solo booleano ya calculado,
-- así el dominio en TypeScript nunca necesita reimplementar la fórmula de §3.2.

CREATE OR REPLACE FUNCTION public.bot_get_active_plan_status()
RETURNS TABLE(plan_id uuid, plan_date date, is_within_cutoff boolean)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT p.plan_id, p.plan_date, public.bot_is_within_cutoff(p.cutoff_at)
    FROM public.bot_get_active_plan() p;
$$;

COMMENT ON FUNCTION public.bot_get_active_plan_status() IS 'Para la verificación inicial del bot (§7): plan activo (§3.1) + si ahora mismo está dentro del horario de corte (§3.2), ya calculado — evita que el dominio en TypeScript reimplemente esa fórmula. Sin resultado -> no hay ningún plan activo en absoluto.';

GRANT EXECUTE ON FUNCTION public.bot_get_active_plan_status() TO anon, authenticated;
