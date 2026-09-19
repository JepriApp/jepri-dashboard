-- Lets admins deactivate a supplier so it stops appearing as an option when
-- assigning purchase orders, without touching or hiding any of its
-- existing offers/purchase orders/history.

ALTER TABLE public.supplier
    ADD COLUMN is_active boolean DEFAULT true NOT NULL;

COMMENT ON COLUMN public.supplier.is_active IS 'When false, the supplier is hidden from pickers used to assign new purchase orders or create new offers, but existing offers/purchase orders/history are unaffected.';
