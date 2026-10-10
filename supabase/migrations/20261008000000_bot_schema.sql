-- Esquema base del chatbot de pedidos (documentacion/chatbot_diseno.md, Tarea 4 de
-- tasks/todo.md). Todo aditivo: no modifica ninguna tabla/columna existente salvo el
-- ALTER TABLE product de abajo (columna nueva, nullable).
--
-- Las 5 tablas quedan con RLS activado y SIN NINGUNA policy (§11 del diseño) —
-- deny-by-default para cualquier acceso que no sea a través de las funciones
-- SECURITY DEFINER (bot_*) de la migración siguiente. Ni siquiera una sesión de admin
-- autenticada puede leerlas/escribirlas directo.

-- 1. Agrupación canónica de catálogo (§5.1) — resuelve que un mismo producto tenga
-- varias filas por unidad de medida. Se puebla offline (Tarea 21, asistido por LLM,
-- revisado por un admin); hasta entonces canonical_group_id queda NULL en todo el
-- catálogo y las funciones de búsqueda tratan cada producto como su propio grupo.

CREATE TABLE public.product_canonical_group (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT product_canonical_group_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.product_canonical_group IS 'Agrupa filas de product que son la misma referencia en distinta unidad/empaque (ej. "Tomate chonto" kg + caja). Poblada offline por un job asistido por LLM y revisada por un admin — nunca en el flujo de chat en vivo.';

ALTER TABLE public.product
    ADD COLUMN canonical_group_id uuid,
    ADD CONSTRAINT product_canonical_group_id_fkey
        FOREIGN KEY (canonical_group_id)
        REFERENCES public.product_canonical_group(id)
        ON DELETE SET NULL;

COMMENT ON COLUMN public.product.canonical_group_id IS 'Grupo canónico de producto (ver product_canonical_group). NULL hasta que corra el job de agrupación de la Tarea 21 — las funciones de catálogo del bot ya degradan correctamente a "cada producto es su propio grupo" mientras tanto.';

ALTER TABLE public.product_canonical_group ENABLE ROW LEVEL SECURITY;

-- 2. Estado de conversación entre pasos (§8) — una fila por cliente/canal, se
-- sobreescribe en cada paso (no acumula historial; el historial va en bot_interaction_log).

CREATE TABLE public.bot_conversation_state (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    channel text NOT NULL,
    state text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bot_conversation_state_pkey PRIMARY KEY (id),
    CONSTRAINT bot_conversation_state_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE,
    CONSTRAINT bot_conversation_state_channel_check
        CHECK (channel IN ('telegram', 'whatsapp')),
    CONSTRAINT bot_conversation_state_customer_channel_unique
        UNIQUE (customer_id, channel)
);

COMMENT ON TABLE public.bot_conversation_state IS 'Estado del flujo conversacional del bot entre mensajes (idle/awaiting_unit/awaiting_quantity/...), una fila por cliente+canal. Una conversación con updated_at de más de ~15 minutos se trata como idle (reinicio al Menú Principal).';

ALTER TABLE public.bot_conversation_state ENABLE ROW LEVEL SECURITY;

-- 3. Idempotencia de updates de canal (§9) — dedupe de reintentos del webhook antes
-- de llamar cualquier función de negocio. channel+update_id porque cada plataforma
-- tiene su propio esquema de ids (Telegram es numérico, WhatsApp no necesariamente).

CREATE TABLE public.bot_processed_update (
    channel text NOT NULL,
    update_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bot_processed_update_pkey PRIMARY KEY (channel, update_id),
    CONSTRAINT bot_processed_update_channel_check
        CHECK (channel IN ('telegram', 'whatsapp'))
);

COMMENT ON TABLE public.bot_processed_update IS 'Dedupe de updates ya procesados por canal (Telegram reintenga la entrega si no recibe 200 a tiempo). Se verifica antes de invocar cualquier función de negocio del bot.';

ALTER TABLE public.bot_processed_update ENABLE ROW LEVEL SECURITY;

-- 4. Auditoría de interacciones (§10) — trazabilidad de cada acción de dominio
-- (no cada ping del webhook) dado que no hay un humano supervisando en el momento.

CREATE TABLE public.bot_interaction_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid,
    channel text NOT NULL,
    action text NOT NULL,
    payload jsonb,
    result jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bot_interaction_log_pkey PRIMARY KEY (id),
    CONSTRAINT bot_interaction_log_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE SET NULL,
    CONSTRAINT bot_interaction_log_channel_check
        CHECK (channel IN ('telegram', 'whatsapp'))
);

COMMENT ON TABLE public.bot_interaction_log IS 'Auditoría de cada acción de dominio del bot (create_order/update_order/cancel_order/search/...), con el payload pedido y el resultado (order_id/order_code o código de error). No depende de los logs efímeros de Vercel.';

CREATE INDEX bot_interaction_log_customer_id_idx
    ON public.bot_interaction_log (customer_id);

ALTER TABLE public.bot_interaction_log ENABLE ROW LEVEL SECURITY;

-- 5. API keys para adaptadores de canal fuera de proceso (§4.1) — distinto del
-- secret_token de cada plataforma: esto autentica qué adaptador llama a nuestra API,
-- no si el mensaje entrante es genuino de Telegram/WhatsApp.

CREATE TABLE public.bot_api_key (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    CONSTRAINT bot_api_key_pkey PRIMARY KEY (id),
    CONSTRAINT bot_api_key_key_hash_unique UNIQUE (key_hash)
);

COMMENT ON TABLE public.bot_api_key IS 'API keys (hasheadas, nunca en texto plano) para adaptadores de canal que no viven en este mismo despliegue de Next.js (ej. un gateway de WhatsApp self-hosted). El adaptador en proceso (Telegram) no las usa, llama a los servicios directo.';

ALTER TABLE public.bot_api_key ENABLE ROW LEVEL SECURITY;
