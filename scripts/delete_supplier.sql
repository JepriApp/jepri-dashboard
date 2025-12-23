-- Script para eliminar un supplier y todas sus conexiones
-- Reemplazar 'SUPPLIER_ID_HERE' con el UUID del supplier a eliminar

-- Definir el supplier_id a eliminar
DO $$
DECLARE
  target_supplier_id UUID := 'SUPPLIER_ID_HERE'; -- Reemplazar con el UUID real
  affected_fulfillments INT;
  affected_purchase_items INT;
  affected_purchase_orders INT;
  affected_offers INT;
  supplier_user_id UUID;
BEGIN
  -- Verificar que el supplier existe
  IF NOT EXISTS (SELECT 1 FROM public.supplier WHERE id = target_supplier_id) THEN
    RAISE EXCEPTION 'Supplier con ID % no existe', target_supplier_id;
  END IF;

  -- Obtener el user_id asociado para eliminarlo al final
  SELECT user_id INTO supplier_user_id FROM public.supplier WHERE id = target_supplier_id;

  RAISE NOTICE 'Eliminando supplier: %', target_supplier_id;

  -- 1. Eliminar fulfillments asociados a purchase_items de este supplier
  WITH purchase_orders_to_delete AS (
    SELECT id FROM public.purchase_order WHERE supplier_id = target_supplier_id
  ),
  purchase_items_to_delete AS (
    SELECT id FROM public.purchase_item 
    WHERE purchase_order_id IN (SELECT id FROM purchase_orders_to_delete)
  )
  DELETE FROM public.fulfillment
  WHERE purchase_item_id IN (SELECT id FROM purchase_items_to_delete);
  
  GET DIAGNOSTICS affected_fulfillments = ROW_COUNT;
  RAISE NOTICE 'Fulfillments eliminados: %', affected_fulfillments;

  -- 2. Eliminar purchase_items de purchase_orders de este supplier
  DELETE FROM public.purchase_item
  WHERE purchase_order_id IN (
    SELECT id FROM public.purchase_order WHERE supplier_id = target_supplier_id
  );
  
  GET DIAGNOSTICS affected_purchase_items = ROW_COUNT;
  RAISE NOTICE 'Purchase items eliminados: %', affected_purchase_items;

  -- 3. Eliminar purchase_orders de este supplier
  DELETE FROM public.purchase_order WHERE supplier_id = target_supplier_id;
  
  GET DIAGNOSTICS affected_purchase_orders = ROW_COUNT;
  RAISE NOTICE 'Purchase orders eliminadas: %', affected_purchase_orders;

  -- 4. Eliminar offers de este supplier
  DELETE FROM public.offer WHERE supplier_id = target_supplier_id;
  
  GET DIAGNOSTICS affected_offers = ROW_COUNT;
  RAISE NOTICE 'Offers eliminadas: %', affected_offers;

  -- 5. Eliminar el supplier (esto también eliminará el profile en cascada)
  DELETE FROM public.supplier WHERE id = target_supplier_id;
  RAISE NOTICE 'Supplier eliminado: %', target_supplier_id;

  -- 6. Eliminar el usuario de auth si existe
  IF supplier_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = supplier_user_id;
    RAISE NOTICE 'Usuario de auth eliminado: %', supplier_user_id;
  END IF;

  RAISE NOTICE '=== Eliminación completada exitosamente ===';
  RAISE NOTICE 'Total fulfillments: %', affected_fulfillments;
  RAISE NOTICE 'Total purchase_items: %', affected_purchase_items;
  RAISE NOTICE 'Total purchase_orders: %', affected_purchase_orders;
  RAISE NOTICE 'Total offers: %', affected_offers;
END $$;
