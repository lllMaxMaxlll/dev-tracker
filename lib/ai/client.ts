import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"
import { z } from "zod"

import { ErrorIA } from "@/lib/ai/errors"
import { getModelo } from "@/lib/ai/models"
import { getConfigTarea, type TipoTarea } from "@/lib/ai/settings"
import { registrarUso, type ConsumoCrudo } from "@/lib/ai/usage"
import type { AiTaskKind } from "@/lib/db/schema"

/**
 * Punto único de acceso a Workers AI.
 *
 * No hay API keys ni cabeceras de identificación: se accede por el binding `AI`
 * declarado en wrangler.jsonc.
 */
type Mensaje = { role: "system" | "user" | "assistant"; content: string }

type RespuestaChat = {
  response?: string
  usage?: ConsumoCrudo
  choices?: {
    finish_reason?: string
    message?: {
      content?: string | null
      tool_calls?: {
        function?: { name?: string; arguments?: string }
      }[]
    }
  }[]
}

const TIMEOUT_MS = 45_000

function ai() {
  return cloudflareEnv.AI as unknown as {
    run: (modelo: string, entrada: unknown) => Promise<unknown>
  }
}

async function conTimeout<T>(promesa: Promise<T>): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promesa,
      new Promise<never>((_, rechazar) => {
        temporizador = setTimeout(
          () =>
            rechazar(
              new ErrorIA("TIMEOUT", "El modelo tardó demasiado en responder")
            ),
          TIMEOUT_MS
        )
      }),
    ])
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Pide una salida estructurada usando **tool calling**, y la valida con Zod
 * antes de devolverla.
 *
 * Nunca se parsea texto libre: es el requisito transversal del pedido. Si el
 * modelo no soporta tools, se corta con un error accionable en vez de intentar
 * adivinar el JSON de una respuesta en prosa.
 */
export async function pedirEstructurado<T extends z.ZodType>(params: {
  userId: string
  tarea: TipoTarea
  tipoRegistro: AiTaskKind
  mensajes: Mensaje[]
  herramienta: {
    nombre: string
    descripcion: string
    /** JSON Schema de los parámetros. */
    parametros: Record<string, unknown>
  }
  esquema: T
}): Promise<z.infer<T>> {
  const config = await getConfigTarea(params.userId, params.tarea)
  const info = await getModelo(config.modelo)

  if (info && !info.soportaTools) {
    throw new ErrorIA(
      "MODELO_SIN_TOOLS",
      `El modelo ${info.nombre} no soporta tool calling, que es necesario para esta operación.`,
      "Elegí otro modelo en Ajustes, o activá el filtro de modelos con tool calling."
    )
  }

  const inicio = Date.now()
  let consumo: ConsumoCrudo | undefined

  try {
    const respuesta = (await conTimeout(
      ai().run(config.modelo, {
        messages: params.mensajes,
        // Formato de OpenAI (`{ type: "function", function: {...} }`).
        // El formato plano `{ name, description, parameters }` que también
        // acepta Workers AI falla con "8001: Invalid input" en varios modelos
        // (glm-4.7-flash, gpt-oss-20b, granite, mistral-small), y en gpt-oss-120b
        // hace que devuelva las claves en inglés. El formato de OpenAI anduvo
        // en todos los modelos probados.
        tools: [
          {
            type: "function",
            function: {
              name: params.herramienta.nombre,
              description: params.herramienta.descripcion,
              parameters: params.herramienta.parametros,
            },
          },
        ],
        temperature: config.temperatura,
        max_tokens: config.maxTokens,
      })
    )) as RespuestaChat

    consumo = respuesta.usage

    const llamada = respuesta.choices?.[0]?.message?.tool_calls?.[0]?.function

    if (!llamada?.arguments) {
      // Pasa con modelos que el catálogo marca con function_calling pero
      // que en la práctica no la usan (por ejemplo qwen3-30b-a3b-fp8).
      throw new ErrorIA(
        "MODELO_SIN_TOOLS",
        `El modelo ${config.modelo} respondió sin usar la herramienta. Probá otro modelo en Ajustes.`,
        respuesta.choices?.[0]?.message?.content?.slice(0, 200) ?? undefined
      )
    }

    let crudo: unknown

    try {
      crudo = JSON.parse(llamada.arguments)

      // Algunos modelos (granite) devuelven el JSON doblemente codificado:
      // una cadena que a su vez contiene el objeto.
      if (typeof crudo === "string") {
        crudo = JSON.parse(crudo)
      }
    } catch {
      throw new ErrorIA(
        "SALIDA_INVALIDA",
        "El modelo devolvió argumentos que no son JSON válido.",
        llamada.arguments.slice(0, 300)
      )
    }

    const validado = params.esquema.safeParse(crudo)

    if (!validado.success) {
      throw new ErrorIA(
        "SALIDA_INVALIDA",
        "La respuesta del modelo no tiene la forma esperada.",
        validado.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ")
      )
    }

    await registrarUso({
      userId: params.userId,
      tarea: params.tipoRegistro,
      modelo: config.modelo,
      consumo,
      latenciaMs: Date.now() - inicio,
      exito: true,
    })

    return validado.data
  } catch (error) {
    await registrarUso({
      userId: params.userId,
      tarea: params.tipoRegistro,
      modelo: config.modelo,
      consumo,
      latenciaMs: Date.now() - inicio,
      exito: false,
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof ErrorIA) {
      throw error
    }

    throw new ErrorIA(
      "PROVEEDOR",
      "Workers AI no pudo procesar la solicitud.",
      error instanceof Error ? error.message : undefined
    )
  }
}

/** Generación de texto libre, para resúmenes e insights (Fase 6). */
export async function pedirTexto(params: {
  userId: string
  tarea: TipoTarea
  tipoRegistro: AiTaskKind
  mensajes: Mensaje[]
}): Promise<string> {
  const config = await getConfigTarea(params.userId, params.tarea)
  const inicio = Date.now()

  try {
    const respuesta = (await conTimeout(
      ai().run(config.modelo, {
        messages: params.mensajes,
        temperature: config.temperatura,
        max_tokens: config.maxTokens,
      })
    )) as RespuestaChat

    const texto =
      respuesta.choices?.[0]?.message?.content ?? respuesta.response ?? ""

    await registrarUso({
      userId: params.userId,
      tarea: params.tipoRegistro,
      modelo: config.modelo,
      consumo: respuesta.usage,
      latenciaMs: Date.now() - inicio,
      exito: true,
    })

    return texto
  } catch (error) {
    await registrarUso({
      userId: params.userId,
      tarea: params.tipoRegistro,
      modelo: config.modelo,
      latenciaMs: Date.now() - inicio,
      exito: false,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error instanceof ErrorIA
      ? error
      : new ErrorIA("PROVEEDOR", "Workers AI no pudo generar el texto.")
  }
}
