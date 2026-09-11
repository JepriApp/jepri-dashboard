-- Invoice review workflow: validate/edit prices per sale_order before
-- creating Siigo invoices, once a distribution plan enters "invoicing".

CREATE TYPE public.invoice_review_status AS ENUM (
    'pending_review',
    'approved',
    'invoicing',
    'invoiced',
    'failed'
);

CREATE TABLE public.invoice_review (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    distribution_plan_id uuid NOT NULL,
    sale_order_id uuid NOT NULL,
    status public.invoice_review_status DEFAULT 'pending_review'::public.invoice_review_status NOT NULL,
    siigo_invoice_id text,
    siigo_invoice_number text,
    siigo_public_url text,
    invoiced_lines jsonb,
    error_message text,
    approved_by uuid,
    approved_at timestamp with time zone,
    invoiced_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    CONSTRAINT invoice_review_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_review_sale_order_id_key UNIQUE (sale_order_id),
    CONSTRAINT invoice_review_distribution_plan_id_fkey FOREIGN KEY (distribution_plan_id) REFERENCES public.distribution_plan(id) ON DELETE CASCADE,
    CONSTRAINT invoice_review_sale_order_id_fkey FOREIGN KEY (sale_order_id) REFERENCES public.sale_order(id) ON DELETE CASCADE,
    CONSTRAINT invoice_review_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.admin(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.invoice_review IS 'Per-sale_order invoicing workflow state for a distribution plan: review/approval status and the resulting Siigo invoice link, created when the plan enters invoicing status.';
COMMENT ON COLUMN public.invoice_review.invoiced_lines IS 'Snapshot of the line items (product, quantity, unit_price) actually sent to Siigo when the invoice was created successfully, for audit purposes.';

CREATE INDEX invoice_review_distribution_plan_id_idx ON public.invoice_review (distribution_plan_id);
CREATE INDEX invoice_review_status_idx ON public.invoice_review (status);

ALTER TABLE public.invoice_review ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoice_review_admin_all ON public.invoice_review USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));


-- Populates invoice_review with one pending_review row per non-cancelled
-- sale_order in the plan. Idempotent: safe to re-run if the operator
-- revisits the invoicing screen (e.g. after a new order was cancelled).
CREATE FUNCTION public.initialize_invoice_review(plan_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    INSERT INTO public.invoice_review (distribution_plan_id, sale_order_id)
    SELECT so.distribution_plan_id, so.id
    FROM public.sale_order so
    WHERE so.distribution_plan_id = plan_id
      AND so.status <> 'cancelled'
    ON CONFLICT (sale_order_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.initialize_invoice_review(plan_id uuid) IS 'Creates a pending_review invoice_review row for every non-cancelled sale_order of the given distribution plan. Idempotent.';
