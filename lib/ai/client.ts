import "server-only"

import { z } from "zod"

import { ErrorIA } from "@/lib/ai/errors"
import { pedir, pedirJson } from "@/lib/ai/openrouter"
import { getModelo } from "@/lib/ai/models"
import { getConfigTarea, type TipoTarea } from "@/lib/ai/settings"
import { registrarUso, type ConsumoCrudo } from "@/lib/ai/usage"
import type { AiTaskKind } from "@/lib/db/schema"

/**
 * Punto único de acceso al modelo de lenguaje.
 *
 * El transporte vive en `lib/ai/openrouter.ts`. Acá queda lo que no depende del
 * proveedor: el contrato de salida estructurada, el reintento y el registro de
 * consumo.
 *
 * La migración desde Workers AI tocó menos de lo esperado porque este archivo
 * ya mandaba las herramientas en formato OpenAI, que es el que habla
 * OpenRouter. El cuerpo de las peticiones quedó igual; cambió a dónde va.
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

/**
 * Corta la llamada a los 45 segundos.
 *
 * Contra el binding de Cloudflare esto era un `Promise.race`: resolvía el
 * timeout de este lado, pero la inferencia seguía corriendo del otro. Sobre
 * HTTP se puede hacer bien — `AbortSignal` cancela la conexión — así que un
 * modelo colgado deja de gastar tokens.
 */
async function conTimeout<T>(
  fn: (señal: AbortSignal) => Promise<T>
): Promise<T> {
  try {
    return await fn(AbortSignal.timeout(TIMEOUT_MS))
  } catch (error) {
    const abortado =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")

    if (abortado) {
      throw new ErrorIA("TIMEOUT", "El modelo tardó demasiado en responder")
    }

    throw error
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
/**
 * Pide una salida estructurada, con **un reintento**.
 *
 * Los fallos de este tipo son intermitentes: el mismo modelo con el mismo
 * prompt a veces devuelve el número como texto, o contesta en prosa sin usar
 * la herramienta. Medido: con 1, 3 y 6 problemas la priorización funcionó y
 * con 2 falló.
 *
 * Sólo se reintenta lo que puede salir distinto la segunda vez. Un modelo que
 * el catálogo marca sin tool calling falla siempre, así que ése corta de una.
 */
export async function pedirEstructurado<T extends z.ZodType>(
  params: Parameters<typeof unIntentoEstructurado<T>>[0]
): Promise<z.infer<T>> {
  try {
    return await unIntentoEstructurado(params)
  } catch (error) {
    const valeReintentar =
      error instanceof ErrorIA &&
      (error.codigo === "SALIDA_INVALIDA" ||
        error.codigo === "MODELO_SIN_TOOLS")

    if (!valeReintentar) {
      throw error
    }

    console.warn(
      `[ia] reintentando ${params.tipoRegistro}: ${(error as ErrorIA).message}`
    )

    return unIntentoEstructurado(params)
  }
}

async function unIntentoEstructurado<T extends z.ZodType>(params: {
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
    const respuesta = await conTimeout((señal) =>
      pedirJson<RespuestaChat>(
        "/chat/completions",
        {
          model: config.modelo,
          messages: params.mensajes,
          // Formato de OpenAI (`{ type: "function", function: {...} }`), que es
          // el que OpenRouter pasa tal cual a los proveedores que lo
          // implementan. Ya se usaba con Workers AI: el formato plano
          // `{ name, description, parameters }` fallaba con "8001: Invalid
          // input" en varios modelos, y en gpt-oss-120b devolvía las claves en
          // inglés.
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
        },
        señal
      )
    )

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
      "El proveedor no pudo procesar la solicitud.",
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
    const respuesta = await conTimeout((señal) =>
      pedirJson<RespuestaChat>(
        "/chat/completions",
        {
          model: config.modelo,
          messages: params.mensajes,
          temperature: config.temperatura,
          max_tokens: config.maxTokens,
        },
        señal
      )
    )

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
      : new ErrorIA("PROVEEDOR", "El proveedor no pudo generar el texto.")
  }
}

/**
 * Igual que `pedirTexto`, pero devuelve el texto a medida que llega.
 *
 * Tres cosas que salieron de sondear esto contra Workers AI y que siguen
 * valiendo con OpenRouter, porque son propias de SSE y de los modelos, no del
 * proveedor:
 *
 * 1. Los eventos SSE **se parten entre trozos**: un `data: {...}` puede llegar
 *    en tres pedazos. Hay que bufferear y cortar por `\n\n`.
 * 2. Los modelos con razonamiento emiten `delta.reasoning` además de
 *    `delta.content`. Sólo se transmite el contenido: lo otro es el
 *    razonamiento interno, no la respuesta.
 * 3. Ese razonamiento puede ser **la mayoría del stream**: en una prueba,
 *    69 eventos de razonamiento antes de los 28 con texto visible.
 *
 * El `usage` se acumula sumando en vez de asignando. Workers AI lo mandaba
 * incremental en cada trozo; OpenRouter lo manda una sola vez al final, con
 * `stream_options.include_usage`. Sumar funciona en los dos casos.
 *
 * Va con `TransformStream` y no con un `ReadableStream` propio por el punto 3.
 * El motivo original era de workerd — si el `pull` de un ReadableStream no
 * encolaba nada, no se lo volvía a llamar, y decenas de trozos seguidos de puro
 * razonamiento congelaban el stream. En Node esa limitación no existe, pero el
 * `transform` de un TransformStream, que corre por cada trozo de origen encole
 * o no, sigue siendo la forma correcta de expresarlo.
 */
export async function pedirTextoEnStream(params: {
  userId: string
  tarea: TipoTarea
  tipoRegistro: AiTaskKind
  mensajes: Mensaje[]
  /** Se llama al terminar, con el texto completo. */
  alTerminar?: (texto: string) => Promise<void>
}): Promise<ReadableStream<Uint8Array>> {
  const config = await getConfigTarea(params.userId, params.tarea)
  const inicio = Date.now()

  const respuesta = await conTimeout((señal) =>
    pedir(
      "/chat/completions",
      {
        model: config.modelo,
        messages: params.mensajes,
        temperature: config.temperatura,
        max_tokens: config.maxTokens,
        stream: true,
        // Sin esto el stream no trae el bloque `usage` y el panel de consumo
        // quedaría en cero justo para los resúmenes, que son lo más caro.
        stream_options: { include_usage: true },
      },
      señal
    )
  )

  const cuerpo = respuesta.body

  if (!cuerpo) {
    throw new ErrorIA("PROVEEDOR", "El proveedor no devolvió un stream.")
  }

  const decodificador = new TextDecoder()
  const codificador = new TextEncoder()

  let buffer = ""
  let completo = ""
  const consumo: ConsumoCrudo = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    neurons: 0,
  }

  function procesarEvento(
    json: string,
    controlador: TransformStreamDefaultController<Uint8Array>
  ) {
    if (!json || json === "[DONE]") return

    let dato: {
      choices?: { delta?: { content?: string | null } }[]
      usage?: ConsumoCrudo
    }

    try {
      dato = JSON.parse(json)
    } catch {
      return
    }

    if (dato.usage) {
      consumo.prompt_tokens! += dato.usage.prompt_tokens ?? 0
      consumo.completion_tokens! += dato.usage.completion_tokens ?? 0
      consumo.total_tokens! += dato.usage.total_tokens ?? 0
      consumo.neurons! += dato.usage.neurons ?? 0
    }

    const trozo = dato.choices?.[0]?.delta?.content

    if (trozo) {
      completo += trozo
      controlador.enqueue(codificador.encode(trozo))
    }
  }

  function procesarBloque(
    bloque: string,
    controlador: TransformStreamDefaultController<Uint8Array>
  ) {
    for (const linea of bloque.split("\n")) {
      const limpia = linea.trim()

      if (limpia.startsWith("data:")) {
        procesarEvento(limpia.slice(5).trim(), controlador)
      }
    }
  }

  const transformador = new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, controlador) {
      buffer += decodificador.decode(trozo, { stream: true })

      const eventos = buffer.split("\n\n")
      // El último puede estar incompleto: vuelve al buffer.
      buffer = eventos.pop() ?? ""

      for (const evento of eventos) {
        procesarBloque(evento, controlador)
      }
    },

    async flush(controlador) {
      // Lo que quedó sin cerrar con `\n\n`.
      if (buffer.trim()) {
        procesarBloque(buffer, controlador)
      }

      await registrarUso({
        userId: params.userId,
        tarea: params.tipoRegistro,
        modelo: config.modelo,
        consumo,
        latenciaMs: Date.now() - inicio,
        exito: true,
      })

      try {
        await params.alTerminar?.(completo)
      } catch (error) {
        // El texto ya se le mostró al usuario; que falle el guardado no debe
        // romper el stream a esta altura.
        console.error("[pedirTextoEnStream] falló el guardado final", error)
      }
    },
  })

  return cuerpo.pipeThrough(transformador)
}
