import { z } from "zod"

/** `owner/repo`, tal como lo devuelve la API de GitHub. */
const repoFullName = z
  .string()
  .trim()
  .regex(/^[\w.-]+\/[\w.-]+$/, "Tiene que tener el formato usuario/repositorio")

export const projectFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Poné un nombre")
    .max(80, "Máximo 80 caracteres"),
  description: z.string().trim().max(500, "Máximo 500 caracteres").optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Tiene que ser un color en formato #rrggbb")
    .optional(),
  githubRepoFullName: z.union([repoFullName, z.literal("")]).optional(),
})

export const createProjectSchema = projectFormSchema

export const updateProjectSchema = projectFormSchema.extend({
  id: z.uuid(),
  isArchived: z.boolean().optional(),
})

export type ProjectFormValues = z.infer<typeof projectFormSchema>

/**
 * Slug legible para las URLs y para que la IA pueda referirse a un proyecto por
 * nombre en la captura en lenguaje natural (Fase 5).
 */
export function slugify(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // saca los acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}
