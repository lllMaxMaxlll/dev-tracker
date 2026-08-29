import "server-only"

import { esErrorDeAuthDeGithub } from "@/lib/github/errors"

export type ResultadoGithub<T> =
  { ok: true; datos: T } | { ok: false; mensaje: string }

/**
 * Ejecuta una carga contra GitHub y convierte los fallos de credenciales en un
 * resultado, en vez de una excepción.
 *
 * Existe para que los componentes no construyan JSX dentro de un `try/catch`:
 * React no renderiza en el momento en que se crea el elemento, así que un
 * `catch` alrededor del JSX no atraparía los errores de render y da una falsa
 * sensación de seguridad. Acá el `try` envuelve sólo el `await`.
 */
export async function cargarSeguro<T>(
  cargar: () => Promise<T>
): Promise<ResultadoGithub<T>> {
  try {
    return { ok: true, datos: await cargar() }
  } catch (error) {
    if (esErrorDeAuthDeGithub(error)) {
      return { ok: false, mensaje: error.message }
    }

    throw error
  }
}
