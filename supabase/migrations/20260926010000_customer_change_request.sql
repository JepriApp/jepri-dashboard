-- Flujo de solicitud/aprobación para editar un registro de customer, con el
-- mismo patrón que invoice_cost_change_request (ver
-- 20260918000000_auto_invoice_and_change_requests.sql): la edición no toca
-- customer directamente, queda como solicitud pendiente hasta que un admin
-- la aprueba (o la rechaza).

CREATE TYPE public.customer_change_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

CREATE TABLE public.customer_change_request (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    current_data jsonb NOT NULL,
    requested_data jsonb NOT NULL,
    reason text,
    status public.customer_change_request_status DEFAULT 'pending'::public.customer_change_request_status NOT NULL,
    requested_by uuid NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT customer_change_request_pkey PRIMARY KEY (id),
    CONSTRAINT customer_change_request_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customer(id) ON DELETE CASCADE,
    CONSTRAINT customer_change_request_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.admin(id) ON DELETE RESTRICT,
    CONSTRAINT customer_change_request_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.admin(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.customer_change_request IS 'Solicitudes de edición de un registro de customer (nombre, contacto, teléfono, whatsapp_id, identificación). current_data/requested_data guardan solo los campos que cambian. Se aplican a customer únicamente cuando un admin aprueba la solicitud.';

-- Solo una solicitud abierta por cliente a la vez.
CREATE UNIQUE INDEX customer_change_request_pending_unique_idx
    ON public.customer_change_request (customer_id)
    WHERE (status = 'pending');

CREATE INDEX customer_change_request_customer_id_idx
    ON public.customer_change_request (customer_id);

ALTER TABLE public.customer_change_request ENABLE ROW LEVEL SECURITY;

CREATE POLICY customer_change_request_admin_all ON public.customer_change_request USING ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid())))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.admin a
  WHERE (a.user_id = auth.uid()))));
