-- Script para eliminar toda la información operacional
-- Mantiene: suppliers, customers, products, offers, profiles
-- Elimina: distribution_plans y todo lo relacionado (orders, items, fulfillments)

-- Desactivar triggers temporalmente para evitar conflictos
SET session_replication_role = replica;

-- Eliminar en orden de dependencias
DELETE FROM public.fulfillment;
DELETE FROM public.purchase_item;
DELETE FROM public.purchase_order;
DELETE FROM public.sale_item;
DELETE FROM public.sale_order;
DELETE FROM public.distribution_plan;

-- Opcional: eliminar carritos de compra (información operacional temporal)
DELETE FROM public.shopping_cart;

-- Reactivar triggers
SET session_replication_role = DEFAULT;

-- Resetear secuencias para que los códigos vuelvan a empezar desde 1
ALTER SEQUENCE sale_order_seq RESTART WITH 1;
ALTER SEQUENCE purchase_order_seq RESTART WITH 1;
ALTER SEQUENCE distribution_plan_seq RESTART WITH 1;

-- Verificar resultados
SELECT 'distribution_plan' as table_name, COUNT(*) as remaining_rows FROM public.distribution_plan
UNION ALL
SELECT 'sale_order', COUNT(*) FROM public.sale_order
UNION ALL
SELECT 'sale_item', COUNT(*) FROM public.sale_item
UNION ALL
SELECT 'purchase_order', COUNT(*) FROM public.purchase_order
UNION ALL
SELECT 'purchase_item', COUNT(*) FROM public.purchase_item
UNION ALL
SELECT 'fulfillment', COUNT(*) FROM public.fulfillment
UNION ALL
SELECT 'shopping_cart', COUNT(*) FROM public.shopping_cart;
