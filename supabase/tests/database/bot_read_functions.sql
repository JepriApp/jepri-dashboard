-- Tarea 5 (documentacion/chatbot_diseno.md §5): las 6 funciones de lectura.
-- Usa el customer de prueba de la Tarea 1 (whatsapp_id=8703567026). Aísla el estado de
-- distribution_plan/sale_order dentro de la misma transacción para que el resultado no
-- dependa de qué otros planes/pedidos existan ya en staging — todo se revierte al final.

begin;

select plan(18);

-- 1. bot_resolve_customer ---------------------------------------------------

select is(
    (select name from bot_resolve_customer('8703567026')),
    'Cliente de prueba (bot Telegram)',
    'bot_resolve_customer encuentra al cliente de prueba por whatsapp_id'
);
select is(
    (select count(*)::int from bot_resolve_customer('no-existe-este-id')),
    0,
    'bot_resolve_customer sin match devuelve vacío (se ignora en silencio, no es un error)'
);

-- Tarea 16: un mismo whatsapp_id puede representar a varios customer (varios clientes
-- o puntos de entrega compartiendo un número) — bot_resolve_customer debe devolver
-- todas las filas que calcen, no solo una.
insert into customer (name, identification_type, identification_number, whatsapp_id)
values ('Cliente de prueba (segundo punto de entrega, Tarea 16)', 'CC', '999999999-test-tarea16', '8703567026');

select is(
    (select count(*)::int from bot_resolve_customer('8703567026')),
    2,
    'bot_resolve_customer devuelve las 2 filas cuando 2 customer comparten whatsapp_id (Tarea 16)'
);

-- 2. bot_validate_api_key ---------------------------------------------------

select is(
    bot_validate_api_key('hash-inexistente'),
    false,
    'bot_validate_api_key sin match devuelve false'
);

insert into bot_api_key (name, key_hash) values ('test-adapter', 'hash-de-prueba-tarea-5');

select is(
    bot_validate_api_key('hash-de-prueba-tarea-5'),
    true,
    'bot_validate_api_key con key activa devuelve true'
);

update bot_api_key set revoked_at = now() where key_hash = 'hash-de-prueba-tarea-5';

select is(
    bot_validate_api_key('hash-de-prueba-tarea-5'),
    false,
    'bot_validate_api_key con key revocada devuelve false'
);

-- 3. bot_get_active_plan -----------------------------------------------------
-- Aísla distribution_plan para probar la lógica de selección sin depender de qué
-- otros planes existan ya en staging.

delete from distribution_plan where status = 'planned';

insert into distribution_plan (plan_date, status) values
    (current_date + 5, 'planned'),
    (current_date + 2, 'planned'),
    (current_date + 1, 'preparing');

select is(
    (select plan_date from bot_get_active_plan()),
    (current_date + 2),
    'bot_get_active_plan elige el planned más próximo, ignorando otros estados y fechas más lejanas'
);

-- deja un único plan 'planned' limpio para los tests de pedido de abajo
delete from distribution_plan where status = 'planned';
insert into distribution_plan (plan_date, status) values (current_date + 2, 'planned');

-- 4. bot_get_current_order / bot_get_frequent_products -----------------------

insert into sale_order (customer_id, distribution_plan_id, status, created_by_customer_id)
values (
    '28679e91-8caa-45f4-b5f5-3ed04f9decf9',
    (select id from distribution_plan where status = 'planned'),
    'pending',
    '28679e91-8caa-45f4-b5f5-3ed04f9decf9'
);

insert into sale_item (sale_order_id, product_id, required_quantity)
values (
    (select id from sale_order where created_by_customer_id = '28679e91-8caa-45f4-b5f5-3ed04f9decf9'),
    (select id from product where name ilike '%tomate%' limit 1),
    3
);

select is(
    (select count(*)::int from bot_get_current_order('28679e91-8caa-45f4-b5f5-3ed04f9decf9')),
    1,
    'bot_get_current_order encuentra el pedido en el plan activo'
);
select is(
    (select jsonb_array_length(items) from bot_get_current_order('28679e91-8caa-45f4-b5f5-3ed04f9decf9')),
    1,
    'bot_get_current_order devuelve los items del pedido'
);
select ok(
    (select items->0->>'product_name' from bot_get_current_order('28679e91-8caa-45f4-b5f5-3ed04f9decf9')) ilike '%tomate%'
    and (select items->0->>'unit' from bot_get_current_order('28679e91-8caa-45f4-b5f5-3ed04f9decf9')) is not null,
    'bot_get_current_order incluye product_name/unit por item (Tarea 17, para reusar en el flujo de editar)'
);
select is(
    (select times_ordered from bot_get_frequent_products('28679e91-8caa-45f4-b5f5-3ed04f9decf9') limit 1),
    1,
    'bot_get_frequent_products cuenta el pedido recién creado'
);

update sale_order set status = 'cancelled'
where created_by_customer_id = '28679e91-8caa-45f4-b5f5-3ed04f9decf9';

select is(
    (select count(*)::int from bot_get_current_order('28679e91-8caa-45f4-b5f5-3ed04f9decf9')),
    0,
    'bot_get_current_order ignora pedidos cancelados'
);
select is(
    (select count(*)::int from bot_get_frequent_products('28679e91-8caa-45f4-b5f5-3ed04f9decf9')),
    0,
    'bot_get_frequent_products ignora pedidos cancelados'
);

-- 5. bot_search_catalog: ambas ramas (con y sin unaccent) --------------------

select ok(
    (select count(*)::int from bot_search_catalog('pina', 20)) > 0,
    'bot_search_catalog con unaccent instalada encuentra "Piña" buscando "pina" sin tilde'
);
select ok(
    (select count(*)::int from bot_search_catalog('pimenton', 20)) > 0,
    'bot_search_catalog con unaccent sigue encontrando coincidencias sin acento de por medio'
);

drop extension unaccent;

-- "Espinaca" sigue apareciendo (contiene "pina" como subcadena literal, sin acento de
-- por medio — eso es ILIKE normal, no un bug); lo que debe desaparecer es "Piña", que
-- solo matchea gracias al plegado de acentos de unaccent.
select ok(
    not exists (
        select 1 from bot_search_catalog('pina', 20) where canonical_name ILIKE 'Piña%'
    ),
    'bot_search_catalog SIN unaccent ya no encuentra "Piña" buscando "pina" (fallback a ILIKE simple)'
);
select ok(
    (select count(*)::int from bot_search_catalog('pimenton', 20)) > 0,
    'bot_search_catalog SIN unaccent sigue funcionando para coincidencias exactas (no se rompe sin la extensión)'
);
select ok(
    (select count(*)::int from bot_search_catalog('producto-que-no-existe-xyz', 5)) = 0,
    'bot_search_catalog sin resultados devuelve vacío, no un error'
);

select * from finish();

rollback;
