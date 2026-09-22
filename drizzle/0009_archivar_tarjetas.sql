ALTER TABLE "issues" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "kanban_auto_archive_days" integer;