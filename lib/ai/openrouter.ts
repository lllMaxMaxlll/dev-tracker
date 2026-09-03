import "server-only"

import { ErrorIA } from "@/lib/ai/errors"
import { env } from "@/lib/env"

/**
 * Transporte único hacia OpenRouter.
 *
 * OpenRouter expone la interfaz de OpenAI y normaliza el esquema entre
 * proveedores, así que el resto de la capa de IA habla un solo dialecto sin
 * importar qué modelo haya elegido el usuario en Ajustes.
 *
 * Antes esto era el binding `AI` de Cloudflare, que no necesitaba credenciales
 * porque la identidad la daba el propio Worker. Fuera de Workers hace falta una
 * API key, y por eso `pedir()` falla con un mensaje accionable en vez de un
 * 401 crudo cuando no está configurada.
 */
const BASE = "https://openrouter.ai/api/v1"

function clave(): string {
  const valor = env().OPENROUTER_API_KEY

  if (!valor) {
    throw new ErrorIA(
      "PROVEEDOR",
      "Falta la API key de OpenRouter.",
      "Cargá OPENROUTER_API_KEY en las variables de entorno del proyecto."
    )
  }

  return valor
}

function cabeceras(): Record<string, string> {
  const config = env()

  return {
    Authorization: `Bearer ${clave()}`,
    "Content-Type": "application/json",
    // OpenRouter las usa para atribuir el consumo en su panel. Son opcionales.
    ...(config.OPENROUTER_SITE_URL
      ? { "HTTP-Referer": config.OPENROUTER_SITE_URL }
      : {}),
    "X-Title": config.OPENROUTER_APP_NAME,
  }
}

/**
 * Hace la llamada y devuelve la `Response` cruda.
 *
 * Cruda y no ya parseada porque el streaming necesita `response.body`: parsear
 * acá obligaría a bufferear la respuesta entera y se perdería el streaming del
 * resumen semanal.
 */
export async function pedir(
  ruta: string,
  cuerpo: unknown,
  señal?: AbortSignal
): Promise<Response> {
  const respuesta = await fetch(`${BASE}${ruta}`, {
    method: "POST",
    headers: cabeceras(),
    body: JSON.stringify(cuerpo),
    signal: señal,
  })

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => "")

    throw new ErrorIA(
      "PROVEEDOR",
      `OpenRouter respondió ${respuesta.status}.`,
      detalle.slice(0, 300) || undefined
    )
  }

  return respuesta
}

/** Igual que `pedir()`, pero devuelve el JSON ya parseado. */
export async function pedirJson<T>(
  ruta: string,
  cuerpo: unknown,
  señal?: AbortSignal
): Promise<T> {
  const respuesta = await pedir(ruta, cuerpo, señal)

  return (await respuesta.json()) as T
}

/**
 * Catálogo público de modelos. No lleva API key a propósito: el endpoint es
 * abierto, y así la página de Ajustes puede listar modelos aunque todavía no
 * haya credenciales cargadas.
 */
export async function pedirCatalogo<T>(): Promise<T> {
  const respuesta = await fetch(`${BASE}/models`)

  if (!respuesta.ok) {
    throw new ErrorIA(
      "PROVEEDOR",
      `No se pudo leer el catálogo de modelos (${respuesta.status}).`
    )
  }

  return (await respuesta.json()) as T
}
