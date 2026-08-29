import "server-only"

import { z } from "zod"

import { pedirEstructurado } from "@/lib/ai/client"
import { listaAcotada, textoAcotado } from "@/lib/ai/schema-helpers"

/**
 * Priorización asistida: "¿qué hago hoy?".
 *
 * Es una sugerencia visual. No modifica ningún dato.
 */
const prioridadSchema = z.object({
  orden: listaAcotada(
    z.object({
      numero: z.number().int().positive(),
      motivo: textoAcotado(400),
    }),
    5
  ).default([]),
})

export type ItemPriorizado = z.infer<typeof prioridadSchema>["orden"][number]

export async function priorizar(params: {
  userId: string
  problemas: {
    number: number
    title: string
    type: string
    priority: string
    status: string
    projectName: string | null
    diasDeAntiguedad: number
  }[]
}): Promise<ItemPriorizado[]> {
  if (params.problemas.length === 0) {
    return []
  }

  const lista = params.problemas
    .map(
      (p) =>
        `#${p.number} [${p.type}/${p.priority}/${p.status}] ${p.projectName ?? "sin proyecto"} — ${p.title} (hace ${p.diasDeAntiguedad} días)`
    )
    .join("\n")

  const sistema = [
    "Ordenás la lista de problemas de un desarrollador según qué conviene atacar hoy.",
    "",
    "Reglas:",
    "- Devolvé entre 3 y 5 ítems, no más.",
    "- No repitas la prioridad declarada como única razón: eso ya lo sabe.",
    "- Pesá también la antigüedad, si algo está bloqueado y si un proyecto se está estancando.",
    "- Un problema bloqueado sólo va primero si lo que hay que hacer es destrabarlo.",
    "- El motivo es una frase corta, concreta y en segunda persona.",
    "- Escribís en español rioplatense.",
  ].join("\n")

  const resultado = await pedirEstructurado({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "prioritize",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: lista },
    ],
    herramienta: {
      nombre: "proponer_orden",
      descripcion: "Propone el orden sugerido para hoy",
      parametros: {
        type: "object",
        properties: {
          orden: {
            type: "array",
            description: "Entre 3 y 5 problemas, del más al menos prioritario",
            items: {
              type: "object",
              properties: {
                numero: { type: "number" },
                motivo: { type: "string" },
              },
              required: ["numero", "motivo"],
            },
          },
        },
        required: ["orden"],
      },
    },
    esquema: prioridadSchema,
  })

  const numeros = new Set(params.problemas.map((p) => p.number))

  return resultado.orden.filter((item) => numeros.has(item.numero))
}
