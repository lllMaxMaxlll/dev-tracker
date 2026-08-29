import "server-only"

import { and, asc, eq, gte, lt, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueStatusHistory, issues, projects } from "@/lib/db/schema"

/** Lunes de la semana de `fecha`, a las 00:00 UTC. */
export function inicioDeSemana(fecha = new Date()): Date {
  const d = new Date(
    Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate())
  )
  // getUTCDay: 0 domingo … 6 sábado. Queremos lunes.
  const desplazamiento = (d.getUTCDay() + 6) % 7

  d.setUTCDate(d.getUTCDate() - desplazamiento)

  return d
}

export function finDeSemana(inicio: Date): Date {
  const d = new Date(inicio)
  d.setUTCDate(d.getUTCDate() + 7)

  return d
}

export type DatosSemana = {
  creados: {
    number: number
    title: string
    type: string
    project: string | null
  }[]
  resueltos: { number: number; title: string; project: string | null }[]
  bloqueados: { number: number; title: string; project: string | null }[]
  cambiosDeEstado: number
  abiertosAlCierre: number
}

/** Todo lo que pasó en una semana, para alimentar el resumen. */
export async function getDatosDeSemana(
  userId: string,
  inicio: Date
): Promise<DatosSemana> {
  const fin = finDeSemana(inicio)

  const [creados, resueltos, bloqueados, cambios, abiertos] = await Promise.all(
    [
      db
        .select({
          number: issues.number,
          title: issues.title,
          type: issues.type,
          project: projects.name,
        })
        .from(issues)
        .leftJoin(projects, eq(projects.id, issues.projectId))
        .where(
          and(
            eq(issues.userId, userId),
            gte(issues.createdAt, inicio),
            lt(issues.createdAt, fin)
          )
        )
        .orderBy(asc(issues.number)),

      db
        .select({
          number: issues.number,
          title: issues.title,
          project: projects.name,
        })
        .from(issues)
        .leftJoin(projects, eq(projects.id, issues.projectId))
        .where(
          and(
            eq(issues.userId, userId),
            eq(issues.status, "resuelto"),
            gte(issues.resolvedAt, inicio),
            lt(issues.resolvedAt, fin)
          )
        )
        .orderBy(asc(issues.number)),

      db
        .select({
          number: issues.number,
          title: issues.title,
          project: projects.name,
        })
        .from(issues)
        .leftJoin(projects, eq(projects.id, issues.projectId))
        .where(and(eq(issues.userId, userId), eq(issues.status, "bloqueado")))
        .orderBy(asc(issues.number)),

      db
        .select({ total: sql<number>`count(*)::int` })
        .from(issueStatusHistory)
        .where(
          and(
            eq(issueStatusHistory.userId, userId),
            gte(issueStatusHistory.changedAt, inicio),
            lt(issueStatusHistory.changedAt, fin)
          )
        ),

      db
        .select({ total: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            eq(issues.userId, userId),
            sql`${issues.status} in ('pendiente','en_progreso','bloqueado')`
          )
        ),
    ]
  )

  return {
    creados,
    resueltos,
    bloqueados,
    cambiosDeEstado: cambios[0]?.total ?? 0,
    abiertosAlCierre: abiertos[0]?.total ?? 0,
  }
}

/** Problemas abiertos sin movimiento, para insights y priorización. */
export async function getEstancados(userId: string, dias = 14) {
  const limite = new Date(Date.now() - dias * 86_400_000)

  return db
    .select({
      number: issues.number,
      title: issues.title,
      diasSinMovimiento: sql<number>`floor(extract(epoch from (now() - ${issues.updatedAt})) / 86400)::int`,
    })
    .from(issues)
    .where(
      and(
        eq(issues.userId, userId),
        lt(issues.updatedAt, limite),
        sql`${issues.status} in ('pendiente','en_progreso','bloqueado')`
      )
    )
    .orderBy(asc(issues.updatedAt))
    .limit(5)
}

/** Problemas abiertos con su antigüedad, para la priorización. */
export async function getAbiertosParaPriorizar(userId: string) {
  return db
    .select({
      number: issues.number,
      title: issues.title,
      type: issues.type,
      priority: issues.priority,
      status: issues.status,
      projectName: projects.name,
      diasDeAntiguedad: sql<number>`floor(extract(epoch from (now() - ${issues.createdAt})) / 86400)::int`,
    })
    .from(issues)
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .where(
      and(
        eq(issues.userId, userId),
        sql`${issues.status} in ('pendiente','en_progreso','bloqueado')`
      )
    )
    .orderBy(asc(issues.createdAt))
    .limit(40)
}
