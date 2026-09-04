import { z } from "zod"

import {
  ESTADOS,
  PRIORIDADES,
  TIPOS,
  estadoSchema,
  prioridadSchema,
  tipoSchema,
} from "@/lib/schemas/enums"

export const issueFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Poné un título")
    .max(200, "Máximo 200 caracteres"),
  description: z.string().trim().max(10_000).optional(),
  // "" = sin proyecto. Un <select> no puede tener value null.
  projectId: z.union([z.uuid(), z.literal("")]).optional(),
  type: tipoSchema,
  priority: prioridadSchema,
  status: estadoSchema,
})

export const createIssueSchema = issueFormSchema

export const updateIssueSchema = issueFormSchema.extend({
  id: z.uuid(),
})

export const changeStatusSchema = z.object({
  id: z.uuid(),
  status: estadoSchema,
  note: z.string().trim().max(500).optional(),
})

export const linkIssueSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["commit", "pr"]),
  url: z.url("Tiene que ser una URL válida"),
})

export type IssueFormValues = z.infer<typeof issueFormSchema>

/**
 * Filtros y orden de la vista de problemas. Se leen de los search params, así
 * que el estado de la vista es compartible por URL y sobrevive al refresh.
 *
 * El orden se resuelve en SQL, no en el cliente: usa los índices de la
 * migración 0000 y no obliga a traer todo a memoria.
 */
export const ORDENES = ["actualizado", "creado", "prioridad", "numero"] as const

export const issueFiltersSchema = z.object({
  // El kanban es la vista por defecto: entrar a la sección es casi siempre
  // querer ver en qué anda cada cosa, no leer una tabla ordenada.
  vista: z.enum(["tabla", "kanban"]).default("kanban"),
  proyecto: z.string().optional(),
  tipo: z.enum(TIPOS).optional(),
  // `abiertos` no es un estado de la base: agrupa los tres que no están
  // cerrados. Existe para que la tarjeta "Abiertos" del dashboard pueda
  // enlazar a exactamente lo que cuenta.
  estado: z.enum([...ESTADOS, "abiertos"]).optional(),
  prioridad: z.enum(PRIORIDADES).optional(),
  q: z.string().trim().max(100).optional(),
  orden: z.enum(ORDENES).default("actualizado"),
  dir: z.enum(["asc", "desc"]).default("desc"),
})

export type Orden = (typeof ORDENES)[number]

export const ETIQUETAS_ORDEN: Record<Orden, string> = {
  actualizado: "Última actividad",
  creado: "Fecha de alta",
  prioridad: "Prioridad",
  numero: "Número",
}

export type IssueFilters = z.infer<typeof issueFiltersSchema>
