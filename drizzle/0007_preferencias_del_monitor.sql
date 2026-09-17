CREATE TABLE "monitor_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."monitor_settings"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
ALTER TABLE public."monitor_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public."monitor_settings" FROM anon, authenticated;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Cuotas de los planes
--
-- Verificado contra supabase.com/pricing y vercel.com/docs/pricing el
-- 2026-09-17. Va en la base y no en el código para que se pueda corregir sin
-- desplegar: los proveedores cambian precios y un número codificado envejece en
-- silencio mientras la barra se sigue viendo igual de convincente.
--
-- Lo que NO se siembra, y por qué:
--
--   • Peticiones de Supabase (REST, Auth, Storage, Realtime): el propio
--     pricing dice "unlimited API requests" en todos los planes. No hay tope, y
--     una barra necesita un denominador real. Se muestran como número.
--   • Egress, Storage y MAU de Supabase: sí tienen tope publicado, pero no hay
--     endpoint público para medirlos (ver 0005). Una cuota sin numerador no
--     dibuja nada.
--   • Vercel Pro: los montos incluidos son "Flat Rate CDN" o crédito mensual, y
--     los precios del excedente son REGIONALES. No hay un número único que
--     poner, así que no se inventa uno.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public."plan_quotas"
  (source, plan, metric, included, overage_price_usd, overage_block)
VALUES
  -- Supabase Pro, lo que sí medimos. El Free ya se sembró en 0006.
  ('supabase', 'pro', 'supabase.disk_used_bytes', 8589934592, 0.125, 1073741824),

  -- Vercel Hobby. Hoy no se puede medir nada de esto —la API de facturación no
  -- existe en Hobby— así que no dibujan barra todavía; quedan cargadas para el
  -- día que la cuenta pase a Pro y los cargos empiecen a llegar.
  -- Sin precio de excedente: en Hobby no se factura de más, se corta.
  ('vercel', 'hobby', 'vercel.data_transfer_bytes', 107374182400, NULL, 1),
  ('vercel', 'hobby', 'vercel.edge_requests', 1000000, NULL, 1),
  ('vercel', 'hobby', 'vercel.function_invocations', 1000000, NULL, 1),
  ('vercel', 'hobby', 'vercel.function_duration_hours', 4, NULL, 1),
  ('vercel', 'hobby', 'vercel.image_transformations', 5000, NULL, 1)
ON CONFLICT (source, plan, metric) DO NOTHING;
