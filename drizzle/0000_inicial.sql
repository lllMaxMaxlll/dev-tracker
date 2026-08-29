-- DevTracker · esquema inicial
--
-- `auth.users` ya existe: la crea Supabase Auth. Drizzle la declara en el
-- schema sólo para poder generar las foreign keys, así que su CREATE TABLE se
-- quitó a mano de esta migración.

CREATE EXTENSION IF NOT EXISTS "vector";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE TYPE "public"."ai_model_role" AS ENUM('fast', 'reasoning', 'embedding');--> statement-breakpoint
CREATE TYPE "public"."ai_task_kind" AS ENUM('capture', 'commit_link', 'summary', 'prioritize', 'enrich', 'insights', 'embedding');--> statement-breakpoint
CREATE TYPE "public"."issue_priority" AS ENUM('baja', 'media', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."issue_source" AS ENUM('manual', 'ai_capture');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('pendiente', 'en_progreso', 'bloqueado', 'resuelto', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('bug', 'feature', 'mejora', 'idea', 'deuda_tecnica');--> statement-breakpoint
CREATE TYPE "public"."link_kind" AS ENUM('commit', 'pr');--> statement-breakpoint
CREATE TYPE "public"."relation_kind" AS ENUM('duplicado', 'relacionado', 'bloquea', 'bloqueado_por');--> statement-breakpoint
CREATE TYPE "public"."status_change_source" AS ENUM('manual', 'ai_suggestion_accepted', 'system');--> statement-breakpoint
CREATE TYPE "public"."suggestion_status" AS ENUM('pendiente', 'aceptada', 'rechazada');--> statement-breakpoint
CREATE TYPE "public"."summary_source" AS ENUM('cron', 'manual');--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task" "ai_task_kind" NOT NULL,
	"provider" text DEFAULT 'openrouter' NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"neurons" real,
	"estimated_cost_usd" numeric(12, 6),
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commit_link_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"repo_full_name" text NOT NULL,
	"commit_sha" text NOT NULL,
	"commit_url" text NOT NULL,
	"commit_message" text,
	"confidence" real NOT NULL,
	"rationale" text,
	"status" "suggestion_status" DEFAULT 'pendiente' NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "github_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp with time zone,
	"is_valid" boolean DEFAULT true NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'dashboard_insights' NOT NULL,
	"content_md" text NOT NULL,
	"input_fingerprint" text,
	"model" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_embeddings" (
	"issue_id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dimensions" integer NOT NULL,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"kind" "link_kind" NOT NULL,
	"url" text NOT NULL,
	"repo_full_name" text,
	"sha" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"related_issue_id" uuid NOT NULL,
	"kind" "relation_kind" DEFAULT 'relacionado' NOT NULL,
	"similarity" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issue_id" uuid NOT NULL,
	"from_status" "issue_status",
	"to_status" "issue_status" NOT NULL,
	"source" "status_change_source" DEFAULT 'manual' NOT NULL,
	"note" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "issue_type" DEFAULT 'bug' NOT NULL,
	"priority" "issue_priority" DEFAULT 'media' NOT NULL,
	"status" "issue_status" DEFAULT 'pendiente' NOT NULL,
	"resolution_url" text,
	"resolution_kind" "link_kind",
	"resolved_at" timestamp with time zone,
	"first_in_progress_at" timestamp with time zone,
	"created_via" "issue_source" DEFAULT 'manual' NOT NULL,
	"kanban_order" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"github_login" text,
	"github_avatar_url" text,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text,
	"github_repo_full_name" text,
	"github_repo_id" integer,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ai_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"openrouter_api_key_encrypted" text,
	"default_model" text DEFAULT 'anthropic/claude-3.5-haiku' NOT NULL,
	"fast_model" text,
	"reasoning_model" text,
	"embedding_provider" text DEFAULT 'workers-ai' NOT NULL,
	"embedding_model" text DEFAULT '@cf/baai/bge-m3' NOT NULL,
	"embedding_dimensions" integer DEFAULT 1024 NOT NULL,
	"fast_temperature" real DEFAULT 0.2 NOT NULL,
	"fast_max_tokens" integer DEFAULT 1024 NOT NULL,
	"reasoning_temperature" real DEFAULT 0.7 NOT NULL,
	"reasoning_max_tokens" integer DEFAULT 2048 NOT NULL,
	"require_tool_calling" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_counters" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"next_issue_number" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"content_md" text NOT NULL,
	"stats" jsonb,
	"model" text,
	"generated_by" "summary_source" DEFAULT 'cron' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_link_suggestions" ADD CONSTRAINT "commit_link_suggestions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commit_link_suggestions" ADD CONSTRAINT "commit_link_suggestions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_credentials" ADD CONSTRAINT "github_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights_cache" ADD CONSTRAINT "insights_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_embeddings" ADD CONSTRAINT "issue_embeddings_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_embeddings" ADD CONSTRAINT "issue_embeddings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_relations" ADD CONSTRAINT "issue_relations_related_issue_id_issues_id_fk" FOREIGN KEY ("related_issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status_history" ADD CONSTRAINT "issue_status_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_status_history" ADD CONSTRAINT "issue_status_history_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_ai_settings" ADD CONSTRAINT "user_ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_counters" ADD CONSTRAINT "user_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_summaries" ADD CONSTRAINT "weekly_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_usage_user_created_idx" ON "ai_usage_log" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_usage_user_task_idx" ON "ai_usage_log" USING btree ("user_id","task");--> statement-breakpoint
CREATE UNIQUE INDEX "commit_suggestions_unique_idx" ON "commit_link_suggestions" USING btree ("user_id","issue_id","commit_sha");--> statement-breakpoint
CREATE INDEX "commit_suggestions_status_idx" ON "commit_link_suggestions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "insights_cache_user_kind_idx" ON "insights_cache" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "issue_embeddings_hnsw_idx" ON "issue_embeddings" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "issue_embeddings_user_idx" ON "issue_embeddings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "issue_links_issue_idx" ON "issue_links" USING btree ("issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "issue_relations_unique_idx" ON "issue_relations" USING btree ("user_id","issue_id","related_issue_id");--> statement-breakpoint
CREATE INDEX "issue_relations_issue_idx" ON "issue_relations" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "status_history_issue_idx" ON "issue_status_history" USING btree ("issue_id","changed_at");--> statement-breakpoint
CREATE INDEX "status_history_user_changed_idx" ON "issue_status_history" USING btree ("user_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "issues_user_number_idx" ON "issues" USING btree ("user_id","number");--> statement-breakpoint
CREATE INDEX "issues_user_status_idx" ON "issues" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "issues_user_project_idx" ON "issues" USING btree ("user_id","project_id");--> statement-breakpoint
CREATE INDEX "issues_user_created_idx" ON "issues" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "issues_user_updated_idx" ON "issues" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_slug_idx" ON "projects" USING btree ("user_id","slug");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_summaries_user_week_idx" ON "weekly_summaries" USING btree ("user_id","week_start");