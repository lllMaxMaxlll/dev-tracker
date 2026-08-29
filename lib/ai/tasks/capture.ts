import "server-only"

import { z } from "zod"

import { pedirEstructurado } from "@/lib/ai/client"
import { ESTADOS, PRIORIDADES, TIPOS } from "@/lib/schemas/enums"

/**
 * Captura en lenguaje natural: convierte una nota tal como la escribirías en un
 * cuaderno en un problema estructurado.
 *
 * El resultado NUNCA se guarda solo: precarga el formulario y el usuario
 * confirma. Es el requisito transversal del pedido — la IA propone, vos aceptás.
 */
const capturaSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(2000).optional().default(""),
  tipo: z.enum(TIPOS),
  prioridad: z.enum(PRIORIDADES),
  estado: z.enum(ESTADOS),
  // El modelo devuelve el slug si reconoció un proyecto de la lista, o el
  // nombre suelto si mencionaste uno que todavía no existe.
  proyectoSlug: z.string().trim().nullable().optional(),
  proyectoNuevo: z.string().trim().max(80).nullable().optional(),
  confianza: z.number().min(0).max(1).optional().default(0.5),
})

export type ResultadoCaptura = z.infer<typeof capturaSchema>

export type ProyectoConocido = { slug: string; name: string }

export async function capturarProblema(params: {
  userId: string
  texto: string
  proyectos: ProyectoConocido[]
}): Promise<ResultadoCaptura> {
  const listaProyectos =
    params.proyectos.length > 0
      ? params.proyectos.map((p) => `- ${p.slug}: ${p.name}`).join("\n")
      : "(el usuario todavía no tiene proyectos)"

  const sistema = [
    "Convertís notas sueltas de un desarrollador en problemas estructurados.",
    "Escribís en español rioplatense, igual que la nota original.",
    "",
    "Reglas:",
    "- El título es una sola línea, concreta y sin punto final.",
    "- La descripción suma sólo lo que la nota ya dice; no inventes pasos, entornos ni causas.",
    "- Si la nota no da para una descripción, dejala vacía.",
    "- Elegí el tipo y la prioridad según lo que la nota expresa, no según lo que suponés.",
    "- Si no hay señal de urgencia, la prioridad es media.",
    "- El estado casi siempre es 'pendiente', salvo que la nota diga que ya está en curso, trabado o resuelto.",
    "",
    "Proyectos que ya existen (slug: nombre):",
    listaProyectos,
    "",
    "Si la nota menciona uno de esos proyectos, devolvé su slug en proyectoSlug.",
    "Si menciona un proyecto que no está en la lista, devolvé su nombre en proyectoNuevo y dejá proyectoSlug en null.",
    "Si no menciona ninguno, dejá los dos en null.",
    "",
    "En confianza va tu certeza de haber interpretado bien la nota, de 0 a 1.",
  ].join("\n")

  return pedirEstructurado({
    userId: params.userId,
    tarea: "fast",
    tipoRegistro: "capture",
    mensajes: [
      { role: "system", content: sistema },
      { role: "user", content: params.texto },
    ],
    herramienta: {
      nombre: "registrar_problema",
      descripcion:
        "Registra el problema estructurado a partir de la nota del usuario",
      parametros: {
        type: "object",
        properties: {
          titulo: {
            type: "string",
            description: "Título de una línea, concreto y sin punto final",
          },
          descripcion: {
            type: "string",
            description:
              "Detalle adicional que la nota ya menciona. Vacío si no hay.",
          },
          tipo: { type: "string", enum: [...TIPOS] },
          prioridad: { type: "string", enum: [...PRIORIDADES] },
          estado: { type: "string", enum: [...ESTADOS] },
          proyectoSlug: {
            type: ["string", "null"],
            description: "Slug de un proyecto existente, o null",
          },
          proyectoNuevo: {
            type: ["string", "null"],
            description:
              "Nombre de un proyecto mencionado que no existe, o null",
          },
          confianza: { type: "number", description: "Entre 0 y 1" },
        },
        required: ["titulo", "tipo", "prioridad", "estado"],
      },
    },
    esquema: capturaSchema,
  })
}
