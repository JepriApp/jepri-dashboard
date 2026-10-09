-- Tarea 13 (documentacion/chatbot_diseno.md §7): bot_get_active_plan_status.
-- Aísla distribution_plan dentro de la transacción, igual que la Tarea 5.

begin;

select plan(3);

delete from distribution_plan where status = 'planned';

select is(
    (select count(*)::int from bot_get_active_plan_status()),
    0,
    'sin ningún plan en planned, no hay fila (no hay ventana activa)'
);

insert into distribution_plan (plan_date, status, cutoff_at)
values (current_date + 2, 'planned', now() + interval '1 hour');

select is(
    (select is_within_cutoff from bot_get_active_plan_status()),
    true,
    'con cutoff_at futuro, is_within_cutoff es true'
);

update distribution_plan set cutoff_at = now() - interval '1 hour' where status = 'planned';

select is(
    (select is_within_cutoff from bot_get_active_plan_status()),
    false,
    'con cutoff_at pasado, is_within_cutoff es false'
);

select * from finish();

rollback;
