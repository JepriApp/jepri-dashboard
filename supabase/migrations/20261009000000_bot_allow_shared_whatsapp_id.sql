-- Un mismo whatsapp_id puede representar a varios clientes o puntos de entrega
-- distintos (ej. un mensajero que pide para varias tiendas con el mismo número).
-- bot_resolve_customer ya está escrita como RETURNS TABLE(...), así que con esta
-- restricción fuera, simplemente puede devolver más de una fila para el mismo valor
-- -- lib/bot/domain.ts (handleInboundMessageForChannel) es quien desambigua.
ALTER TABLE public.customer DROP CONSTRAINT customer_whatsapp_id_unique;

COMMENT ON COLUMN public.customer.whatsapp_id IS
    'Identificador de WhatsApp/Telegram del cliente. Puede repetirse entre varias filas '
    'de customer cuando un mismo número opera a nombre de distintos clientes o puntos de '
    'entrega (bot_resolve_customer puede devolver más de una fila para el mismo valor).';
