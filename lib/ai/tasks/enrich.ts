import "server-only"

import { z } from "zod"

import { pedirEstructurado } from "@/lib/ai/client"
import { listaAcotada, textoAcotado } from "@/lib/ai/schema-helpers"

/**
 * Enriquecimiento: qué información falta para poder reproducir o resolver un
 * problema, y qué causas podrían estar detrás.
 *
 * Las sugerencias se muestran aparte y se insertan en la descripción con un
 * clic; nunca se escriben solas.
 */
const enriquecimientoSchema = z.object({
  faltantes: listaAcotada(textoAcotado(300), 8).default([]),
  causas: listaAcotada(textoAcotado(300), 6).default([]),
  pasosSugeridos: textoAcotado(3000).optional().default(""),
})

export type Enriquecimiento = z.infer<typeof enriquecimientoSchema>

export async function enriquecer(params: {
  userId: string
  titulo: string
  descripcion: string | null
  tipo: string
  proyecto: string | null
}): Promise<Enriquecimiento> {
  const sistema = [
    "Ayudás a completar un problema de desarrollo para que sea reproducible y resoluble.",
    "",
    "Reglas:",
    "- En faltantes va qué información concreta falta. Preguntas cortas, no genéricas.",
    "- En causas van hipótesis plausibles según el título y el tipo. Si no tenés base, dejá la lista vacía.",
    "- En pasosSugeridos va un borrador en markdown para pegar en la descripción, con los pasos para reproducirlo si aplica. Vacío si no corresponde.",
    "- No inventes detalles técnicos que no estén insinuados en el problema.",
    "- Escribís en español rioplatense.",
  ].join("\n")

  const usuario = [
    `Tipo: ${params.tipo}`,
    `Proyecto: ${params.proyecto ?? "sin proyecto"}`,
    `Título: ${params.titulo}`,
    `Descripción actual: ${params.descripcion?.trim() || "(vacía)"}`,
  ].join("\n")

  return pedirEstructurado({
    userId: params.userId,
    tarea: "reasoning",
    tipoRegistro: "enrich",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: usuario },
    ],
    herramienta: {
      nombre: "sugerir_completado",
      descripcion: "Sugiere qué falta y qué podría estar causando el problema",
      parametros: {
        type: "object",
        properties: {
          faltantes: {
            type: "array",
            description: "Qué información concreta falta",
            items: { type: "string" },
          },
          causas: {
            type: "array",
            description: "Hipótesis de causa",
            items: { type: "string" },
          },
          pasosSugeridos: {
            type: "string",
            description: "Borrador en markdown para la descripción",
          },
        },
        required: ["faltantes", "causas"],
      },
    },
    esquema: enriquecimientoSchema,
  })
}
