import { z } from "zod"

/** Validación de la página de Ajustes. */
export const aiSettingsSchema = z.object({
  defaultModel: z.string().trim().min(1, "Elegí un modelo por defecto"),
  // "" significa "heredar del modelo por defecto".
  fastModel: z.string().trim().optional(),
  reasoningModel: z.string().trim().optional(),
  embeddingModel: z.string().trim().min(1),
  fastTemperature: z.number().min(0).max(2),
  fastMaxTokens: z.number().int().min(64).max(32_000),
  reasoningTemperature: z.number().min(0).max(2),
  reasoningMaxTokens: z.number().int().min(64).max(32_000),
  requireToolCalling: z.boolean(),
})

export type AiSettingsValues = z.infer<typeof aiSettingsSchema>
