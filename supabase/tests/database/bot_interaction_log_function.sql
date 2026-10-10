-- Tarea 19 (documentacion/chatbot_diseno.md §10): bot_log_interaction.
-- Usa el customer de prueba de la Tarea 1 (whatsapp_id=8703567026).

begin;

select plan(5);

select bot_log_interaction(
    '28679e91-8caa-45f4-b5f5-3ed04f9decf9',
    'telegram',
    'create_order',
    '{"items": [{"product_id": "p1", "required_quantity": 3}]}'::jsonb,
    '{"order_id": "order-test", "order_code": "9999"}'::jsonb
);

select is(
    (select count(*)::int from bot_interaction_log
     where customer_id = '28679e91-8caa-45f4-b5f5-3ed04f9decf9' and action = 'create_order'),
    1,
    'bot_log_interaction inserta exactamente una fila'
);
select is(
    (select channel from bot_interaction_log
     where customer_id = '28679e91-8caa-45f4-b5f5-3ed04f9decf9' and action = 'create_order'),
    'telegram',
    'bot_log_interaction guarda el channel'
);
select is(
    (select result->>'order_code' from bot_interaction_log
     where customer_id = '28679e91-8caa-45f4-b5f5-3ed04f9decf9' and action = 'create_order'),
    '9999',
    'bot_log_interaction guarda el result tal cual'
);

-- customer_id nulo (ej. no se pudo resolver el cliente antes de loguear) no debe fallar
-- por la FK — la columna es nullable a propósito (ON DELETE SET NULL).
select lives_ok(
    $$ select bot_log_interaction(NULL, 'telegram', 'search', '{"query": "tomate"}'::jsonb, '{"count": 0}'::jsonb) $$,
    'bot_log_interaction acepta customer_id NULL sin lanzar'
);
select is(
    (select count(*)::int from bot_interaction_log where customer_id is null and action = 'search'),
    1,
    'la fila con customer_id NULL también quedó insertada'
);

select * from finish();

rollback;
