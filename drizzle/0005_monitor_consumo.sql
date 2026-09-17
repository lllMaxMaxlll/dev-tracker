-- DevTracker · Monitor de consumo
--
-- Cinco tablas para leer, guardar y alertar sobre el consumo de las cuentas de
-- Vercel, Supabase y OpenRouter.
--
-- ⚠️ Son las únicas tablas del esquema SIN `user_id`, y por lo tanto las únicas
-- con una receta de RLS distinta. El porqué está al pie, en la sección 3.

CREATE TYPE "public"."alert_event_status" AS ENUM('pendiente', 'enviada', 'fallida');--> statement-breakpoint
CREATE TYPE "public"."alert_threshold_kind" AS ENUM('absoluto', 'porcentaje_cuota');--> statement-breakpoint
CREATE TYPE "public"."alert_window" AS ENUM('dia', 'mes');--> statement-breakpoint
CREATE TYPE "public"."usage_aggregation" AS ENUM('suma', 'ultimo', 'maximo');--> statement-breakpoint
CREATE TYPE "public"."usage_source" AS ENUM('vercel', 'supabase', 'openrouter', 'monitor');--> statement-breakpoint
CREATE TABLE "alert_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"period_key" text NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"threshold" numeric(20, 6) NOT NULL,
	"message" text NOT NULL,
	"status" "alert_event_status" DEFAULT 'pendiente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "usage_source" NOT NULL,
	"resource_id" uuid,
	"metric" text NOT NULL,
	"threshold_kind" "alert_threshold_kind" NOT NULL,
	"threshold" numeric(20, 6) NOT NULL,
	"window_kind" "alert_window" DEFAULT 'mes' NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"silenced_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitored_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "usage_source" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"organization" text,
	"status" text,
	"metadata" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_ok" boolean,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "usage_source" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean NOT NULL,
	"skipped" boolean DEFAULT false NOT NULL,
	"resources" integer DEFAULT 0 NOT NULL,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "usage_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"day" date NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"unit" text NOT NULL,
	"aggregation" "usage_aggregation" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_alert_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."alert_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_resource_id_monitored_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."monitored_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_resource_id_monitored_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."monitored_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_events_rule_period_idx" ON "alert_events" USING btree ("rule_id","period_key");--> statement-breakpoint
CREATE INDEX "alert_events_status_idx" ON "alert_events" USING btree ("status","triggered_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alert_rules_source_metric_idx" ON "alert_rules" USING btree ("source","metric");--> statement-breakpoint
CREATE UNIQUE INDEX "monitored_resources_source_external_idx" ON "monitored_resources" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "sync_runs_source_started_idx" ON "sync_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "usage_snapshots_resource_metric_day_idx" ON "usage_snapshots" USING btree ("resource_id","metric","day");--> statement-breakpoint
CREATE INDEX "usage_snapshots_metric_day_idx" ON "usage_snapshots" USING btree ("metric","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_snapshots_resource_day_idx" ON "usage_snapshots" USING btree ("resource_id","day" DESC NULLS LAST);
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. updated_at automático
--
-- Reusa la función public.set_updated_at() de 0001. Ojo: esa función hace
-- `NEW.updated_at = now()` con el nombre de columna hardcodeado, así que la
-- columna tiene que llamarse exactamente así.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON public."monitored_resources";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."monitored_resources"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."alert_rules";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."alert_rules"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. usage_snapshots.updated_at
--
-- No lleva trigger a propósito: el colector hace UPSERT y setea updated_at en
-- el ON CONFLICT DO UPDATE. Un trigger acá sería redundante y encima
-- escondería si la fila la tocó el colector o alguien a mano.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security — receta distinta al resto del esquema
--
-- Las demás tablas llevan ENABLE + FORCE + cuatro policies contra auth.uid().
-- Estas cinco no tienen columna de pertenencia contra la cual escribir esa
-- comparación: describen la infraestructura de la instancia, no a un usuario.
-- Entonces:
--
--   • ENABLE sin policies → PostgREST con la anon key (que es pública y llega
--     al navegador) no ve ni una fila. Esa es la única superficie contra la que
--     RLS protege acá; ver el encabezado de 0001.
--
--   • SIN "FORCE", deliberadamente → FORCE aplica RLS también al dueño de la
--     tabla. Hoy la app se conecta como `postgres`, que tiene BYPASSRLS
--     (verificado con `bun run sondear:uso --fuente=db`), así que daría igual.
--     Pero si esa conexión pasara alguna vez a un rol sin BYPASSRLS, una tabla
--     con FORCE y cero policies quedaría ilegible para la app — y el modo de
--     falla no sería un error sino CERO FILAS EN SILENCIO: el monitor
--     informaría consumo cero para siempre. Sin FORCE, ese escenario no existe.
--
--   • REVOKE explícito, por si algún día alguien agrega una policy permisiva
--     sin pensarlo demasiado.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public."monitored_resources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."usage_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."alert_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."alert_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."sync_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON public."monitored_resources" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public."usage_snapshots" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public."alert_rules" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public."alert_events" FROM anon, authenticated;--> statement-breakpoint
REVOKE ALL ON public."sync_runs" FROM anon, authenticated;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El recurso que representa al propio monitor
--
-- Existe para que la regla "hace rato que no se recolecta" sea una fila más de
-- alert_rules y no un caso especial cableado en el código.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public."monitored_resources" (source, external_id, name)
VALUES ('monitor', 'recoleccion', 'Recolección')
ON CONFLICT (source, external_id) DO NOTHING;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Reglas por defecto
--
-- Van sembradas porque un monitor que no alerta hasta que alguien entra a
-- configurarlo es un monitor que no alerta. Se editan desde /consumo.
--
-- `resource_id` NULL significa "todos los recursos de esta fuente": las reglas
-- interesantes son por proyecto y los proyectos todavía no se descubrieron.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public."alert_rules"
  (source, resource_id, metric, threshold_kind, threshold, window_kind, label)
VALUES
  -- Lo que puede romper de golpe en el plan Free: la base se bloquea al
  -- llenarse el disco.
  ('supabase', NULL, 'supabase.disk_used_bytes', 'porcentaje_cuota', 80, 'dia',
   'Disco de Supabase por encima del 80 %'),

  -- Métrica sintética 0/1. Supabase pausa los proyectos Free tras 7 días sin
  -- actividad, y uno se entera cuando algo deja de responder.
  ('supabase', NULL, 'supabase.project_paused', 'absoluto', 1, 'dia',
   'Proyecto de Supabase pausado'),

  ('openrouter', NULL, 'openrouter.usage_monthly_usd', 'absoluto', 5, 'mes',
   'Gasto de OpenRouter por encima de 5 USD en el mes'),

  -- En Hobby cualquier cargo distinto de cero ya es noticia.
  ('vercel', NULL, 'vercel.cost_usd', 'absoluto', 1, 'mes',
   'Cargos de Vercel por encima de 1 USD en el mes'),

  -- Quién vigila al vigilante. El umbral son horas desde la última corrida
  -- exitosa; con el cron horario de GitHub Actions, seis horas sin recolectar
  -- significa que ese reloj se murió.
  ('monitor', NULL, 'monitor.sync_age_hours', 'absoluto', 6, 'dia',
   'Hace más de 6 h que no se recolecta consumo');
