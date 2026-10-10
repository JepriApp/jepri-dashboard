-- Tarea 6 (documentacion/chatbot_diseno.md §3.1-§3.4, §5): bot_create_order,
-- bot_update_order, bot_cancel_order. Usa throws_like() de pgTAP para los 8 códigos de
-- error (evita abortar la transacción completa — pgTAP captura la excepción en su propia
-- sub-transacción). SAVEPOINT/ROLLBACK TO alrededor de cada escenario que rompe estado a
-- propósito (status/plan inválido), para no afectar los asserts siguientes.

begin;

select plan(20);

select (select id from product where name ilike '%tomate%' limit 1) as tomato_id \gset
select (select id from product where name ilike '%cebolla%' limit 1) as onion_id \gset
\set customer_id '28679e91-8caa-45f4-b5f5-3ed04f9decf9'
\set admin_id '4bf66b12-1ef7-499a-ba04-2f35fae22b8f'

-- --- bot_create_order --------------------------------------------------------

-- sin ningún plan 'planned' -> NO_ACTIVE_PLAN
delete from distribution_plan where status = 'planned';

select throws_like(
    format('select bot_create_order(%L::uuid, %L::jsonb)', :'customer_id', '[]'),
    'NO_ACTIVE_PLAN%',
    'bot_create_order sin plan activo lanza NO_ACTIVE_PLAN'
);

-- plan activo pero con cutoff ya pasado -> PAST_CUTOFF
insert into distribution_plan (plan_date, status, cutoff_at)
values (current_date + 2, 'planned', now() - interval '1 hour')
returning id as active_plan_id \gset

select throws_like(
    format('select bot_create_order(%L::uuid, %L::jsonb)', :'customer_id', '[]'),
    'PAST_CUTOFF%',
    'bot_create_order después del cutoff lanza PAST_CUTOFF'
);

update distribution_plan set cutoff_at = now() + interval '1 hour' where id = :'active_plan_id';

-- camino feliz
select order_id as created_order_id, order_code as created_order_code
from bot_create_order(
    :'customer_id'::uuid,
    jsonb_build_array(jsonb_build_object('product_id', :'tomato_id'::text, 'required_quantity', 3))
) \gset

select is(
    (select status::text from sale_order where id = :'created_order_id'::uuid),
    'pending',
    'bot_create_order crea el pedido (camino feliz)'
);
select is(
    (select count(*)::int from sale_item where sale_order_id = :'created_order_id'::uuid),
    1,
    'bot_create_order inserta los sale_item de p_items'
);
select ok(
    (select created_by_admin_id from sale_order where id = :'created_order_id'::uuid) IS NULL,
    'bot_create_order nunca setea created_by_admin_id'
);
select is(
    (select created_by_customer_id from sale_order where id = :'created_order_id')::text,
    :'customer_id',
    'bot_create_order setea created_by_customer_id'
);

-- ya hay un pedido activo en ese plan -> ORDER_ALREADY_EXISTS
select throws_like(
    format('select bot_create_order(%L::uuid, %L::jsonb)', :'customer_id', '[]'),
    'ORDER_ALREADY_EXISTS%',
    'bot_create_order con un pedido ya activo lanza ORDER_ALREADY_EXISTS'
);

-- fórmula del fallback de horario (§3.2) sin cutoff_at — se recalcula con la misma
-- fórmula en vez de un valor fijo, así el test no depende de qué día corra.
select is(
    bot_is_within_cutoff(NULL),
    (
        extract(isodow FROM (now() AT TIME ZONE 'America/Bogota')) IN (1, 3, 5)
        AND (now() AT TIME ZONE 'America/Bogota')::time < time '21:00'
    ),
    'bot_is_within_cutoff(NULL) coincide con la fórmula de fallback lunes/miércoles/viernes antes de las 9pm'
);

-- --- bot_update_order ---------------------------------------------------------

select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', gen_random_uuid()::text, :'customer_id', '[]'),
    'ORDER_NOT_FOUND%',
    'bot_update_order con un order_id inexistente lanza ORDER_NOT_FOUND'
);
select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', :'created_order_id', gen_random_uuid()::text, '[]'),
    'ORDER_NOT_FOUND%',
    'bot_update_order con el customer_id de otro cliente lanza ORDER_NOT_FOUND'
);

insert into sale_order (customer_id, distribution_plan_id, status, created_by_admin_id)
values (:'customer_id'::uuid, :'active_plan_id'::uuid, 'pending', :'admin_id'::uuid)
returning id as admin_order_id \gset

select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', :'admin_order_id', :'customer_id', '[]'),
    'ORDER_NOT_FOUND%',
    'bot_update_order sobre un pedido creado por un admin lanza ORDER_NOT_FOUND (ownership estricto)'
);

-- camino feliz: reemplaza los items por completo
select bot_update_order(
    :'created_order_id'::uuid,
    :'customer_id'::uuid,
    jsonb_build_array(
        jsonb_build_object('product_id', :'tomato_id'::text, 'required_quantity', 1),
        jsonb_build_object('product_id', :'onion_id'::text, 'required_quantity', 2)
    )
);
select is(
    (select count(*)::int from sale_item where sale_order_id = :'created_order_id'),
    2,
    'bot_update_order reemplaza los sale_item por los nuevos de p_items'
);

savepoint sp_not_editable;
update sale_order set status = 'delivered' where id = :'created_order_id';
select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', :'created_order_id', :'customer_id', '[]'),
    'ORDER_NOT_EDITABLE%',
    'bot_update_order sobre un pedido delivered lanza ORDER_NOT_EDITABLE'
);
rollback to savepoint sp_not_editable;

savepoint sp_plan_not_editable;
update distribution_plan set status = 'preparing' where id = :'active_plan_id';
select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', :'created_order_id', :'customer_id', '[]'),
    'PLAN_NOT_EDITABLE%',
    'bot_update_order cuando el plan ya no está planned lanza PLAN_NOT_EDITABLE'
);
rollback to savepoint sp_plan_not_editable;

savepoint sp_cutoff;
update distribution_plan set cutoff_at = now() - interval '1 hour' where id = :'active_plan_id';
select throws_like(
    format('select bot_update_order(%L::uuid, %L::uuid, %L::jsonb)', :'created_order_id', :'customer_id', '[]'),
    'PAST_CUTOFF%',
    'bot_update_order después del cutoff lanza PAST_CUTOFF'
);
rollback to savepoint sp_cutoff;

-- --- bot_cancel_order -----------------------------------------------------------

select throws_like(
    format('select bot_cancel_order(%L::uuid, %L::uuid)', gen_random_uuid()::text, :'customer_id'),
    'ORDER_NOT_FOUND%',
    'bot_cancel_order con un order_id inexistente lanza ORDER_NOT_FOUND'
);

savepoint sp_plan_not_cancellable;
update distribution_plan set status = 'preparing' where id = :'active_plan_id';
select throws_like(
    format('select bot_cancel_order(%L::uuid, %L::uuid)', :'created_order_id', :'customer_id'),
    'PLAN_NOT_CANCELLABLE%',
    'bot_cancel_order cuando el plan ya no está planned lanza PLAN_NOT_CANCELLABLE'
);
rollback to savepoint sp_plan_not_cancellable;

-- cancelar funciona aunque ya haya pasado el horario de corte (§3.4: sin chequeo de cutoff)
update distribution_plan set cutoff_at = now() - interval '1 hour' where id = :'active_plan_id';

select bot_cancel_order(:'created_order_id'::uuid, :'customer_id'::uuid);

select is(
    (select status::text from sale_order where id = :'created_order_id'),
    'cancelled',
    'bot_cancel_order deja el pedido en status=cancelled, incluso después del cutoff'
);
select is(
    (select count(*)::int from sale_order where id = :'created_order_id'),
    1,
    'bot_cancel_order nunca ejecuta DELETE — la fila sigue existiendo'
);

select throws_like(
    format('select bot_cancel_order(%L::uuid, %L::uuid)', :'created_order_id', :'customer_id'),
    'ORDER_NOT_CANCELLABLE%',
    'bot_cancel_order sobre un pedido ya cancelado lanza ORDER_NOT_CANCELLABLE'
);

select * from finish();

rollback;
