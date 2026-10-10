-- Tarea 26, paso 1: initialize_invoice_review, transition_to_completed_state y
-- simulate_transition_to_completed_state son SECURITY DEFINER y no validan quién llama,
-- pero tenían EXECUTE para PUBLIC y anon (el default de Postgres/Supabase). Con solo la
-- publishable key, que viaja en el navegador, cualquiera podía invocarlas por la API de
-- PostgREST sobre un plan_id (los plan_id son legibles por las políticas *_anon_read).
--
-- Las únicas llamadas reales vienen del panel con sesión de un admin, es decir, del rol
-- `authenticated` (app/protected/distribution-plans/[id]/components/ModifyPlanStatus.tsx).
-- Revisado en pg_stat_statements de Neptuno: ninguna de las 3 la ejecutó nunca `anon` ni
-- `service_role`. Por eso solo se quita PUBLIC y anon; `authenticated`, `service_role` y el
-- dueño (`postgres`) conservan EXECUTE.
--
-- Reversible con: GRANT EXECUTE ON FUNCTION <fn>(uuid) TO PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.initialize_invoice_review(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transition_to_completed_state(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.simulate_transition_to_completed_state(uuid) FROM PUBLIC, anon;

-- Explícito (ya lo tenían): que un futuro REVOKE FROM PUBLIC no dependa de grants implícitos.
GRANT EXECUTE ON FUNCTION public.initialize_invoice_review(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transition_to_completed_state(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_transition_to_completed_state(uuid) TO authenticated, service_role;
