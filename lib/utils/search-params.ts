/**
 * Construye una query string nueva a partir de la actual, aplicando cambios.
 * Un valor `null` o `""` borra la clave, para que la URL no se llene de
 * parámetros vacíos.
 */
export function conParametros(
  actuales: URLSearchParams | ReadonlyURLSearchParamsLike,
  cambios: Record<string, string | null | undefined>
): string {
  const params = new URLSearchParams(actuales.toString())

  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null || valor === undefined || valor === "") {
      params.delete(clave)
    } else {
      params.set(clave, valor)
    }
  }

  const query = params.toString()

  return query ? `?${query}` : ""
}

type ReadonlyURLSearchParamsLike = { toString(): string }
