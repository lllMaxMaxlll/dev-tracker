import { z } from "zod"

/**
 * Áreas o módulos dentro de un proyecto: "checkout", "api", "infra". Son del
 * usuario, así que no hay lista fija; lo único cerrado es la paleta, para que
 * el tablero no termine con veinte colores que no se distinguen entre sí.
 */
export const COLORES_AREA = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#ec4899",
  "#8b5cf6",
  "#64748b",
] as const

const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Tiene que ser un color en formato #rrggbb")

export const areaFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné un nombre")
    .max(40, "Máximo 40 caracteres"),
  color: z.union([color, z.literal("")]).optional(),
})

export const createAreaSchema = areaFormSchema.extend({
  projectId: z.uuid(),
})

export const updateAreaSchema = areaFormSchema.extend({
  id: z.uuid(),
})

export type AreaFormValues = z.infer<typeof areaFormSchema>
