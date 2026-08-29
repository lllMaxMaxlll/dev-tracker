CREATE TABLE "github_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"cache_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_cache" ADD CONSTRAINT "github_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_cache_user_key_idx" ON "github_cache" USING btree ("user_id","cache_key");--> statement-breakpoint
CREATE INDEX "github_cache_expires_idx" ON "github_cache" USING btree ("expires_at");--> statement-breakpoint

-- Row Level Security, igual que el resto de las tablas de dominio.
-- Ver el encabezado de 0001 para el porqué (defensa en profundidad contra la
-- API REST de Supabase; el aislamiento real lo hace la aplicación).
ALTER TABLE public."github_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."github_cache" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "github_cache_select_own" ON public."github_cache";--> statement-breakpoint
CREATE POLICY "github_cache_select_own" ON public."github_cache"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_cache_insert_own" ON public."github_cache";--> statement-breakpoint
CREATE POLICY "github_cache_insert_own" ON public."github_cache"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_cache_update_own" ON public."github_cache";--> statement-breakpoint
CREATE POLICY "github_cache_update_own" ON public."github_cache"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_cache_delete_own" ON public."github_cache";--> statement-breakpoint
CREATE POLICY "github_cache_delete_own" ON public."github_cache"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."github_cache" FROM anon;
