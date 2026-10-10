-- Tarea 4 (documentacion/chatbot_diseno.md §11): las 5 tablas nuevas del bot deben
-- tener RLS activado y CERO policies — deny-by-default, solo las funciones
-- SECURITY DEFINER (Tarea 5-6) pueden tocarlas.

begin;

select plan(12);

select has_table('public', 'product_canonical_group', 'existe product_canonical_group');
select has_column('public', 'product', 'canonical_group_id', 'product tiene canonical_group_id');

select ok(
    (select relrowsecurity from pg_class where relname = 'product_canonical_group'),
    'product_canonical_group tiene RLS activado'
);
select ok(
    (select relrowsecurity from pg_class where relname = 'bot_conversation_state'),
    'bot_conversation_state tiene RLS activado'
);
select ok(
    (select relrowsecurity from pg_class where relname = 'bot_processed_update'),
    'bot_processed_update tiene RLS activado'
);
select ok(
    (select relrowsecurity from pg_class where relname = 'bot_interaction_log'),
    'bot_interaction_log tiene RLS activado'
);
select ok(
    (select relrowsecurity from pg_class where relname = 'bot_api_key'),
    'bot_api_key tiene RLS activado'
);

select is(
    (select count(*)::int from pg_policies where tablename = 'product_canonical_group'),
    0, 'product_canonical_group no tiene ninguna policy'
);
select is(
    (select count(*)::int from pg_policies where tablename = 'bot_conversation_state'),
    0, 'bot_conversation_state no tiene ninguna policy'
);
select is(
    (select count(*)::int from pg_policies where tablename = 'bot_processed_update'),
    0, 'bot_processed_update no tiene ninguna policy'
);
select is(
    (select count(*)::int from pg_policies where tablename = 'bot_interaction_log'),
    0, 'bot_interaction_log no tiene ninguna policy'
);
select is(
    (select count(*)::int from pg_policies where tablename = 'bot_api_key'),
    0, 'bot_api_key no tiene ninguna policy'
);

select * from finish();

rollback;
