-- Reset completo de esquema y datos (MVP)
-- 1) Elimina vistas, tablas, tipos, funciones y secuencias existentes
-- 2) Reconstruye todo el esquema y repuebla datos iniciales
-- Nota: si ejecutas desde psql, este script puede incluir el archivo principal
--       del esquema con \i. En el SQL Editor de Supabase, copia/pega supabase_sql.sql
--       después de la sección DROP.

BEGIN;

-- Vistas
DROP VIEW IF EXISTS sale_order_with_total;
DROP VIEW IF EXISTS sale_order_with_total_and_status;
DROP VIEW IF EXISTS purchase_order_with_total;

-- Tablas (ordenadas para evitar dependencias)
DROP TABLE IF EXISTS distribution_plan_order CASCADE;
DROP TABLE IF EXISTS distribution_plan_worker CASCADE;
DROP TABLE IF EXISTS distribution_plan CASCADE;
DROP TABLE IF EXISTS fulfillment CASCADE;
DROP TABLE IF EXISTS purchase_item CASCADE;
DROP TABLE IF EXISTS purchase_order CASCADE;
DROP TABLE IF EXISTS sale_item CASCADE;
DROP TABLE IF EXISTS sale_order CASCADE;
DROP TABLE IF EXISTS shopping_cart CASCADE;
DROP TABLE IF EXISTS offer CASCADE;
DROP TABLE IF EXISTS product CASCADE;
DROP TABLE IF EXISTS supplier CASCADE;
DROP TABLE IF EXISTS customer CASCADE;
DROP TABLE IF EXISTS admin CASCADE;
DROP TABLE IF EXISTS coordinator CASCADE;
DROP TABLE IF EXISTS driver CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;

-- Secuencias
DROP SEQUENCE IF EXISTS sale_order_seq;
DROP SEQUENCE IF EXISTS purchase_order_seq;
DROP SEQUENCE IF EXISTS distribution_plan_seq;

-- Funciones
DROP FUNCTION IF EXISTS set_sale_order_code();
DROP FUNCTION IF EXISTS set_purchase_order_code();
DROP FUNCTION IF EXISTS set_distribution_plan_code();

-- Tipos
DROP TYPE IF EXISTS distribution_plan_order_status CASCADE;
DROP TYPE IF EXISTS distribution_plan_status CASCADE;
DROP TYPE IF EXISTS distribution_plan_order_status CASCADE;
DROP TYPE IF EXISTS sale_order_status CASCADE;
DROP TYPE IF EXISTS purchase_order_status CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS unit_type CASCADE;

COMMIT;

-- Si usas psql, incluye el archivo principal del esquema para reconstruir todo:
-- \i supabase_sql.sql

-- Si usas el SQL Editor de Supabase:
-- 1) Ejecuta este archivo para limpiar el esquema
-- 2) Copia y ejecuta el contenido completo de supabase_sql.sql para recrear y resembrar datos