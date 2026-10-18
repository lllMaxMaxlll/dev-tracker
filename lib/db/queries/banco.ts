import "server-only"

import { and, asc, desc, eq, gte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  issueStatusHistory,
  issues,
  projectAreas,
  projects,
} from "@/lib/db/schema"

/**
 * Consultas del Banco de trabajo, la página de inicio.
 *
 * El banco tiene tres puestos: más de tres órdenes en progreso a la vez es
 * repartir la atención, no avanzar. El límite es una regla de la interfaz,
 * no del servidor: si hace falta pasarlo (desde el kanban, por ejemplo), se
 * puede, y el banco lo muestra como exceso.
 */
export const PUESTOS_DEL_BANCO = 3

const columnasDeOrden = {
  id: issues.id,
  number: issues.number,
  title: issues.title,
  type: issues.type,
  priority: issues.priority,
  status: issues.status,
  projectName: projects.name,
  projectColor: projects.color,
  areaName: projectAreas.name,
  firstInProgressAt: issues.firstInProgressAt,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
}

export type OrdenDelBanco = Awaited<ReturnType<typeof getEnProgreso>>[number]

/** Las órdenes que están en el banco, de la más vieja a la más nueva. */
export async function getEnProgreso(userId: string) {
  return db
    .select(columnasDeOrden)
    .from(issues)
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .leftJoin(projectAreas, eq(projectAreas.id, issues.areaId))
    .where(and(eq(issues.userId, userId), eq(issues.status, "en_progreso")))
    .orderBy(asc(issues.firstInProgressAt))
}

/**
 * La cola: pendientes por prioridad y, a igual prioridad, la más vieja
 * primero. Es el orden sin IA; la IA lo puede reordenar a pedido.
 */
export async function getCola(userId: string, limite = 8) {
  return db
    .select(columnasDeOrden)
    .from(issues)
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .leftJoin(projectAreas, eq(projectAreas.id, issues.areaId))
    .where(and(eq(issues.userId, userId), eq(issues.status, "pendiente")))
    .orderBy(
      sql`case ${issues.priority}
        when 'urgente' then 0 when 'alta' then 1
        when 'media' then 2 else 3 end`,
      asc(issues.createdAt)
    )
    .limit(limite)
}

export type EventoDeActividad = {
  cuando: Date
  numero: number
  titulo: string
  desde: string | null
  hacia: string
}

/**
 * Los últimos cambios de estado de los dos últimos días. El alta de un
 * problema también queda en el historial (desde `null`), así que no hace
 * falta una segunda consulta para las órdenes nuevas.
 */
export async function getActividadReciente(
  userId: string,
  limite = 8
): Promise<EventoDeActividad[]> {
  const desde = new Date(Date.now() - 2 * 86_400_000)

  return db
    .select({
      cuando: issueStatusHistory.changedAt,
      numero: issues.number,
      titulo: issues.title,
      desde: issueStatusHistory.fromStatus,
      hacia: issueStatusHistory.toStatus,
    })
    .from(issueStatusHistory)
    .innerJoin(issues, eq(issues.id, issueStatusHistory.issueId))
    .where(
      and(
        eq(issueStatusHistory.userId, userId),
        gte(issueStatusHistory.changedAt, desde)
      )
    )
    .orderBy(desc(issueStatusHistory.changedAt))
    .limit(limite)
}
