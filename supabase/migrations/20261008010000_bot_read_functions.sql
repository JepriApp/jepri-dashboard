-- Funciones de lectura del bot (documentacion/chatbot_diseno.md §5, Tarea 5 de
-- tasks/todo.md). Todas SECURITY DEFINER con SET search_path = public fijo (hardening
-- estándar contra hijacking de search_path) — corren con los privilegios de su dueño,
-- ignorando las RLS policies existentes (y las tablas bot_* de la Tarea 4, que no
-- tienen ninguna). Otorgadas a anon/authenticated porque el bot llama vía el cliente
-- Supabase normal (anon key), sin sesión de auth.uid().
--
-- bot_get_frequent_products y bot_search_catalog agrupan por
-- coalesce(canonical_group_id, product.id): mientras no corra el job de agrupación
-- (Tarea 21), cada producto es su propio grupo — degradación correcta, no un error.

-- unaccent instalada en `public` (no en `extensions`) a propósito: las funciones de
-- abajo fijan `search_path = public`, así `unaccent(...)` resuelve sin calificar esquema.
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA public;

-- 1. Resolver whitelist (§2) a partir del external_id del canal (chat_id de Telegram, etc).

CREATE OR REPLACE FUNCTION public.bot_resolve_customer(p_external_id text)
RETURNS TABLE(customer_id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT c.id, c.name
    FROM public.customer c
    WHERE c.whatsapp_id = p_external_id;
$$;

COMMENT ON FUNCTION public.bot_resolve_customer(text) IS 'Whitelist del bot: resuelve un customer a partir de su whatsapp_id/external_id de canal. Sin match -> result set vacío (el llamador debe ignorar el mensaje en silencio, no responder nada).';

GRANT EXECUTE ON FUNCTION public.bot_resolve_customer(text) TO anon, authenticated;

-- 2. Validar una API key (§4.1) para los adaptadores de canal fuera de proceso.

CREATE OR REPLACE FUNCTION public.bot_validate_api_key(p_key_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.bot_api_key
        WHERE key_hash = p_key_hash
          AND revoked_at IS NULL
    );
$$;

COMMENT ON FUNCTION public.bot_validate_api_key(text) IS 'Valida el hash (sha256) de una API key de adaptador de canal fuera de proceso contra bot_api_key, exigiendo que no esté revocada.';

GRANT EXECUTE ON FUNCTION public.bot_validate_api_key(text) TO anon, authenticated;

-- 3. Plan de operación vigente (§3.1): el más próximo en estado 'planned' con fecha
-- de entrega futura. plan_date es la fecha de ENTREGA, no la del pedido.

CREATE OR REPLACE FUNCTION public.bot_get_active_plan()
RETURNS TABLE(plan_id uuid, plan_date date, cutoff_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT dp.id, dp.plan_date, dp.cutoff_at
    FROM public.distribution_plan dp
    WHERE dp.status = 'planned'
      AND dp.plan_date > (now() AT TIME ZONE 'America/Bogota')::date
    ORDER BY dp.plan_date ASC
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.bot_get_active_plan() IS 'Plan de operación vigente para tomar pedidos: el distribution_plan en planned más próximo con plan_date (fecha de entrega) futura. Sin resultado -> no hay ventana de pedidos activa.';

GRANT EXECUTE ON FUNCTION public.bot_get_active_plan() TO anon, authenticated;

-- 4. Productos frecuentes del cliente (§5.1) — accesos rápidos al entrar a "Crear pedido".

CREATE OR REPLACE FUNCTION public.bot_get_frequent_products(p_customer_id uuid, p_limit int DEFAULT 8)
RETURNS TABLE(canonical_group_id uuid, canonical_name text, variants jsonb, times_ordered int)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    WITH customer_items AS (
        SELECT COALESCE(p.canonical_group_id, p.id) AS group_key
        FROM public.sale_item si
        JOIN public.sale_order so ON so.id = si.sale_order_id
        JOIN public.product p ON p.id = si.product_id
        WHERE so.created_by_customer_id = p_customer_id
          AND so.status <> 'cancelled'
    ),
    counts AS (
        SELECT group_key, count(*) AS times_ordered
        FROM customer_items
        GROUP BY group_key
    )
    SELECT
        c.group_key,
        COALESCE(pcg.name, (SELECT p2.name FROM public.product p2 WHERE p2.id = c.group_key)),
        (
            SELECT jsonb_agg(jsonb_build_object(
                'product_id', p3.id,
                'unit', p3.unit,
                'reference_price', p3.reference_price
            ))
            FROM public.product p3
            WHERE COALESCE(p3.canonical_group_id, p3.id) = c.group_key
        ),
        c.times_ordered::int
    FROM counts c
    LEFT JOIN public.product_canonical_group pcg ON pcg.id = c.group_key
    ORDER BY c.times_ordered DESC
    LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.bot_get_frequent_products(uuid, int) IS 'Hasta p_limit productos (agrupados por variante de unidad) más pedidos por ese cliente, contando sale_item en sus sale_order no canceladas. Es el acceso rápido al entrar a "Crear pedido" — nunca se lista el catálogo completo.';

GRANT EXECUTE ON FUNCTION public.bot_get_frequent_products(uuid, int) TO anon, authenticated;

-- 5. Búsqueda de catálogo por texto (§5.1) — nunca se expone el catálogo completo.
-- Usa unaccent si está disponible (instalada arriba); cae a ILIKE simple si no.

CREATE OR REPLACE FUNCTION public.bot_search_catalog(p_query text, p_limit int DEFAULT 8)
RETURNS TABLE(canonical_group_id uuid, canonical_name text, variants jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_has_unaccent boolean;
    v_match_clause text;
BEGIN
    SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'unaccent')
    INTO v_has_unaccent;

    -- SQL dinámico a propósito: si quedara como un CASE estático, Postgres necesita
    -- resolver unaccent(...) al planear la consulta aunque esa rama nunca se tome, y la
    -- función entera fallaría si la extensión no está instalada. Con EXECUTE, la rama
    -- sin unaccent ni siquiera menciona esa función en el texto que se parsea.
    IF v_has_unaccent THEN
        v_match_clause := 'unaccent(lower(p.name)) ILIKE ''%'' || unaccent(lower($1)) || ''%''';
    ELSE
        v_match_clause := 'lower(p.name) ILIKE ''%'' || lower($1) || ''%''';
    END IF;

    RETURN QUERY EXECUTE format($q$
        WITH matches AS (
            SELECT COALESCE(p.canonical_group_id, p.id) AS group_key
            FROM public.product p
            WHERE %s
        ),
        groups AS (
            SELECT DISTINCT group_key FROM matches
        )
        SELECT
            g.group_key,
            COALESCE(pcg.name, (SELECT p2.name FROM public.product p2 WHERE p2.id = g.group_key)) AS canonical_name,
            (
                SELECT jsonb_agg(jsonb_build_object(
                    'product_id', p3.id,
                    'unit', p3.unit,
                    'reference_price', p3.reference_price
                ))
                FROM public.product p3
                WHERE COALESCE(p3.canonical_group_id, p3.id) = g.group_key
            ) AS variants
        FROM groups g
        LEFT JOIN public.product_canonical_group pcg ON pcg.id = g.group_key
        ORDER BY canonical_name
        LIMIT $2
    $q$, v_match_clause)
    USING p_query, p_limit;
END;
$$;

COMMENT ON FUNCTION public.bot_search_catalog(text, int) IS 'Búsqueda por texto sobre el catálogo completo (sin filtrar disponibilidad), agrupada por variante de unidad. Usa unaccent si la extensión está instalada, si no cae a ILIKE simple sin normalizar acentos.';

GRANT EXECUTE ON FUNCTION public.bot_search_catalog(text, int) TO anon, authenticated;

-- 6. Pedido actual del cliente (§3.1), acotado al plan activo — no a todo su historial.

CREATE OR REPLACE FUNCTION public.bot_get_current_order(p_customer_id uuid)
RETURNS TABLE(order_id uuid, order_code text, status text, items jsonb)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT
        so.id,
        so.order_code,
        so.status::text,
        (
            SELECT jsonb_agg(jsonb_build_object(
                'product_id', si.product_id,
                'required_quantity', si.required_quantity
            ))
            FROM public.sale_item si
            WHERE si.sale_order_id = so.id
        )
    FROM public.sale_order so
    WHERE so.created_by_customer_id = p_customer_id
      AND so.distribution_plan_id = (SELECT plan_id FROM public.bot_get_active_plan())
      AND so.status <> 'cancelled'
    LIMIT 1;
$$;

COMMENT ON FUNCTION public.bot_get_current_order(uuid) IS 'Pedido activo del cliente en el plan vigente (bot_get_active_plan), no en todo su historial. Sin resultado -> el cliente no tiene pedido hoy.';

GRANT EXECUTE ON FUNCTION public.bot_get_current_order(uuid) TO anon, authenticated;
