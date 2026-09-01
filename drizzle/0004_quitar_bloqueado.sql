-- Quita el estado `bloqueado`.
--
-- El SQL que genera drizzle-kit para esto no sirve tal cual: hace DROP TYPE
-- mientras issue_status_history todavía usa el tipo, y convierte issues.status
-- al enum nuevo sin antes reasignar las filas que están en 'bloqueado'. Las dos
-- cosas fallan. Este archivo ordena los pasos a mano.

-- 1. El historial pasa a texto ANTES que nada. Es un registro de lo que pasó:
--    tiene que poder conservar 'bloqueado' en las filas viejas en vez de que
--    las reescribamos y el log mienta. Además libera el tipo para poder
--    borrarlo.
ALTER TABLE "issue_status_history" ALTER COLUMN "from_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "issue_status_history" ALTER COLUMN "to_status" SET DATA TYPE text;--> statement-breakpoint

-- 2. issues.status a texto para poder reasignar valores.
ALTER TABLE "issues" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint

-- 3. Los problemas que estaban bloqueados vuelven a pendiente. Su historial
--    conserva el paso por 'bloqueado', así que no se pierde el dato de que
--    alguna vez lo estuvieron.
UPDATE "issues" SET "status" = 'pendiente' WHERE "status" = 'bloqueado';--> statement-breakpoint

-- 4. Recrear el tipo sin el valor.
DROP TYPE "public"."issue_status";--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('pendiente', 'en_progreso', 'resuelto', 'descartado');--> statement-breakpoint

-- 5. Volver a la columna tipada.
ALTER TABLE "issues" ALTER COLUMN "status" SET DATA TYPE "public"."issue_status" USING "status"::"public"."issue_status";--> statement-breakpoint
ALTER TABLE "issues" ALTER COLUMN "status" SET DEFAULT 'pendiente'::"public"."issue_status";
