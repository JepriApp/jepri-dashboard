-- Normaliza customer.phone al nuevo formato acordado:
--   * Celular (arranca en 3): "+57" + los 10 dígitos completos.          ej: 3134567890      -> +573134567890
--   * Fijo (indicativo nuevo 60X, ej. 602 Cali, 601 Bogotá): "+57" + el
--     dígito regional viejo (el 3er dígito del indicativo) + los 7
--     dígitos del número local.                                          ej: 6025663458     -> +5725663458
--
-- El dato original viene sucio por una importación de Siigo en formato
-- "AAA-NUMERO-EXT" (con EXT casi siempre en "000", se ignora). El AAA a
-- veces es el indicativo/prefijo real y a veces es puro ruido de Siigo
-- (cuando el NUMERO del medio ya trae los 10 dígitos completos).
--
-- Todo lo que no se pueda reconstruir con confianza (placeholders en
-- cero, cantidad de dígitos rara, dos números pegados con "@", etc.)
-- queda en NULL para revisión manual — no se inventa un número.
--
-- Los números ya en formato "+<dígitos>" (incluye clientes no
-- colombianos, ej. +1...) se dejan intactos.
--
-- USO:
--   1) Correr primero el SELECT de abajo (bloque "PREVIEW") y revisar el
--      reporte, en especial las filas con needs_manual_review = true.
--   2) Correr el UPDATE (bloque "APLICAR") sólo después de revisar.

-- ============================================================
-- PREVIEW — no modifica datos, solo muestra el reporte
-- ============================================================
WITH parts AS (
  SELECT
    id,
    name,
    phone AS old_phone,
    regexp_match(phone, '^-(\d{10})-$')      AS dash_parts,
    regexp_match(phone, '^(\d{1,10})-(\d{1,10})-\d+$') AS siigo_parts
  FROM public.customer
  WHERE phone IS NOT NULL
),
resolved AS (
  SELECT
    id, name, old_phone,
    CASE
      -- ya está en formato "+<digitos>" (incluye no-colombianos): no se toca
      WHEN old_phone ~ '^\+\d{8,15}$' THEN old_phone

      -- caso puntual: guiones sueltos alrededor de un bloque de 10 dígitos, ej "-6025560704-"
      WHEN dash_parts IS NOT NULL AND (dash_parts)[1] ~ '^60\d{8}$'
        THEN '+57' || substring((dash_parts)[1] from 3 for 1) || substring((dash_parts)[1] from 4)
      WHEN dash_parts IS NOT NULL AND (dash_parts)[1] ~ '^3\d{9}$'
        THEN '+57' || (dash_parts)[1]

      -- formato Siigo "AAA-MEDIO-EXT"
      WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
           AND (siigo_parts)[1] ~ '^3\d{9}$'
        THEN '+57' || (siigo_parts)[1]                                    -- campos invertidos -> celular
      WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
           AND (siigo_parts)[1] ~ '^60\d{8}$'
        THEN '+57' || substring((siigo_parts)[1] from 3 for 1) || substring((siigo_parts)[1] from 4) -- campos invertidos -> fijo
      WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
        THEN NULL                                                         -- placeholder real (sin numero)

      WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^3\d{9}$'
        THEN '+57' || (siigo_parts)[2]                                    -- AAA es ruido, celular ya completo
      WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^60\d{8}$'
        THEN '+57' || substring((siigo_parts)[2] from 3 for 1) || substring((siigo_parts)[2] from 4) -- AAA es ruido, fijo ya completo

      WHEN siigo_parts IS NOT NULL AND length((siigo_parts)[2]) = 7 AND length((siigo_parts)[1]) = 3
           AND ((siigo_parts)[1] || (siigo_parts)[2]) ~ '^3\d{9}$'
        THEN '+57' || (siigo_parts)[1] || (siigo_parts)[2]                -- AAA+medio = celular de 10 digitos
      WHEN siigo_parts IS NOT NULL AND length((siigo_parts)[2]) = 7 AND length((siigo_parts)[1]) = 3
           AND ((siigo_parts)[1] || (siigo_parts)[2]) ~ '^60\d{8}$'
        THEN '+57' || substring(((siigo_parts)[1] || (siigo_parts)[2]) from 3 for 1)
                    || substring(((siigo_parts)[1] || (siigo_parts)[2]) from 4)                     -- AAA+medio = fijo

      ELSE NULL  -- ambiguo: cantidad de dígitos rara, "@" con dos números, etc.
    END AS new_phone
  FROM parts
)
SELECT
  id, name, old_phone, new_phone,
  (new_phone IS NULL) AS needs_manual_review
FROM resolved
WHERE new_phone IS DISTINCT FROM old_phone
ORDER BY needs_manual_review DESC, old_phone;

-- ============================================================
-- APLICAR — descomentar y correr solo después de revisar el preview
-- ============================================================
-- WITH parts AS (
--   SELECT
--     id, phone AS old_phone,
--     regexp_match(phone, '^-(\d{10})-$')      AS dash_parts,
--     regexp_match(phone, '^(\d{1,10})-(\d{1,10})-\d+$') AS siigo_parts
--   FROM public.customer
--   WHERE phone IS NOT NULL
-- ),
-- resolved AS (
--   SELECT
--     id, old_phone,
--     CASE
--       WHEN old_phone ~ '^\+\d{8,15}$' THEN old_phone
--       WHEN dash_parts IS NOT NULL AND (dash_parts)[1] ~ '^60\d{8}$'
--         THEN '+57' || substring((dash_parts)[1] from 3 for 1) || substring((dash_parts)[1] from 4)
--       WHEN dash_parts IS NOT NULL AND (dash_parts)[1] ~ '^3\d{9}$'
--         THEN '+57' || (dash_parts)[1]
--       WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
--            AND (siigo_parts)[1] ~ '^3\d{9}$'
--         THEN '+57' || (siigo_parts)[1]
--       WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
--            AND (siigo_parts)[1] ~ '^60\d{8}$'
--         THEN '+57' || substring((siigo_parts)[1] from 3 for 1) || substring((siigo_parts)[1] from 4)
--       WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^0+$'
--         THEN NULL
--       WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^3\d{9}$'
--         THEN '+57' || (siigo_parts)[2]
--       WHEN siigo_parts IS NOT NULL AND (siigo_parts)[2] ~ '^60\d{8}$'
--         THEN '+57' || substring((siigo_parts)[2] from 3 for 1) || substring((siigo_parts)[2] from 4)
--       WHEN siigo_parts IS NOT NULL AND length((siigo_parts)[2]) = 7 AND length((siigo_parts)[1]) = 3
--            AND ((siigo_parts)[1] || (siigo_parts)[2]) ~ '^3\d{9}$'
--         THEN '+57' || (siigo_parts)[1] || (siigo_parts)[2]
--       WHEN siigo_parts IS NOT NULL AND length((siigo_parts)[2]) = 7 AND length((siigo_parts)[1]) = 3
--            AND ((siigo_parts)[1] || (siigo_parts)[2]) ~ '^60\d{8}$'
--         THEN '+57' || substring(((siigo_parts)[1] || (siigo_parts)[2]) from 3 for 1)
--                     || substring(((siigo_parts)[1] || (siigo_parts)[2]) from 4)
--       ELSE NULL
--     END AS new_phone
--   FROM parts
-- )
-- UPDATE public.customer c
-- SET phone = r.new_phone
-- FROM resolved r
-- WHERE c.id = r.id
--   AND r.new_phone IS DISTINCT FROM r.old_phone;
