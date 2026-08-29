import "server-only"

import { eq, and } from "drizzle-orm"

import { db } from "@/lib/db"
import { weeklySummaries } from "@/lib/db/schema"
import { pedirTexto } from "@/lib/ai/client"
import { getConfigTarea } from "@/lib/ai/settings"
import {
  finDeSemana,
  getDatosDeSemana,
  inicioDeSemana,
} from "@/lib/db/queries/semana"
import { listarCommits } from "@/lib/github/queries"

/** `2026-08-24` a partir de un Date, en UTC. */
function aFecha(d: Date) {
  return d.toISOString().slice(0, 10)
}

/**
 * Genera y guarda el resumen de una semana.
 *
 * Idempotente por `(user_id, week_start)`: si ya existe, no lo regenera salvo
 * que se pida explícitamente. El cron puede reintentar sin duplicar.
 */
export async function generarResumenSemanal(params: {
  userId: string
  inicio?: Date
  origen: "cron" | "manual"
  forzar?: boolean
}): Promise<{ generado: boolean; motivo?: string }> {
  const inicio = inicioDeSemana(params.inicio ?? new Date())
  const fin = finDeSemana(inicio)
  const weekStart = aFecha(inicio)

  const [existente] = await db
    .select({ id: weeklySummaries.id })
    .from(weeklySummaries)
    .where(
      and(
        eq(weeklySummaries.userId, params.userId),
        eq(weeklySummaries.weekStart, weekStart)
      )
    )
    .limit(1)

  if (existente && !params.forzar) {
    return { generado: false, motivo: "ya existe el resumen de esta semana" }
  }

  const datos = await getDatosDeSemana(params.userId, inicio)

  const huboActividad =
    datos.creados.length > 0 ||
    datos.resueltos.length > 0 ||
    datos.cambiosDeEstado > 0

  if (!huboActividad) {
    return { generado: false, motivo: "no hubo actividad esta semana" }
  }

  // Los commits son opcionales: si GitHub no responde, el resumen igual sale.
  let commits: string[] = []

  try {
    const proyectosConRepo = await db.query.projects.findMany({
      where: (p, { eq: igual, and: y, isNotNull }) =>
        y(igual(p.userId, params.userId), isNotNull(p.githubRepoFullName)),
      columns: { githubRepoFullName: true },
    })

    for (const proyecto of proyectosConRepo.slice(0, 3)) {
      const [owner, repo] = (proyecto.githubRepoFullName ?? "").split("/")

      if (!owner || !repo) continue

      const { datos: lista } = await listarCommits(
        params.userId,
        owner,
        repo,
        30
      )

      commits.push(
        ...lista
          .filter((c) => {
            const fecha = new Date(c.fecha)

            return fecha >= inicio && fecha < fin
          })
          .map((c) => `${owner}/${repo}: ${c.mensaje}`)
      )
    }
  } catch (error) {
    console.error("[generarResumenSemanal] sin datos de GitHub", error)
    commits = []
  }

  const sistema = [
    "Escribís el resumen semanal de trabajo de un desarrollador.",
    "",
    "Estructura, en prosa y sin títulos ni listas:",
    "- Qué avanzó.",
    "- Qué quedó bloqueado y por qué, si se sabe.",
    "- Qué se está estancando.",
    "- Qué conviene atacar la semana que viene.",
    "",
    "Reglas:",
    "- Cuatro a seis frases en total. Es un resumen, no un informe.",
    "- Referí los problemas por su número (#12) cuando sirva.",
    "- No repitas los conteos crudos: interpretalos.",
    "- Segunda persona, español rioplatense, sin felicitaciones ni relleno.",
  ].join("\n")

  const usuario = [
    `Semana del ${weekStart} al ${aFecha(new Date(fin.getTime() - 86_400_000))}.`,
    "",
    `Creados (${datos.creados.length}): ${datos.creados.map((i) => `#${i.number} ${i.title} [${i.type}${i.project ? `, ${i.project}` : ""}]`).join("; ") || "ninguno"}`,
    `Resueltos (${datos.resueltos.length}): ${datos.resueltos.map((i) => `#${i.number} ${i.title}`).join("; ") || "ninguno"}`,
    `Bloqueados ahora (${datos.bloqueados.length}): ${datos.bloqueados.map((i) => `#${i.number} ${i.title}`).join("; ") || "ninguno"}`,
    `Cambios de estado en la semana: ${datos.cambiosDeEstado}`,
    `Problemas abiertos al cierre: ${datos.abiertosAlCierre}`,
    commits.length > 0
      ? `Commits de la semana (${commits.length}): ${commits.slice(0, 40).join("; ")}`
      : "Sin datos de commits.",
  ].join("\n")

  const contenido = await pedirTexto({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "summary",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
  })

  if (!contenido.trim()) {
    return { generado: false, motivo: "el modelo devolvió un resumen vacío" }
  }

  const { modelo } = await getConfigTarea(params.userId, "reasoning")

  await db
    .insert(weeklySummaries)
    .values({
      userId: params.userId,
      weekStart,
      weekEnd: aFecha(new Date(fin.getTime() - 86_400_000)),
      contentMd: contenido.trim(),
      stats: {
        creados: datos.creados.length,
        resueltos: datos.resueltos.length,
        bloqueados: datos.bloqueados.length,
        cambiosDeEstado: datos.cambiosDeEstado,
        abiertosAlCierre: datos.abiertosAlCierre,
        commits: commits.length,
      },
      model: modelo,
      generatedBy: params.origen,
    })
    .onConflictDoUpdate({
      target: [weeklySummaries.userId, weeklySummaries.weekStart],
      set: {
        contentMd: contenido.trim(),
        model: modelo,
        generatedBy: params.origen,
        generatedAt: new Date(),
      },
    })

  return { generado: true }
}
