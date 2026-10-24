CREATE TABLE public.sheet_month_archives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source text NOT NULL CHECK (source IN ('PO','INV')),
 month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 headers jsonb NOT NULL DEFAULT '[]'::jsonb,
 rows jsonb NOT NULL DEFAULT '[]'::jsonb,
 captured_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source,month)
);
GRANT ALL ON public.sheet_month_archives TO service_role;
ALTER TABLE public.sheet_month_archives ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.touch_sheet_month_archive() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_sheet_month_archive BEFORE UPDATE ON public.sheet_month_archives FOR EACH ROW EXECUTE FUNCTION public.touch_sheet_month_archive();
CREATE INDEX invoices_month_timestamp_idx ON public.invoices(created_at);