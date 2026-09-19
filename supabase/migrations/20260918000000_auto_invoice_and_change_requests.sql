-- Auto-invoicing toggle, cost change-request workflow, and a correctness
-- fix to get_invoice_values_by_plan: bill customers for what was actually
-- received from suppliers, not just what they originally ordered.

ALTER TABLE public.distribution_plan
    ADD COLUMN auto_invoice_enabled boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN public.distribution_plan.auto_invoice_enabled IS 'When true and the plan transitions to invoicing, all orders are invoiced automatically in Siigo if none of them need corrections (invalid cost, missing Siigo customer, or a pending cost change request).';


CREATE TYPE public.invoice_cost_change_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TABLE public.invoice_cost_change_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    distribution_plan_id uuid NOT NULL,
    purchase_item_id uuid NOT NULL,
    current_price numeric(12,2),
    requested_price numeric(12,2) NOT NULL,
    reason text,
    status public.invoice_cost_change_request_status DEFAULT 'pending'::public.invoice_cost_change_request_status NOT NULL,
    requested_by uuid NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoice_cost_change_request_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_cost_change_request_distribution_plan_id_fkey FOREIGN KEY (distribution_plan_id) REFERENCES public.distribution_plan(id) ON DELETE CASCADE,
    CONSTRAINT invoice_cost_change_request_purchase_item_id_fkey FOREIGN KEY (purchase_item_id) REFERENCES public.purchase_item(id) ON DELETE CASCADE,
    CONSTRAINT invoice_cost_change_request_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.admin(id) ON DELETE RESTRICT,
    CONSTRAINT invoice_cost_change_request_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admin(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.invoice_cost_change_request IS 'Requests to change a purchase_item.actual_price that is already valid and therefore locked in the invoicing review screen. An order with a pending request on any of its lines cannot be invoiced.';

-- Only one open request per purchase_item at a time.
CREATE UNIQUE INDEX invoice_cost_change_request_pending_unique_idx
    ON public.invoice_cost_change_request (purchase_item_id)
    WHERE (status = 'pending');

CREATE INDEX invoice_cost_change_request_distribution_plan_id_idx
    ON public.invoice_cost_change_request (distribution_plan_id);

ALTER TABLE public.invoice_cost_change_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_cost_change_request_admin_all ON public.invoice_cost_change_request USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


-- Bill customers for what was actually received from suppliers (sum of
-- fulfillment -> purchase_item.received_quantity per sale_item), instead of
-- the originally required_quantity. sale_item lines with nothing received
-- are excluded entirely, so a product that was ordered but never shipped is
-- never invoiced.
CREATE OR REPLACE FUNCTION public.get_invoice_values_by_plan(p_plan_code text) RETURNS TABLE(plan_code text, plan_date date, order_id uuid, order_code text, customer_id uuid, customer_name text, identification_type public.idetification_type, identification_number text, product_id uuid, siigo_id text, product_name text, product_unit public.unit_type, order_quantity numeric, purchase_unit_price numeric, service_fee_percentage numeric, unit_price numeric, line_total numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    with product_price as (
        select
            po.distribution_plan_id,
            of.product_id,
            case
                when sum(coalesce(pi.quantity, 0)) > 0 then
                    sum(coalesce(pi.actual_price, 0) * coalesce(pi.quantity, 0)) / sum(coalesce(pi.quantity, 0))
                else
                    max(pi.actual_price)
            end as purchase_unit_price
        from public.purchase_order po
        inner join public.purchase_item pi on pi.purchase_order_id = po.id
        inner join public.offer of on of.id = pi.offer_id
        where pi.actual_price is not null
        group by
            po.distribution_plan_id,
            of.product_id
    ),
    delivered_quantity as (
        select
            f.sale_item_id,
            sum(coalesce(pi.received_quantity, 0)) as received_quantity
        from public.fulfillment f
        inner join public.purchase_item pi on pi.id = f.purchase_item_id
        group by f.sale_item_id
    )
    select
        dp.plan_code                                      as plan_code,
        dp.plan_date                                      as plan_date,
        so.id                                             as order_id,
        so.order_code                                     as order_code,
        c.id                                              as customer_id,
        c.name                                            as customer_name,
        c.identification_type                             as identification_type,
        c.identification_number                           as identification_number,
        p.id                                              as product_id,
        p.siigo_id                                        as siigo_id,
        p.name                                            as product_name,
        p.unit                                            as product_unit,
        dq.received_quantity                              as order_quantity,
        round(product_price.purchase_unit_price, 2)        as purchase_unit_price,
        dp.service_fee_percentage                         as service_fee_percentage,
        round(
            product_price.purchase_unit_price * (1 + dp.service_fee_percentage / 100),
            2
        )                                                 as unit_price,
        round(
            dq.received_quantity * product_price.purchase_unit_price * (1 + dp.service_fee_percentage / 100),
            2
        )                                                 as line_total
    from public.sale_order so
    inner join public.distribution_plan dp on dp.id = so.distribution_plan_id
    inner join public.customer c on c.id = so.customer_id
    inner join public.sale_item si on si.sale_order_id = so.id
    inner join public.product p on p.id = si.product_id
    inner join product_price on product_price.distribution_plan_id = dp.id
                            and product_price.product_id = p.id
    inner join delivered_quantity dq on dq.sale_item_id = si.id
    where dp.plan_code = p_plan_code
      and dq.received_quantity > 0
    order by
        c.identification_number,
        so.order_code,
        p.siigo_id,
        p.name;
$$;

COMMENT ON FUNCTION public.get_invoice_values_by_plan(p_plan_code text) IS 'Invoice-ready line items for a Jepri distribution plan. Receives plan_code and returns customer/order/product quantities (based on quantity actually received from suppliers, not just what was ordered), Siigo IDs, unit prices with service fee, and line totals. Lines with nothing received are excluded.';
