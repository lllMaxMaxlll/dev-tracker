import "server-only"

import { and, asc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { issues, projectAreas, projects } from "@/lib/db/schema"
import { ESTADOS_ABIERTOS } from "@/lib/schemas/enums"

/**
 * Todas las consultas de este archivo reciben `userId` como primer argumento y
 * lo aplican en el WHERE. No hay ninguna que devuelva filas de otro usuario:
 * es el aislamiento real de la app (ver lib/auth/require-user.ts).
 */

export type ProjectWithCounts = {
  id: string
  name: string
  slug: string
  description: string | null
  color: string | null
  githubRepoFullName: string | null
  isArchived: boolean
  totalIssues: number
  openIssues: number
}

export async function listProjects(
  userId: string,
  { includeArchived = false } = {}
): Promise<ProjectWithCounts[]> {
  const abiertos = ESTADOS_ABIERTOS as readonly string[]

  const filas = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      description: projects.description,
      color: projects.color,
      githubRepoFullName: projects.githubRepoFullName,
      isArchived: projects.isArchived,
      totalIssues: sql<number>`count(${issues.id})::int`,
      openIssues: sql<number>`count(${issues.id}) filter (where ${issues.status} in ${abiertos})::int`,
    })
    .from(projects)
    .leftJoin(
      issues,
      and(eq(issues.projectId, projects.id), eq(issues.userId, userId))
    )
    .where(
      includeArchived
        ? eq(projects.userId, userId)
        : and(eq(projects.userId, userId), eq(projects.isArchived, false))
    )
    .groupBy(projects.id)
    .orderBy(asc(projects.name))

  return filas
}

/** Versión liviana para poblar selects y para el prompt de la IA (Fase 5). */
export async function listProjectOptions(userId: string) {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      color: projects.color,
    })
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.isArchived, false)))
    .orderBy(asc(projects.name))
}

export async function findProjectBySlug(userId: string, slug: string) {
  const [proyecto] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.slug, slug)))
    .limit(1)

  return proyecto ?? null
}

export type AreaConConteo = {
  id: string
  projectId: string
  name: string
  slug: string
  color: string | null
  issues: number
}

/**
 * Áreas de todos los proyectos del usuario, con cuántos problemas tiene cada
 * una. Va en una sola consulta porque quien la usa —el selector del formulario
 * y la administración por proyecto— necesita el mapa completo, y son pocas.
 */
export async function listAreas(userId: string): Promise<AreaConConteo[]> {
  return db
    .select({
      id: projectAreas.id,
      projectId: projectAreas.projectId,
      name: projectAreas.name,
      slug: projectAreas.slug,
      color: projectAreas.color,
      issues: sql<number>`count(${issues.id})::int`,
    })
    .from(projectAreas)
    .leftJoin(issues, eq(issues.areaId, projectAreas.id))
    .where(eq(projectAreas.userId, userId))
    .groupBy(projectAreas.id)
    .orderBy(asc(projectAreas.name))
}

/**
 * Id del área válida para un proyecto, o `null`.
 *
 * Un área siempre pertenece a un proyecto: si no coinciden, el problema se
 * guarda sin área en vez de rechazar el alta. La usan `createIssue` y
 * `updateIssue`, que es donde llega el par elegido en el formulario.
 */
export async function areaValidaParaProyecto(
  userId: string,
  projectId: string | null,
  areaId: string | null
): Promise<string | null> {
  if (!areaId || !projectId) return null

  const [area] = await db
    .select({ id: projectAreas.id })
    .from(projectAreas)
    .where(
      and(
        eq(projectAreas.id, areaId),
        eq(projectAreas.userId, userId),
        eq(projectAreas.projectId, projectId)
      )
    )
    .limit(1)

  return area?.id ?? null
}
