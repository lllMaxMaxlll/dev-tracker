-- DevTracker · Row Level Security, triggers y índices adicionales
--
-- ⚠️ IMPORTANTE — qué protege esto y qué NO:
--
-- La aplicación consulta con Drizzle, conectándose con el rol dueño de la base,
-- que BYPASSEA RLS. El aislamiento real entre usuarios lo garantiza la app,
-- filtrando siempre por el user_id de la sesión verificada en el servidor
-- (ver lib/auth/require-user.ts).
--
-- RLS acá es defensa en profundidad: la anon key de Supabase es pública y llega
-- al navegador, así que sin estas políticas cualquiera podría leer las tablas
-- por la API REST de Supabase (PostgREST). Con ellas, no.
--
-- Además revocamos todo acceso del rol `anon` a las tablas de dominio.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. updated_at automático
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."profiles";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."profiles"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."github_credentials";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."github_credentials"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."projects";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."projects"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."issues";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."issues"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
DROP TRIGGER IF EXISTS set_updated_at ON public."user_ai_settings";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."user_ai_settings"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Búsqueda por texto en títulos (pg_trgm).
--    Sirve para el buscador de la tabla de problemas y como fallback de la
--    detección de duplicados si el proveedor de embeddings no responde.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS issues_title_trgm_idx
  ON public."issues" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS issues_description_trgm_idx
  ON public."issues" USING gin ("description" gin_trgm_ops);--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles: la columna de pertenencia es `id`, no `user_id`.
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."profiles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_select_own" ON public."profiles";--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON public."profiles"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = id);--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_insert_own" ON public."profiles";--> statement-breakpoint
CREATE POLICY "profiles_insert_own" ON public."profiles"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_update_own" ON public."profiles";--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON public."profiles"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);--> statement-breakpoint
DROP POLICY IF EXISTS "profiles_delete_own" ON public."profiles";--> statement-breakpoint
CREATE POLICY "profiles_delete_own" ON public."profiles"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = id);--> statement-breakpoint
REVOKE ALL ON public."profiles" FROM anon;--> statement-breakpoint

ALTER TABLE public."projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "projects_select_own" ON public."projects";--> statement-breakpoint
CREATE POLICY "projects_select_own" ON public."projects"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "projects_insert_own" ON public."projects";--> statement-breakpoint
CREATE POLICY "projects_insert_own" ON public."projects"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "projects_update_own" ON public."projects";--> statement-breakpoint
CREATE POLICY "projects_update_own" ON public."projects"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "projects_delete_own" ON public."projects";--> statement-breakpoint
CREATE POLICY "projects_delete_own" ON public."projects"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."projects" FROM anon;--> statement-breakpoint
ALTER TABLE public."issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issues" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issues_select_own" ON public."issues";--> statement-breakpoint
CREATE POLICY "issues_select_own" ON public."issues"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issues_insert_own" ON public."issues";--> statement-breakpoint
CREATE POLICY "issues_insert_own" ON public."issues"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issues_update_own" ON public."issues";--> statement-breakpoint
CREATE POLICY "issues_update_own" ON public."issues"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issues_delete_own" ON public."issues";--> statement-breakpoint
CREATE POLICY "issues_delete_own" ON public."issues"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issues" FROM anon;--> statement-breakpoint
ALTER TABLE public."issue_status_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issue_status_history" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issue_status_history_select_own" ON public."issue_status_history";--> statement-breakpoint
CREATE POLICY "issue_status_history_select_own" ON public."issue_status_history"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_status_history_insert_own" ON public."issue_status_history";--> statement-breakpoint
CREATE POLICY "issue_status_history_insert_own" ON public."issue_status_history"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_status_history_update_own" ON public."issue_status_history";--> statement-breakpoint
CREATE POLICY "issue_status_history_update_own" ON public."issue_status_history"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_status_history_delete_own" ON public."issue_status_history";--> statement-breakpoint
CREATE POLICY "issue_status_history_delete_own" ON public."issue_status_history"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issue_status_history" FROM anon;--> statement-breakpoint
ALTER TABLE public."issue_embeddings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issue_embeddings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issue_embeddings_select_own" ON public."issue_embeddings";--> statement-breakpoint
CREATE POLICY "issue_embeddings_select_own" ON public."issue_embeddings"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_embeddings_insert_own" ON public."issue_embeddings";--> statement-breakpoint
CREATE POLICY "issue_embeddings_insert_own" ON public."issue_embeddings"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_embeddings_update_own" ON public."issue_embeddings";--> statement-breakpoint
CREATE POLICY "issue_embeddings_update_own" ON public."issue_embeddings"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_embeddings_delete_own" ON public."issue_embeddings";--> statement-breakpoint
CREATE POLICY "issue_embeddings_delete_own" ON public."issue_embeddings"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issue_embeddings" FROM anon;--> statement-breakpoint
ALTER TABLE public."issue_relations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issue_relations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issue_relations_select_own" ON public."issue_relations";--> statement-breakpoint
CREATE POLICY "issue_relations_select_own" ON public."issue_relations"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_relations_insert_own" ON public."issue_relations";--> statement-breakpoint
CREATE POLICY "issue_relations_insert_own" ON public."issue_relations"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_relations_update_own" ON public."issue_relations";--> statement-breakpoint
CREATE POLICY "issue_relations_update_own" ON public."issue_relations"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_relations_delete_own" ON public."issue_relations";--> statement-breakpoint
CREATE POLICY "issue_relations_delete_own" ON public."issue_relations"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issue_relations" FROM anon;--> statement-breakpoint
ALTER TABLE public."issue_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issue_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issue_links_select_own" ON public."issue_links";--> statement-breakpoint
CREATE POLICY "issue_links_select_own" ON public."issue_links"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_links_insert_own" ON public."issue_links";--> statement-breakpoint
CREATE POLICY "issue_links_insert_own" ON public."issue_links"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_links_update_own" ON public."issue_links";--> statement-breakpoint
CREATE POLICY "issue_links_update_own" ON public."issue_links"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_links_delete_own" ON public."issue_links";--> statement-breakpoint
CREATE POLICY "issue_links_delete_own" ON public."issue_links"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issue_links" FROM anon;--> statement-breakpoint
ALTER TABLE public."commit_link_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."commit_link_suggestions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "commit_link_suggestions_select_own" ON public."commit_link_suggestions";--> statement-breakpoint
CREATE POLICY "commit_link_suggestions_select_own" ON public."commit_link_suggestions"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "commit_link_suggestions_insert_own" ON public."commit_link_suggestions";--> statement-breakpoint
CREATE POLICY "commit_link_suggestions_insert_own" ON public."commit_link_suggestions"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "commit_link_suggestions_update_own" ON public."commit_link_suggestions";--> statement-breakpoint
CREATE POLICY "commit_link_suggestions_update_own" ON public."commit_link_suggestions"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "commit_link_suggestions_delete_own" ON public."commit_link_suggestions";--> statement-breakpoint
CREATE POLICY "commit_link_suggestions_delete_own" ON public."commit_link_suggestions"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."commit_link_suggestions" FROM anon;--> statement-breakpoint
ALTER TABLE public."weekly_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."weekly_summaries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "weekly_summaries_select_own" ON public."weekly_summaries";--> statement-breakpoint
CREATE POLICY "weekly_summaries_select_own" ON public."weekly_summaries"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "weekly_summaries_insert_own" ON public."weekly_summaries";--> statement-breakpoint
CREATE POLICY "weekly_summaries_insert_own" ON public."weekly_summaries"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "weekly_summaries_update_own" ON public."weekly_summaries";--> statement-breakpoint
CREATE POLICY "weekly_summaries_update_own" ON public."weekly_summaries"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "weekly_summaries_delete_own" ON public."weekly_summaries";--> statement-breakpoint
CREATE POLICY "weekly_summaries_delete_own" ON public."weekly_summaries"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."weekly_summaries" FROM anon;--> statement-breakpoint
ALTER TABLE public."insights_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."insights_cache" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "insights_cache_select_own" ON public."insights_cache";--> statement-breakpoint
CREATE POLICY "insights_cache_select_own" ON public."insights_cache"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_cache_insert_own" ON public."insights_cache";--> statement-breakpoint
CREATE POLICY "insights_cache_insert_own" ON public."insights_cache"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_cache_update_own" ON public."insights_cache";--> statement-breakpoint
CREATE POLICY "insights_cache_update_own" ON public."insights_cache"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "insights_cache_delete_own" ON public."insights_cache";--> statement-breakpoint
CREATE POLICY "insights_cache_delete_own" ON public."insights_cache"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."insights_cache" FROM anon;--> statement-breakpoint
ALTER TABLE public."ai_usage_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."ai_usage_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_log_select_own" ON public."ai_usage_log";--> statement-breakpoint
CREATE POLICY "ai_usage_log_select_own" ON public."ai_usage_log"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_log_insert_own" ON public."ai_usage_log";--> statement-breakpoint
CREATE POLICY "ai_usage_log_insert_own" ON public."ai_usage_log"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_log_update_own" ON public."ai_usage_log";--> statement-breakpoint
CREATE POLICY "ai_usage_log_update_own" ON public."ai_usage_log"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "ai_usage_log_delete_own" ON public."ai_usage_log";--> statement-breakpoint
CREATE POLICY "ai_usage_log_delete_own" ON public."ai_usage_log"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."ai_usage_log" FROM anon;--> statement-breakpoint
ALTER TABLE public."github_credentials" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."github_credentials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "github_credentials_select_own" ON public."github_credentials";--> statement-breakpoint
CREATE POLICY "github_credentials_select_own" ON public."github_credentials"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_credentials_insert_own" ON public."github_credentials";--> statement-breakpoint
CREATE POLICY "github_credentials_insert_own" ON public."github_credentials"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_credentials_update_own" ON public."github_credentials";--> statement-breakpoint
CREATE POLICY "github_credentials_update_own" ON public."github_credentials"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "github_credentials_delete_own" ON public."github_credentials";--> statement-breakpoint
CREATE POLICY "github_credentials_delete_own" ON public."github_credentials"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."github_credentials" FROM anon;--> statement-breakpoint
ALTER TABLE public."user_counters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."user_counters" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "user_counters_select_own" ON public."user_counters";--> statement-breakpoint
CREATE POLICY "user_counters_select_own" ON public."user_counters"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_counters_insert_own" ON public."user_counters";--> statement-breakpoint
CREATE POLICY "user_counters_insert_own" ON public."user_counters"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_counters_update_own" ON public."user_counters";--> statement-breakpoint
CREATE POLICY "user_counters_update_own" ON public."user_counters"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_counters_delete_own" ON public."user_counters";--> statement-breakpoint
CREATE POLICY "user_counters_delete_own" ON public."user_counters"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."user_counters" FROM anon;--> statement-breakpoint
ALTER TABLE public."user_ai_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."user_ai_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "user_ai_settings_select_own" ON public."user_ai_settings";--> statement-breakpoint
CREATE POLICY "user_ai_settings_select_own" ON public."user_ai_settings"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_ai_settings_insert_own" ON public."user_ai_settings";--> statement-breakpoint
CREATE POLICY "user_ai_settings_insert_own" ON public."user_ai_settings"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_ai_settings_update_own" ON public."user_ai_settings";--> statement-breakpoint
CREATE POLICY "user_ai_settings_update_own" ON public."user_ai_settings"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "user_ai_settings_delete_own" ON public."user_ai_settings";--> statement-breakpoint
CREATE POLICY "user_ai_settings_delete_own" ON public."user_ai_settings"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."user_ai_settings" FROM anon;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. El rol `anon` no debe poder crear nada nuevo en public.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE CREATE ON SCHEMA public FROM anon;
