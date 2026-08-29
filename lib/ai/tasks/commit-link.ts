import "server-only"

import { z } from "zod"

import { pedirEstructurado } from "@/lib/ai/client"
import { listaAcotada, textoAcotado } from "@/lib/ai/schema-helpers"

/**
 * Sugerencia de qué commit resuelve qué problema.
 *
 * Devuelve propuestas con confianza y justificación; nunca cambia el estado de
 * un problema. El usuario acepta o rechaza.
 */
const sugerenciaSchema = z.object({
  pares: listaAcotada(
    z.object({
      numeroProblema: z.number().int().positive(),
      sha: z.string().trim().min(6),
      // Algunos modelos devuelven la confianza en porcentaje (85) en vez de
      // 0 a 1. Se normaliza en vez de rechazar la respuesta.
      confianza: z
        .number()
        .transform((v) => (v > 1 ? Math.min(v / 100, 1) : Math.max(v, 0))),
      justificacion: textoAcotado(400),
    }),
    20
  ).default([]),
})

export type ParSugerido = z.infer<typeof sugerenciaSchema>["pares"][number]

export async function sugerirVinculos(params: {
  userId: string
  problemas: { number: number; title: string; description: string | null }[]
  commits: { sha: string; mensaje: string; repo: string }[]
}): Promise<ParSugerido[]> {
  if (params.problemas.length === 0 || params.commits.length === 0) {
    return []
  }

  const listaProblemas = params.problemas
    .map(
      (p) =>
        `#${p.number}: ${p.title}${p.description ? ` — ${p.description.slice(0, 150)}` : ""}`
    )
    .join("\n")

  const listaCommits = params.commits
    .map((c) => `${c.sha.slice(0, 10)} (${c.repo}): ${c.mensaje}`)
    .join("\n")

  const sistema = [
    "Relacionás commits con los problemas que resuelven.",
    "",
    "Reglas:",
    "- Sólo proponé un par si el mensaje del commit se refiere claramente a ese problema.",
    "- Ante la duda, no lo propongas. Es peor una sugerencia equivocada que una de menos.",
    "- Un commit puede resolver varios problemas y un problema puede necesitar varios commits.",
    "- La confianza va de 0 a 1. Usá menos de 0.5 sólo si la relación es dudosa.",
    "- La justificación es una frase corta que explique por qué los relacionás.",
    "- Si ningún commit se corresponde con ningún problema, devolvé la lista vacía.",
  ].join("\n")

  const usuario = [
    "PROBLEMAS ABIERTOS:",
    listaProblemas,
    "",
    "COMMITS RECIENTES:",
    listaCommits,
  ].join("\n")

  const resultado = await pedirEstructurado({
    userId: params.userId,
    tarea: "fast",
    tipoRegistro: "commit_link",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
    herramienta: {
      nombre: "proponer_vinculos",
      descripcion: "Propone qué commit resuelve qué problema",
      parametros: {
        type: "object",
        properties: {
          pares: {
            type: "array",
            description: "Pares propuestos. Vacío si no hay ninguno claro.",
            items: {
              type: "object",
              properties: {
                numeroProblema: { type: "number" },
                sha: { type: "string" },
                confianza: { type: "number" },
                justificacion: { type: "string" },
              },
              required: ["numeroProblema", "sha", "confianza", "justificacion"],
            },
          },
        },
        required: ["pares"],
      },
    },
    esquema: sugerenciaSchema,
  })

  // El modelo puede inventar números o shas: se filtra contra lo que existe.
  const numeros = new Set(params.problemas.map((p) => p.number))
  const shas = new Map(params.commits.map((c) => [c.sha.slice(0, 10), c.sha]))

  return resultado.pares
    .filter((par) => numeros.has(par.numeroProblema))
    .map((par) => ({ ...par, sha: shas.get(par.sha.slice(0, 10)) ?? par.sha }))
    .filter((par) => [...shas.values()].includes(par.sha))
}
