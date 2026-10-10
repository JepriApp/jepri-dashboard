-- Tarea 26, paso 1: las funciones de transición de plan ya no son ejecutables por anon,
-- pero el panel (authenticated), service_role y el dueño las siguen ejecutando.

begin;

select plan(12);

select is(
    has_function_privilege('anon', 'public.initialize_invoice_review(uuid)', 'execute'),
    false,
    'anon no puede ejecutar initialize_invoice_review'
);
select is(
    has_function_privilege('anon', 'public.transition_to_completed_state(uuid)', 'execute'),
    false,
    'anon no puede ejecutar transition_to_completed_state'
);
select is(
    has_function_privilege('anon', 'public.simulate_transition_to_completed_state(uuid)', 'execute'),
    false,
    'anon no puede ejecutar simulate_transition_to_completed_state'
);

select is(
    has_function_privilege('authenticated', 'public.initialize_invoice_review(uuid)', 'execute'),
    true,
    'authenticated (el panel) sigue pudiendo ejecutar initialize_invoice_review'
);
select is(
    has_function_privilege('authenticated', 'public.transition_to_completed_state(uuid)', 'execute'),
    true,
    'authenticated (el panel) sigue pudiendo ejecutar transition_to_completed_state'
);
select is(
    has_function_privilege('authenticated', 'public.simulate_transition_to_completed_state(uuid)', 'execute'),
    true,
    'authenticated (el panel) sigue pudiendo ejecutar simulate_transition_to_completed_state'
);

select is(
    has_function_privilege('service_role', 'public.initialize_invoice_review(uuid)', 'execute'),
    true,
    'service_role sigue pudiendo ejecutar initialize_invoice_review'
);
select is(
    has_function_privilege('service_role', 'public.transition_to_completed_state(uuid)', 'execute'),
    true,
    'service_role sigue pudiendo ejecutar transition_to_completed_state'
);
select is(
    has_function_privilege('service_role', 'public.simulate_transition_to_completed_state(uuid)', 'execute'),
    true,
    'service_role sigue pudiendo ejecutar simulate_transition_to_completed_state'
);

-- un rol cualquiera, sin grants propios, tampoco entra por PUBLIC
create role anon_plan_probe nologin;

select is(
    has_function_privilege('anon_plan_probe', 'public.initialize_invoice_review(uuid)', 'execute'),
    false,
    'PUBLIC ya no tiene EXECUTE sobre initialize_invoice_review'
);
select is(
    has_function_privilege('anon_plan_probe', 'public.transition_to_completed_state(uuid)', 'execute'),
    false,
    'PUBLIC ya no tiene EXECUTE sobre transition_to_completed_state'
);
select is(
    has_function_privilege('anon_plan_probe', 'public.simulate_transition_to_completed_state(uuid)', 'execute'),
    false,
    'PUBLIC ya no tiene EXECUTE sobre simulate_transition_to_completed_state'
);

select * from finish();

rollback;
