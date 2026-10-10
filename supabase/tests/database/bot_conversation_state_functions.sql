-- Tarea 14 (documentacion/chatbot_diseno.md §8): bot_get_conversation_state,
-- bot_set_conversation_state.

begin;

select plan(6);

\set customer_id '28679e91-8caa-45f4-b5f5-3ed04f9decf9'

select is(
    (select count(*)::int from bot_get_conversation_state(:'customer_id'::uuid, 'telegram')),
    0,
    'sin ninguna fila guardada, bot_get_conversation_state devuelve vacío'
);

select bot_set_conversation_state(:'customer_id'::uuid, 'telegram', 'awaiting_quantity', '{"product_id": "p1"}'::jsonb);

select is(
    (select state from bot_get_conversation_state(:'customer_id'::uuid, 'telegram')),
    'awaiting_quantity',
    'bot_set_conversation_state persiste el estado'
);
select is(
    (select context from bot_get_conversation_state(:'customer_id'::uuid, 'telegram')),
    '{"product_id": "p1"}'::jsonb,
    'bot_set_conversation_state persiste el context'
);

-- sobreescribe, no acumula una segunda fila
select bot_set_conversation_state(:'customer_id'::uuid, 'telegram', 'idle', '{}'::jsonb);

select is(
    (select count(*)::int from bot_conversation_state where customer_id = :'customer_id'::uuid),
    1,
    'una transición sobreescribe la misma fila, no inserta una segunda'
);
select is(
    (select state from bot_get_conversation_state(:'customer_id'::uuid, 'telegram')),
    'idle',
    'la sobreescritura deja el estado más reciente'
);

-- otro canal del mismo cliente es independiente
select is(
    (select count(*)::int from bot_get_conversation_state(:'customer_id'::uuid, 'whatsapp')),
    0,
    'el mismo customer_id en otro canal no tiene estado (claves independientes)'
);

select * from finish();

rollback;
