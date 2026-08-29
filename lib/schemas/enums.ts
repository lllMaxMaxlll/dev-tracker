import { z } from "zod"

/**
 * Enums de dominio compartidos entre el esquema de la base, los formularios y
 * las server actions. Los valores van en español porque se muestran tal cual
 * en la interfaz; las etiquetas agregan el acento y la mayúscula.
 */
export const TIPOS = [
  "bug",
  "feature",
  "mejora",
  "idea",
  "deuda_tecnica",
] as const

export const PRIORIDADES = ["baja", "media", "alta", "urgente"] as const

export const ESTADOS = [
  "pendiente",
  "en_progreso",
  "bloqueado",
  "resuelto",
  "descartado",
] as const

export const tipoSchema = z.enum(TIPOS)
export const prioridadSchema = z.enum(PRIORIDADES)
export const estadoSchema = z.enum(ESTADOS)

export type Tipo = z.infer<typeof tipoSchema>
export type Prioridad = z.infer<typeof prioridadSchema>
export type Estado = z.infer<typeof estadoSchema>

export const ETIQUETAS_TIPO: Record<Tipo, string> = {
  bug: "Bug",
  feature: "Feature",
  mejora: "Mejora",
  idea: "Idea",
  deuda_tecnica: "Deuda técnica",
}

export const ETIQUETAS_PRIORIDAD: Record<Prioridad, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
  urgente: "Urgente",
}

export const ETIQUETAS_ESTADO: Record<Estado, string> = {
  pendiente: "Pendiente",
  en_progreso: "En progreso",
  bloqueado: "Bloqueado",
  resuelto: "Resuelto",
  descartado: "Descartado",
}

/** Estados que cuentan como "abierto" para métricas y filtros por defecto. */
export const ESTADOS_ABIERTOS = [
  "pendiente",
  "en_progreso",
  "bloqueado",
] as const satisfies readonly Estado[]

/** Orden de las columnas del kanban. */
export const ORDEN_KANBAN = ESTADOS
