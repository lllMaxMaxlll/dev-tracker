ALTER TABLE "user_ai_settings" ALTER COLUMN "default_model" SET DEFAULT '@cf/zai-org/glm-4.7-flash';--> statement-breakpoint
ALTER TABLE "user_ai_settings" ALTER COLUMN "reasoning_model" SET DEFAULT '@cf/openai/gpt-oss-120b';--> statement-breakpoint

-- Las filas ya creadas tienen el modelo por defecto viejo, que era un id de
-- OpenRouter y no existe en Workers AI. Se actualizan sólo las que nunca se
-- tocaron desde la interfaz.
UPDATE "user_ai_settings"
   SET "default_model" = '@cf/zai-org/glm-4.7-flash'
 WHERE "default_model" = 'anthropic/claude-3.5-haiku';--> statement-breakpoint
UPDATE "user_ai_settings"
   SET "reasoning_model" = '@cf/openai/gpt-oss-120b'
 WHERE "reasoning_model" IS NULL;
