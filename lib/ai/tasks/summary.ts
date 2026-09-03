import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { weeklySummaries } from "@/lib/db/schema"
import { pedirTexto, pedirTextoEnStream } from "@/lib/ai/client"
import { getConfigTarea } from "@/lib/ai/settings"
import {
  finDeSemana,
  getDatosDeSemana,
  inicioDeSemana,
  type DatosSemana,
} from "@/lib/db/queries/semana"
import { listarCommits } from "@/lib/github/queries"

/** `2026-08-24` a partir de un Date, en UTC. */
function aFecha(d: Date) {
  return d.toISOString().slice(0, 10)
}

const SISTEMA = [
  "Escribís el resumen semanal de trabajo de un desarrollador.",
  "",
  "Estructura, en prosa y sin títulos ni listas:",
  "- Qué avanzó.",
  "- Qué se está estancando o quedó a medias.",
  "- Qué conviene atacar la semana que viene.",
  "",
  "Reglas:",
  "- Cuatro a seis frases en total. Es un resumen, no un informe.",
  "- Referí los problemas por su número (#12) cuando sirva.",
  "- No repitas los conteos crudos: interpretalos.",
  "- Segunda persona, español rioplatense, sin felicitaciones ni relleno.",
].join("\n")

function armarPrompt(
  weekStart: string,
  weekEnd: string,
  datos: DatosSemana,
  commits: string[]
) {
  return [
    `Semana del ${weekStart} al ${weekEnd}.`,
    "",
    `Creados (${datos.creados.length}): ${datos.creados.map((i) => `#${i.number} ${i.title} [${i.type}${i.project ? `, ${i.project}` : ""}]`).join("; ") || "ninguno"}`,
    `Resueltos (${datos.resueltos.length}): ${datos.resueltos.map((i) => `#${i.number} ${i.title}`).join("; ") || "ninguno"}`,
    `Cambios de estado en la semana: ${datos.cambiosDeEstado}`,
    `Problemas abiertos al cierre: ${datos.abiertosAlCierre}`,
    commits.length > 0
      ? `Commits de la semana (${commits.length}): ${commits.slice(0, 40).join("; ")}`
      : "Sin datos de commits.",
  ].join("\n")
}

/**
 * Commits de la semana en los repos vinculados.
 * Nunca lanza: si GitHub no responde, el resumen sale igual sin esa parte.
 */
async function commitsDeLaSemana(
  userId: string,
  inicio: Date,
  fin: Date
): Promise<string[]> {
  try {
    const proyectosConRepo = await db.query.projects.findMany({
      where: (p, { eq: igual, and: y, isNotNull }) =>
        y(igual(p.userId, userId), isNotNull(p.githubRepoFullName)),
      columns: { githubRepoFullName: true },
    })

    const commits: string[] = []

    for (const proyecto of proyectosConRepo.slice(0, 3)) {
      const [owner, repo] = (proyecto.githubRepoFullName ?? "").split("/")

      if (!owner || !repo) continue

      const { datos } = await listarCommits(userId, owner, repo, 30)

      commits.push(
        ...datos
          .filter((c) => {
            const fecha = new Date(c.fecha)

            return fecha >= inicio && fecha < fin
          })
          .map((c) => `${owner}/${repo}: ${c.mensaje}`)
      )
    }

    return commits
  } catch (error) {
    console.error("[resumen] sin datos de GitHub", error)

    return []
  }
}

export type ResumenPreparado =
  | { listo: false; motivo: string }
  | {
      listo: true
      weekStart: string
      weekEnd: string
      sistema: string
      usuario: string
      stats: Record<string, number>
    }

/**
 * Junta los datos y arma el prompt, sin llamar al modelo.
 *
 * Está separado de la generación porque el streaming necesita hacer las
 * consultas ANTES de abrir la respuesta: una vez que el texto empezó a fluir ya
 * no se puede devolver un error legible.
 */
export async function prepararResumenSemanal(params: {
  userId: string
  inicio?: Date
  forzar?: boolean
}): Promise<ResumenPreparado> {
  const inicio = inicioDeSemana(params.inicio ?? new Date())
  const fin = finDeSemana(inicio)
  const weekStart = aFecha(inicio)
  const weekEnd = aFecha(new Date(fin.getTime() - 86_400_000))

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
    return { listo: false, motivo: "ya existe el resumen de esta semana" }
  }

  const datos = await getDatosDeSemana(params.userId, inicio)

  const huboActividad =
    datos.creados.length > 0 ||
    datos.resueltos.length > 0 ||
    datos.cambiosDeEstado > 0

  if (!huboActividad) {
    return { listo: false, motivo: "no hubo actividad esta semana" }
  }

  const commits = await commitsDeLaSemana(params.userId, inicio, fin)

  return {
    listo: true,
    weekStart,
    weekEnd,
    sistema: SISTEMA,
    usuario: armarPrompt(weekStart, weekEnd, datos, commits),
    stats: {
      creados: datos.creados.length,
      resueltos: datos.resueltos.length,
      cambiosDeEstado: datos.cambiosDeEstado,
      abiertosAlCierre: datos.abiertosAlCierre,
      commits: commits.length,
    },
  }
}

async function guardarResumen(params: {
  userId: string
  weekStart: string
  weekEnd: string
  contenido: string
  stats: Record<string, number>
  origen: "cron" | "manual"
}) {
  const { modelo } = await getConfigTarea(params.userId, "reasoning")

  await db
    .insert(weeklySummaries)
    .values({
      userId: params.userId,
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      contentMd: params.contenido.trim(),
      stats: params.stats,
      model: modelo,
      generatedBy: params.origen,
    })
    .onConflictDoUpdate({
      target: [weeklySummaries.userId, weeklySummaries.weekStart],
      set: {
        contentMd: params.contenido.trim(),
        stats: params.stats,
        model: modelo,
        generatedBy: params.origen,
        generatedAt: new Date(),
      },
    })
}

/**
 * Genera y guarda el resumen de una semana, sin streaming.
 *
 * Es la que usa el cron: ahí no hay nadie mirando, así que no tiene sentido
 * transmitir el texto de a poco.
 *
 * Idempotente por `(user_id, week_start)`: si ya existe, no lo regenera salvo
 * que se pida explícitamente, así el cron puede reintentar sin duplicar.
 */
export async function generarResumenSemanal(params: {
  userId: string
  inicio?: Date
  origen: "cron" | "manual"
  forzar?: boolean
}): Promise<{ generado: boolean; motivo?: string }> {
  const preparado = await prepararResumenSemanal({
    userId: params.userId,
    inicio: params.inicio,
    forzar: params.forzar,
  })

  if (!preparado.listo) {
    return { generado: false, motivo: preparado.motivo }
  }

  const contenido = await pedirTexto({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "summary",
    mensajes: [
      { role: "system", content: preparado.sistema },
      { role: "user", content: preparado.usuario },
    ],
  })

  if (!contenido.trim()) {
    return { generado: false, motivo: "el modelo devolvió un resumen vacío" }
  }

  await guardarResumen({
    userId: params.userId,
    weekStart: preparado.weekStart,
    weekEnd: preparado.weekEnd,
    contenido,
    stats: preparado.stats,
    origen: params.origen,
  })

  return { generado: true }
}

/** Resumen en streaming, para el botón "Generar ahora". */
export async function generarResumenEnStream(params: {
  userId: string
  preparado: Extract<ResumenPreparado, { listo: true }>
}) {
  return pedirTextoEnStream({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "summary",
    mensajes: [
      { role: "system", content: params.preparado.sistema },
      { role: "user", content: params.preparado.usuario },
    ],
    alTerminar: async (texto) => {
      if (!texto.trim()) return

      await guardarResumen({
        userId: params.userId,
        weekStart: params.preparado.weekStart,
        weekEnd: params.preparado.weekEnd,
        contenido: texto,
        stats: params.preparado.stats,
        origen: "manual",
      })
    },
  })
}
