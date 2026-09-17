import "server-only"

import { ErrorMonitor } from "@/lib/monitor/errors"

/**
 * Transporte común de los colectores.
 *
 * Los tres proveedores hablan HTTP con Bearer y devuelven errores distintos
 * para la misma situación, así que la traducción a `ErrorMonitor` vive en un
 * solo lugar. La distinción que importa es 403 → NO_DISPONIBLE: en los planes
 * gratuitos "no tenés permiso" casi siempre significa "tu plan no expone este
 * dato", y eso la UI lo tiene que contar distinto de una caída.
 */
const TIMEOUT_MS = 10_000

type Opciones = {
  token: string
  señal?: AbortSignal
  proveedor: string
  /** Cabeceras extra; `Authorization` y `Accept` ya van puestas. */
  cabeceras?: Record<string, string>
}

async function pedirCrudo(url: string, opciones: Opciones): Promise<Response> {
  // Dos relojes: el del colector (presupuesto de toda la corrida) y el de esta
  // llamada. Sin el segundo, un endpoint colgado se come el minuto entero que
  // da Vercel Hobby y se pierden también las fuentes que sí respondían.
  const señales = [AbortSignal.timeout(TIMEOUT_MS)]

  if (opciones.señal) señales.push(opciones.señal)

  let respuesta: Response

  try {
    respuesta = await fetch(url, {
      headers: {
        Authorization: `Bearer ${opciones.token}`,
        Accept: "application/json",
        ...opciones.cabeceras,
      },
      signal: AbortSignal.any(señales),
    })
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new ErrorMonitor(
        "TIMEOUT",
        `${opciones.proveedor} no respondió a tiempo.`
      )
    }

    throw new ErrorMonitor(
      "PROVEEDOR",
      `No se pudo hablar con ${opciones.proveedor}.`,
      error instanceof Error ? error.message : undefined
    )
  }

  if (respuesta.ok) return respuesta

  const detalle = (await respuesta.text().catch(() => "")).slice(0, 300)

  if (respuesta.status === 429) {
    throw new ErrorMonitor(
      "RATE_LIMIT",
      `${opciones.proveedor} pidió bajar el ritmo.`,
      detalle || undefined
    )
  }

  if (respuesta.status === 403 || respuesta.status === 404) {
    throw new ErrorMonitor(
      "NO_DISPONIBLE",
      `${opciones.proveedor} no expone este dato (${respuesta.status}).`,
      detalle || undefined
    )
  }

  if (respuesta.status === 401) {
    throw new ErrorMonitor(
      "SIN_CREDENCIAL",
      `${opciones.proveedor} rechazó la credencial.`,
      detalle || undefined
    )
  }

  throw new ErrorMonitor(
    "PROVEEDOR",
    `${opciones.proveedor} respondió ${respuesta.status}.`,
    detalle || undefined
  )
}

export async function pedirJson<T>(
  url: string,
  opciones: Opciones
): Promise<T> {
  const respuesta = await pedirCrudo(url, opciones)

  return (await respuesta.json()) as T
}

export async function pedirTexto(
  url: string,
  opciones: Opciones
): Promise<string> {
  const respuesta = await pedirCrudo(url, opciones)

  return await respuesta.text()
}

/** Día en UTC con formato ISO corto, que es como se guarda en la base. */
export function diaUtc(fecha: Date): string {
  return fecha.toISOString().slice(0, 10)
}

/**
 * Corre tareas con un tope de concurrencia.
 *
 * Supabase limita los endpoints de analytics a 30 peticiones por minuto y con
 * varios proyectos eso se toca enseguida; en secuencia pura, en cambio, el
 * timeout de 60 s de la función llega antes que el último proyecto.
 */
export async function enTandas<T, R>(
  elementos: readonly T[],
  concurrencia: number,
  tarea: (elemento: T) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = []

  for (let i = 0; i < elementos.length; i += concurrencia) {
    const tanda = elementos.slice(i, i + concurrencia)

    resultados.push(...(await Promise.all(tanda.map(tarea))))
  }

  return resultados
}
