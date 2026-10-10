-- Tarea 12 (documentacion/chatbot_diseno.md §9): bot_mark_update_processed.

begin;

select plan(3);

select ok(
    bot_mark_update_processed('telegram', 'test-update-1'),
    'primera vez con (channel, update_id) devuelve true'
);
select ok(
    NOT bot_mark_update_processed('telegram', 'test-update-1'),
    'repetir el mismo (channel, update_id) devuelve false — no reprocesar'
);
select ok(
    bot_mark_update_processed('telegram', 'test-update-2'),
    'un update_id distinto es independiente, vuelve a devolver true'
);

select * from finish();

rollback;
