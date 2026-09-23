import "server-only"

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNotNull,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import { db } from "@/lib/db"
import {
  issueLinks,
  issueStatusHistory,
  issues,
  profiles,
  projectAreas,
  projects,
} from "@/lib/db/schema"
import { TAMANO_PAGINA, type IssueFilters } from "@/lib/schemas/issue"

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
  archivedAt: Date | null
  projectId: string | null
  projectName: string | null
  projectColor: string | null
  areaId: string | null
  areaName: string | null
  areaColor: string | null
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
  archivedAt: issues.archivedAt,
  projectId: issues.projectId,
  projectName: projects.name,
  projectColor: projects.color,
  areaId: issues.areaId,
  areaName: projectAreas.name,
  areaColor: projectAreas.color,
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
    condiciones.push(sql`${issues.status} in ('pendiente', 'en_progreso')`)
  } else if (filtros.estado) {
    condiciones.push(eq(issues.status, filtros.estado))
  }

  if (filtros.area) {
    condiciones.push(eq(issues.areaId, filtros.area))
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

/** Una página de la tabla, más el total para armar la paginación. */
export async function listIssues(
  userId: string,
  filtros: IssueFilters
): Promise<{ issues: IssueListItem[]; total: number }> {
  const where = construirWhere(userId, filtros)

  const [filas, [{ total }]] = await Promise.all([
    db
      .select(CAMPOS_LISTA)
      .from(issues)
      .leftJoin(projects, eq(issues.projectId, projects.id))
      .leftJoin(projectAreas, eq(issues.areaId, projectAreas.id))
      .where(where)
      // `number` desempata: sin un orden total, dos filas con la misma fecha
      // pueden saltar de página entre una consulta y la siguiente.
      .orderBy(construirOrden(filtros), desc(issues.number))
      .limit(TAMANO_PAGINA)
      .offset((filtros.pagina - 1) * TAMANO_PAGINA),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(issues)
      .leftJoin(projects, eq(issues.projectId, projects.id))
      .leftJoin(projectAreas, eq(issues.areaId, projectAreas.id))
      .where(where),
  ])

  return { issues: filas, total }
}

/**
 * Cuándo una tarjeta no se ve en el tablero: si se archivó a mano, o si está
 * cerrada y lleva `diasAuto` días sin actividad.
 *
 * El auto-archivado se calcula al consultar en vez de escribirse en la base.
 * Así cambiar la preferencia actúa sobre todo el tablero al instante, y
 * desarchivar una tarjeta basta con tocarla: el trigger de `updated_at` le
 * reinicia el reloj.
 */
function condicionArchivada(diasAuto: number | null): SQL {
  const manual = isNotNull(issues.archivedAt)

  if (diasAuto === null) return manual

  return or(
    manual,
    and(
      sql`${issues.status} in ('resuelto', 'descartado')`,
      sql`${issues.updatedAt} < now() - make_interval(days => ${diasAuto})`
    )
  )!
}

/**
 * Para el kanban: mismo filtrado, pero ordenado por la posición manual. Trae
 * el tablero o las archivadas según el filtro, y cuenta las del otro lado.
 */
export async function listIssuesForKanban(
  userId: string,
  filtros: IssueFilters,
  diasAuto: number | null
): Promise<{ issues: IssueListItem[]; archivadas: number }> {
  const archivada = condicionArchivada(diasAuto)
  const where = construirWhere(userId, filtros)

  const [filas, [{ archivadas }]] = await Promise.all([
    db
      .select(CAMPOS_LISTA)
      .from(issues)
      .leftJoin(projects, eq(issues.projectId, projects.id))
      .leftJoin(projectAreas, eq(issues.areaId, projectAreas.id))
      .where(and(where, filtros.archivadas ? archivada : not(archivada)))
      .orderBy(asc(issues.kanbanOrder), desc(issues.updatedAt)),
    db
      .select({ archivadas: sql<number>`count(*)::int` })
      .from(issues)
      .leftJoin(projects, eq(issues.projectId, projects.id))
      .leftJoin(projectAreas, eq(issues.areaId, projectAreas.id))
      .where(and(where, archivada)),
  ])

  return { issues: filas, archivadas }
}

/** Preferencia de auto-archivado del kanban. `null` = nunca. */
export async function getAutoArchivoKanban(
  userId: string
): Promise<number | null> {
  const [fila] = await db
    .select({ dias: profiles.kanbanAutoArchiveDays })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)

  return fila?.dias ?? null
}

export async function getIssueByNumber(userId: string, numero: number) {
  const [issue] = await db
    .select({
      ...CAMPOS_LISTA,
      description: issues.description,
      areaSlug: projectAreas.slug,
      firstInProgressAt: issues.firstInProgressAt,
      createdVia: issues.createdVia,
      projectSlug: projects.slug,
    })
    .from(issues)
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .leftJoin(projectAreas, eq(issues.areaId, projectAreas.id))
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
