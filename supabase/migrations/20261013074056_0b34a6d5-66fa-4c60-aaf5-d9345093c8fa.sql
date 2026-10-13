CREATE TABLE public.invoices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_no text, company_name text, tax_id text, invoice_date text, salesperson text,
 grand_total numeric, image_url text, status text, raw_text text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.invoice_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
 product_name text, common_name text, gpu_code text, tpu_code text,
 quantity numeric, unit_price numeric, total_price numeric, status text,
 created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.invoices TO service_role;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.invoice_items(invoice_id);
CREATE INDEX ON public.invoices(created_at DESC);