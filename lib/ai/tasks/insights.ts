import "server-only"

import { pedirTexto } from "@/lib/ai/client"
import { duracionLegible } from "@/lib/utils/fechas"
import type { Distribucion, ResumenMetricas } from "@/lib/db/queries/metrics"

/**
 * Observaciones sobre los propios patrones de trabajo.
 *
 * Texto libre, no estructurado: acá no hay nada que guardar en la base, así
 * que no hace falta tool calling.
 */
export async function generarInsights(params: {
  userId: string
  resumen: ResumenMetricas
  porTipo: Distribucion[]
  porProyecto: Distribucion[]
  tiempoPorTipo: { tipo: string; promedioMs: number | null; total: number }[]
  estancados: { number: number; title: string; diasSinMovimiento: number }[]
}): Promise<string> {
  const sistema = [
    "Escribís observaciones sobre los patrones de trabajo de un desarrollador, a partir de sus métricas.",
    "",
    "Reglas:",
    "- Dos o tres frases, en un solo párrafo. Nada de listas ni títulos.",
    "- Señalá patrones, no repitas los números tal cual: el usuario ya los ve en los gráficos.",
    "- Si algo se está estancando, decilo con nombre y apellido.",
    "- Si los datos son pocos para sacar conclusiones, decilo en una frase y no inventes.",
    "- Segunda persona, español rioplatense, sin exageraciones ni felicitaciones.",
  ].join("\n")

  const tiempos = params.tiempoPorTipo
    .filter((t) => t.promedioMs !== null)
    .map(
      (t) =>
        `${t.tipo}: ${duracionLegible(t.promedioMs!)} (${t.total} resueltos)`
    )
    .join("; ")

  const datos = [
    `Abiertos: ${params.resumen.abiertos}. En progreso: ${params.resumen.enProgreso}. Resueltos esta semana: ${params.resumen.resueltosEstaSemana}.`,
    params.resumen.tiempoPromedioMs !== null
      ? `Tiempo promedio de resolución: ${duracionLegible(params.resumen.tiempoPromedioMs)} sobre ${params.resumen.muestraPromedio} problemas.`
      : "Todavía no hay problemas resueltos.",
    tiempos ? `Tiempo promedio por tipo: ${tiempos}.` : "",
    `Distribución por tipo: ${params.porTipo.map((d) => `${d.etiqueta} ${d.total}`).join(", ") || "sin datos"}.`,
    `Por proyecto: ${params.porProyecto.map((d) => `${d.etiqueta} ${d.total}`).join(", ") || "sin datos"}.`,
    params.estancados.length > 0
      ? `Sin movimiento hace tiempo: ${params.estancados.map((e) => `#${e.number} "${e.title}" (${e.diasSinMovimiento} días)`).join("; ")}.`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  return pedirTexto({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "insights",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: datos },
    ],
  })
}
