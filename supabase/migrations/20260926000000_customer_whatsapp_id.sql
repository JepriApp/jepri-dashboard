-- Agrega el campo whatsapp_id al cliente: el identificador que se debe usar
-- para contactarlo por WhatsApp, distinto del teléfono de contacto general.
-- Acepta o un número en formato E.164 con código de país (+<código país><número>)
-- o un id alfanumérico (para el caso de un identificador de canal que no sea
-- un número de teléfono). Es único: no puede haber dos clientes apuntando al
-- mismo contacto de WhatsApp.
--
-- IMPORTANTE: correr esta migración DESPUÉS de scripts/fix_customer_phone_format.sql
-- — ese script deja customer.phone limpio, que es lo que valida el nuevo CHECK.

ALTER TABLE public.customer
    ADD COLUMN whatsapp_id text;

ALTER TABLE public.customer
    ADD CONSTRAINT customer_whatsapp_id_format CHECK (
        whatsapp_id IS NULL
        OR whatsapp_id ~ '^\+\d{8,15}$'
        OR whatsapp_id ~ '^[A-Za-z0-9_.-]{3,64}$'
    );

ALTER TABLE public.customer
    ADD CONSTRAINT customer_whatsapp_id_unique UNIQUE (whatsapp_id);

COMMENT ON COLUMN public.customer.whatsapp_id IS 'Identificador de WhatsApp del cliente: número E.164 con código de país (+573XXXXXXXXX) o id alfanumérico. Es el dato que se usa para enviarle mensajes, no el campo phone.';

-- Refuerza a nivel de base de datos el formato de phone acordado para clientes
-- colombianos: "+57" + celular de 10 dígitos, o "+57" + 1 dígito regional +
-- 7 dígitos locales para fijos. Se permite cualquier otro "+<dígitos>" para
-- no romper clientes con número extranjero ya cargados.
ALTER TABLE public.customer
    ADD CONSTRAINT customer_phone_format CHECK (
        phone IS NULL
        OR phone ~ '^\+\d{8,15}$'
    );
