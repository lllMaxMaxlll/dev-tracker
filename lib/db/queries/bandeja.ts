import "server-only"

import { and, asc, eq, isNull, ne } from "drizzle-orm"

import { db } from "@/lib/db"
import { issues, projectAreas, projects } from "@/lib/db/schema"

/**
 * Órdenes sin revisar: lo que entró por la captura rápida y todavía nadie
 * confirmó. La más vieja primero, como una pila de papeles.
 */
export async function getSinRevisar(userId: string) {
  return db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      description: issues.description,
      type: issues.type,
      priority: issues.priority,
      status: issues.status,
      projectId: issues.projectId,
      areaId: issues.areaId,
      projectName: projects.name,
      projectColor: projects.color,
      areaName: projectAreas.name,
      areaColor: projectAreas.color,
      createdVia: issues.createdVia,
      createdAt: issues.createdAt,
    })
    .from(issues)
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .leftJoin(projectAreas, eq(projectAreas.id, issues.areaId))
    .where(
      and(
        eq(issues.userId, userId),
        isNull(issues.reviewedAt),
        ne(issues.status, "descartado")
      )
    )
    .orderBy(asc(issues.createdAt))
}

export type OrdenSinRevisar = Awaited<ReturnType<typeof getSinRevisar>>[number]
