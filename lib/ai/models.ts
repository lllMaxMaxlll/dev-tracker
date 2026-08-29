import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"

/**
 * Catálogo de modelos de Workers AI.
 *
 * Sale del propio binding (`env.AI.models()`), así que no hace falta API token
 * ni account id. Trae por modelo: ventana de contexto, si soporta function
 * calling y el precio en USD por millón de tokens — justo lo que la página de
 * Ajustes tiene que mostrar.
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
  requierePlanPago: boolean
  precioEntradaUsd: number | null
  precioSalidaUsd: number | null
  /** Dimensiones de salida, sólo para modelos de embeddings. */
  dimensiones: number | null
}

type ModeloCrudo = {
  name: string
  description?: string
  task?: { name?: string }
  properties?: { property_id: string; value: unknown }[]
}

function propiedad(modelo: ModeloCrudo, id: string): unknown {
  return modelo.properties?.find((p) => p.property_id === id)?.value
}

function numero(valor: unknown): number | null {
  const n = Number(valor)

  return Number.isFinite(n) ? n : null
}

type PrecioCrudo = { unit?: string; price?: number; currency?: string }

function precio(modelo: ModeloCrudo, unidad: string): number | null {
  const precios = propiedad(modelo, "price")

  if (!Array.isArray(precios)) {
    return null
  }

  const encontrado = (precios as PrecioCrudo[]).find((p) => p.unit === unidad)

  return encontrado?.price ?? null
}

/**
 * El id tiene la forma `@cf/<proveedor>/<modelo>`, así que el proveedor sale de
 * ahí sin necesidad de otra llamada.
 */
function proveedorDe(id: string): string {
  const partes = id.split("/")

  return partes.length >= 3 ? partes[1] : "cloudflare"
}

function normalizar(modelo: ModeloCrudo): ModeloCatalogo {
  return {
    id: modelo.name,
    nombre: modelo.name.split("/").slice(-1)[0],
    proveedor: proveedorDe(modelo.name),
    descripcion: modelo.description ?? "",
    tarea: modelo.task?.name ?? "",
    contexto: numero(propiedad(modelo, "context_window")),
    soportaTools: String(propiedad(modelo, "function_calling")) === "true",
    razona: String(propiedad(modelo, "reasoning")) === "true",
    requierePlanPago:
      String(propiedad(modelo, "require_workers_paid")) === "true",
    precioEntradaUsd: precio(modelo, "per M input tokens"),
    precioSalidaUsd: precio(modelo, "per M output tokens"),
    dimensiones: numero(propiedad(modelo, "output_dimensions")),
  }
}

/**
 * Caché en memoria del isolate.
 *
 * El catálogo es global (no depende del usuario), así que no va a la tabla de
 * caché por usuario. Guardar JSON en una variable de módulo sí está permitido
 * en workerd — lo prohibido es reutilizar I/O entre requests, no datos. Si el
 * isolate se recicla, se vuelve a pedir: la llamada es gratis y rápida.
 */
let cache: { modelos: ModeloCatalogo[]; expira: number } | undefined
const TTL_MS = 60 * 60 * 1000

export async function getCatalogo(): Promise<ModeloCatalogo[]> {
  if (cache && cache.expira > Date.now()) {
    return cache.modelos
  }

  const ai = cloudflareEnv.AI as unknown as {
    models: (opciones: {
      per_page: number
      page: number
    }) => Promise<ModeloCrudo[]>
  }

  const todos: ModeloCrudo[] = []

  // Se pagina hasta agotar; hoy son ~65 modelos.
  for (let pagina = 1; pagina <= 10; pagina++) {
    const lote = await ai.models({ per_page: 50, page: pagina })

    if (!lote?.length) break

    todos.push(...lote)

    if (lote.length < 50) break
  }

  const modelos = todos.map(normalizar)

  cache = { modelos, expira: Date.now() + TTL_MS }

  return modelos
}

/** Modelos de generación de texto, que son los que se eligen por tarea. */
export async function getModelosDeTexto(): Promise<ModeloCatalogo[]> {
  const catalogo = await getCatalogo()

  return catalogo
    .filter((modelo) => modelo.tarea === "Text Generation")
    .sort((a, b) => a.id.localeCompare(b.id))
}

export async function getModelosDeEmbeddings(): Promise<ModeloCatalogo[]> {
  const catalogo = await getCatalogo()

  return catalogo
    .filter((modelo) => modelo.tarea.toLowerCase().includes("embedding"))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export async function getModelo(id: string): Promise<ModeloCatalogo | null> {
  const catalogo = await getCatalogo()

  return catalogo.find((modelo) => modelo.id === id) ?? null
}
