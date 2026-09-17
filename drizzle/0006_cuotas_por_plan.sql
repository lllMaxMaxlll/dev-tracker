-- DevTracker · Cuotas por plan
--
-- Ninguna de las dos APIs devuelve los topes del plan, sólo el consumo. Sin
-- estos valores no hay contra qué calcular un porcentaje ni un excedente.

CREATE TABLE "plan_quotas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "usage_source" NOT NULL,
	"plan" text NOT NULL,
	"metric" text NOT NULL,
	"included" numeric(20, 6) NOT NULL,
	"overage_price_usd" numeric(12, 6),
	"overage_block" numeric(20, 6) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "monitored_resources" ADD COLUMN "plan" text;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_quotas_source_plan_metric_idx" ON "plan_quotas" USING btree ("source","plan","metric");
--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."plan_quotas"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- Misma receta de RLS que el resto del monitor: habilitado, sin policies y sin
-- FORCE. El porqué de cada mitad está en 0005.
ALTER TABLE public."plan_quotas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public."plan_quotas" FROM anon, authenticated;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Valores iniciales
--
-- Se siembra SÓLO lo que corresponde a un límite publicado por el proveedor, y
-- se deja vacío lo demás. Supabase no publica un tope de peticiones por
-- servicio, y en Vercel Hobby el consumo directamente no se puede leer por API
-- (ver 0005), así que esas filas las crea quien quiera un tope de referencia
-- propio desde /consumo.
--
-- Inventar un denominador acá sería peor que no tener barra: una barra con un
-- tope supuesto se ve igual de convincente que una correcta, y es la clase de
-- número que hace ignorar un aviso que sí importaba.
--
-- Verificados contra supabase.com/pricing el 2026-09-17. Son editables porque
-- los precios cambian y un número codificado envejece en silencio.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public."plan_quotas"
  (source, plan, metric, included, overage_price_usd, overage_block)
VALUES
  -- Free: 500 MB de base. No hay excedente porque el plan no factura de más,
  -- bloquea la escritura. Por eso overage_price_usd va nulo y no en cero: cero
  -- diría "pasarte es gratis".
  ('supabase', 'free', 'supabase.db_size_bytes', 524288000, NULL, 1),

  -- Pro: 8 GB incluidos y USD 0,125 por GB adicional.
  ('supabase', 'pro', 'supabase.db_size_bytes', 8589934592, 0.125, 1073741824)
ON CONFLICT (source, plan, metric) DO NOTHING;
