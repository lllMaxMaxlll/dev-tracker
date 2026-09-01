import "server-only"

import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  issueLinks,
  issueStatusHistory,
  issues,
  projects,
} from "@/lib/db/schema"
import type { IssueFilters } from "@/lib/schemas/issue"

export type IssueListItem = {
  id: string
  number: number
  title: string
  type: string
  priority: string
  status: string
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
  kanbanOrder: number
  projectId: string | null
  projectName: string | null
  projectColor: string | null
}

const CAMPOS_LISTA = {
  id: issues.id,
  number: issues.number,
  title: issues.title,
  type: issues.type,
  priority: issues.priority,
  status: issues.status,
  createdAt: issues.createdAt,
  updatedAt: issues.updatedAt,
  resolvedAt: issues.resolvedAt,
  kanbanOrder: issues.kanbanOrder,
  projectId: issues.projectId,
  projectName: projects.name,
  projectColor: projects.color,
}

/**
 * El filtrado se hace en SQL, no en JavaScript: es lo que permite que la vista
 * escale y que el buscador use el índice trigram de la migración 0001.
 */
function construirWhere(
  userId: string,
  filtros: IssueFilters
): SQL | undefined {
  const condiciones: (SQL | undefined)[] = [eq(issues.userId, userId)]

  if (filtros.proyecto) {
    condiciones.push(eq(projects.slug, filtros.proyecto))
  }

  if (filtros.tipo) {
    condiciones.push(eq(issues.type, filtros.tipo))
  }

  if (filtros.estado === "abiertos") {
    condiciones.push(
      sql`${issues.status} in ('pendiente', 'en_progreso', 'bloqueado')`
    )
  } else if (filtros.estado) {
    condiciones.push(eq(issues.status, filtros.estado))
  }

  if (filtros.prioridad) {
    condiciones.push(eq(issues.priority, filtros.prioridad))
  }

  if (filtros.q) {
    const patron = `%${filtros.q}%`
    condiciones.push(
      or(ilike(issues.title, patron), ilike(issues.description, patron))
    )
  }

  return and(...condiciones)
}

/**
 * El orden se traduce a SQL. `prioridad` necesita un CASE explícito porque el
 * enum de Postgres ordena por su definición y queremos urgente primero.
 */
function construirOrden(filtros: IssueFilters): SQL {
  const dir = filtros.dir === "asc" ? sql`asc` : sql`desc`

  switch (filtros.orden) {
    case "creado":
      return sql`${issues.createdAt} ${dir}`
    case "numero":
      return sql`${issues.number} ${dir}`
    case "prioridad":
      return sql`case ${issues.priority}
        when 'urgente' then 4
        when 'alta' then 3
        when 'media' then 2
        when 'baja' then 1
        else 0 end ${dir}`
    default:
      return sql`${issues.updatedAt} ${dir}`
  }
}

export async function listIssues(
  userId: string,
  filtros: IssueFilters
): Promise<IssueListItem[]> {
  return db
    .select(CAMPOS_LISTA)
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(construirWhere(userId, filtros))
    .orderBy(construirOrden(filtros))
}

/** Para el kanban: mismo filtrado, pero ordenado por la posición manual. */
export async function listIssuesForKanban(
  userId: string,
  filtros: IssueFilters
): Promise<IssueListItem[]> {
  return db
    .select(CAMPOS_LISTA)
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(construirWhere(userId, filtros))
    .orderBy(asc(issues.kanbanOrder), desc(issues.updatedAt))
}

export async function getIssueByNumber(userId: string, numero: number) {
  const [issue] = await db
    .select({
      ...CAMPOS_LISTA,
      description: issues.description,
      firstInProgressAt: issues.firstInProgressAt,
      createdVia: issues.createdVia,
      projectSlug: projects.slug,
    })
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(and(eq(issues.userId, userId), eq(issues.number, numero)))
    .limit(1)

  return issue ?? null
}

export async function getIssueHistory(userId: string, issueId: string) {
  return db
    .select()
    .from(issueStatusHistory)
    .where(
      and(
        eq(issueStatusHistory.userId, userId),
        eq(issueStatusHistory.issueId, issueId)
      )
    )
    .orderBy(asc(issueStatusHistory.changedAt))
}

export async function getIssueLinks(userId: string, issueId: string) {
  return db
    .select()
    .from(issueLinks)
    .where(and(eq(issueLinks.userId, userId), eq(issueLinks.issueId, issueId)))
    .orderBy(desc(issueLinks.createdAt))
}

/** Últimos problemas tocados, para el dashboard (Fase 3). */
export async function listRecentIssues(userId: string, limite = 5) {
  return db
    .select(CAMPOS_LISTA)
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .where(eq(issues.userId, userId))
    .orderBy(desc(issues.updatedAt))
    .limit(limite)
}

export async function countIssuesByStatus(userId: string) {
  return db
    .select({
      status: issues.status,
      total: sql<number>`count(*)::int`,
    })
    .from(issues)
    .where(eq(issues.userId, userId))
    .groupBy(issues.status)
}
