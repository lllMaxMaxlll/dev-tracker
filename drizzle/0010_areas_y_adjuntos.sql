CREATE TABLE "issue_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"path" text NOT NULL,
	"file_name" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_attachments_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "project_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_attachments" ADD CONSTRAINT "issue_attachments_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_areas" ADD CONSTRAINT "project_areas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_areas" ADD CONSTRAINT "project_areas_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_attachments_issue_idx" ON "issue_attachments" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_areas_project_slug_idx" ON "project_areas" USING btree ("project_id","slug");--> statement-breakpoint
CREATE INDEX "project_areas_user_idx" ON "project_areas" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_area_id_project_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."project_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_area_idx" ON "issues" USING btree ("area_id");--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers y RLS de las tablas nuevas, igual que en 0001.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at ON public."project_areas";--> statement-breakpoint
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public."project_areas"
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint

ALTER TABLE public."project_areas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."project_areas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "project_areas_select_own" ON public."project_areas";--> statement-breakpoint
CREATE POLICY "project_areas_select_own" ON public."project_areas"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "project_areas_insert_own" ON public."project_areas";--> statement-breakpoint
CREATE POLICY "project_areas_insert_own" ON public."project_areas"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "project_areas_update_own" ON public."project_areas";--> statement-breakpoint
CREATE POLICY "project_areas_update_own" ON public."project_areas"
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "project_areas_delete_own" ON public."project_areas";--> statement-breakpoint
CREATE POLICY "project_areas_delete_own" ON public."project_areas"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."project_areas" FROM anon;--> statement-breakpoint

ALTER TABLE public."issue_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public."issue_attachments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "issue_attachments_select_own" ON public."issue_attachments";--> statement-breakpoint
CREATE POLICY "issue_attachments_select_own" ON public."issue_attachments"
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_attachments_insert_own" ON public."issue_attachments";--> statement-breakpoint
CREATE POLICY "issue_attachments_insert_own" ON public."issue_attachments"
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);--> statement-breakpoint
DROP POLICY IF EXISTS "issue_attachments_delete_own" ON public."issue_attachments";--> statement-breakpoint
CREATE POLICY "issue_attachments_delete_own" ON public."issue_attachments"
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);--> statement-breakpoint
REVOKE ALL ON public."issue_attachments" FROM anon;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket de fotos.
--
-- Privado: las imágenes se sirven con URLs firmadas que caducan, no por una URL
-- pública que quedaría accesible para siempre a quien la copie.
--
-- El límite de 2 MB por archivo es el techo del servidor. El navegador comprime
-- bastante por debajo (ver lib/utils/comprimir-imagen.ts); esto está para que
-- una subida armada a mano tampoco pueda llenar el bucket.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'adjuntos',
  'adjuntos',
  false,
  2097152,
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;--> statement-breakpoint

-- La primera carpeta de la ruta es el id del usuario: es lo que separa los
-- archivos de una cuenta de los de otra.
DROP POLICY IF EXISTS "adjuntos_select_own" ON storage.objects;--> statement-breakpoint
CREATE POLICY "adjuntos_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );--> statement-breakpoint
DROP POLICY IF EXISTS "adjuntos_insert_own" ON storage.objects;--> statement-breakpoint
CREATE POLICY "adjuntos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );--> statement-breakpoint
DROP POLICY IF EXISTS "adjuntos_delete_own" ON storage.objects;--> statement-breakpoint
CREATE POLICY "adjuntos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'adjuntos'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );
