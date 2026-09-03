import "server-only"

import { pedirCatalogo } from "@/lib/ai/openrouter"

/**
 * Catálogo de modelos de OpenRouter.
 *
 * Sale de `GET /api/v1/models`, que es **público**: no lleva API key. Eso
 * importa más de lo que parece — la página de Ajustes puede listar y describir
 * modelos aunque todavía no haya credenciales cargadas.
 *
 * Trae por modelo la ventana de contexto, si soporta tool calling y el precio,
 * que es justo lo que Ajustes muestra. Antes esto era `env.AI.models()` de
 * Workers AI, que devolvía las mismas cosas pero enterradas en un array de
 * `properties` con valores en texto.
 */
export type ModeloCatalogo = {
  id: string
  nombre: string
  proveedor: string
  descripcion: string
  tarea: string
  contexto: number | null
  soportaTools: boolean
  razona: boolean
  precioEntradaUsd: number | null
  precioSalidaUsd: number | null
  /** Dimensiones de salida, sólo para modelos de embeddings. */
  dimensiones: number | null
}

type ModeloCrudo = {
  id: string
  name?: string
  description?: string
  context_length?: number | null
  architecture?: { modality?: string | null }
  pricing?: { prompt?: string | null; completion?: string | null }
  supported_parameters?: string[] | null
}

/**
 * OpenRouter publica el precio en USD **por token**, con notación decimal en
 * texto (`"0.0000001"`). El resto de la app razona por millón de tokens, que es
 * como se leen estos números en cualquier tabla de precios.
 */
function precioPorMillon(valor: string | null | undefined): number | null {
  if (valor == null) {
    return null
  }

  const n = Number(valor)

  return Number.isFinite(n) ? n * 1_000_000 : null
}

/** El id tiene la forma `<proveedor>/<modelo>`. */
function proveedorDe(id: string): string {
  return id.split("/")[0] ?? "desconocido"
}

function normalizar(modelo: ModeloCrudo): ModeloCatalogo {
  const parametros = modelo.supported_parameters ?? []

  return {
    id: modelo.id,
    nombre: modelo.name ?? modelo.id,
    proveedor: proveedorDe(modelo.id),
    descripcion: modelo.description ?? "",
    // OpenRouter no tiene el concepto de "task" de Workers AI: todo lo que
    // sirve por /chat/completions es generación de texto. La modalidad dice qué
    // acepta de entrada, no qué hace.
    tarea: "Text Generation",
    contexto: modelo.context_length ?? null,
    soportaTools: parametros.includes("tools"),
    razona: parametros.includes("reasoning"),
    precioEntradaUsd: precioPorMillon(modelo.pricing?.prompt),
    precioSalidaUsd: precioPorMillon(modelo.pricing?.completion),
    dimensiones: null,
  }
}

/**
 * Modelos de embeddings.
 *
 * Van a mano y no salen del catálogo porque `/api/v1/models` **no los lista**:
 * sondeado, devuelve 425 modelos y ninguno de embeddings, aunque el endpoint
 * `/api/v1/embeddings` exista y funcione.
 *
 * Los dos aceptan el parámetro `dimensions`, así que se les piden 1024 y el
 * vector entra en la columna `vector(1024)` con su índice HNSW sin migrar nada.
 * Ver lib/ai/embeddings.ts.
 */
export const MODELOS_EMBEDDINGS: ModeloCatalogo[] = [
  {
    id: "openai/text-embedding-3-small",
    nombre: "OpenAI: text-embedding-3-small",
    proveedor: "openai",
    descripcion:
      "Rápido y barato. 1536 dimensiones nativas, recortables a 1024 sin perder capacidad de representar el concepto.",
    tarea: "Embeddings",
    contexto: 8191,
    soportaTools: false,
    razona: false,
    precioEntradaUsd: 0.02,
    precioSalidaUsd: null,
    dimensiones: 1024,
  },
  {
    id: "openai/text-embedding-3-large",
    nombre: "OpenAI: text-embedding-3-large",
    proveedor: "openai",
    descripcion:
      "Más preciso y más caro. 3072 dimensiones nativas, recortadas a 1024 acá.",
    tarea: "Embeddings",
    contexto: 8191,
    soportaTools: false,
    razona: false,
    precioEntradaUsd: 0.13,
    precioSalidaUsd: null,
    dimensiones: 1024,
  },
]

/** El que se usa si los ajustes del usuario apuntan a un modelo que ya no existe. */
export const MODELO_EMBEDDINGS_POR_DEFECTO = MODELOS_EMBEDDINGS[0].id

/** Barato, rápido y con tool calling: estructurar texto, no escribir. */
export const MODELO_RAPIDO_POR_DEFECTO = "openai/gpt-oss-20b"

/** Para resúmenes, priorización e insights. */
export const MODELO_RAZONADOR_POR_DEFECTO = "openai/gpt-oss-120b"

/**
 * Equivalencias directas entre modelos de Workers AI y de OpenRouter.
 *
 * gpt-oss es el mismo modelo servido por otro proveedor, así que el resultado
 * no cambia. glm-4.7-flash no está en OpenRouter y cae a la alternativa.
 */
const EQUIVALENCIAS: Record<string, string> = {
  "@cf/openai/gpt-oss-120b": "openai/gpt-oss-120b",
  "@cf/openai/gpt-oss-20b": "openai/gpt-oss-20b",
  "@cf/baai/bge-m3": MODELO_EMBEDDINGS_POR_DEFECTO,
}

/**
 * Traduce un id de Workers AI que haya quedado guardado en `user_ai_settings`.
 *
 * Las filas de ajustes de los usuarios existentes apuntan a ids `@cf/...`, que
 * OpenRouter rechaza. Se resuelve al leer y no con una migración a propósito:
 * así la base no se toca, y el id nuevo queda escrito recién cuando el usuario
 * elija un modelo en Ajustes.
 */
export function resolverModeloHeredado(
  id: string,
  alternativa: string
): string {
  if (!id.startsWith("@cf/")) {
    return id
  }

  return EQUIVALENCIAS[id] ?? alternativa
}

/**
 * Caché en memoria de la instancia.
 *
 * El catálogo es global (no depende del usuario), así que no va a la tabla de
 * caché por usuario. Si la instancia se recicla se vuelve a pedir: la llamada
 * es gratis y rápida.
 */
let cache: { modelos: ModeloCatalogo[]; expira: number } | undefined
const TTL_MS = 60 * 60 * 1000

export async function getCatalogo(): Promise<ModeloCatalogo[]> {
  if (cache && cache.expira > Date.now()) {
    return cache.modelos
  }

  const respuesta = await pedirCatalogo<{ data?: ModeloCrudo[] }>()
  const modelos = (respuesta.data ?? []).map(normalizar)

  cache = { modelos, expira: Date.now() + TTL_MS }

  return modelos
}

/** Modelos de generación de texto, que son los que se eligen por tarea. */
export async function getModelosDeTexto(): Promise<ModeloCatalogo[]> {
  const catalogo = await getCatalogo()

  return catalogo.sort((a, b) => a.id.localeCompare(b.id))
}

export async function getModelosDeEmbeddings(): Promise<ModeloCatalogo[]> {
  return MODELOS_EMBEDDINGS
}

export async function getModelo(id: string): Promise<ModeloCatalogo | null> {
  const deEmbeddings = MODELOS_EMBEDDINGS.find((modelo) => modelo.id === id)

  if (deEmbeddings) {
    return deEmbeddings
  }

  const catalogo = await getCatalogo()

  return catalogo.find((modelo) => modelo.id === id) ?? null
}
