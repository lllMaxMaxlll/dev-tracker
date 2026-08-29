import { z } from "zod"

/**
 * Ayudas para validar salidas de modelos.
 *
 * Criterio: la **forma** se valida estricto (si falta un campo o el tipo no es
 * el esperado, se rechaza), pero los **tamaños** se recortan en vez de
 * rechazarse.
 *
 * El motivo es práctico: un modelo que se pone verboso no debería tirar abajo
 * toda la operación. Con `.max()` de Zod, una sola frase de 210 caracteres
 * invalidaba la respuesta entera y el usuario veía "la respuesta no tiene la
 * forma esperada" sin ninguna forma de arreglarlo.
 */
export function textoAcotado(maximo: number) {
  return z.string().transform((valor) => valor.trim().slice(0, maximo))
}

export function listaAcotada<T extends z.ZodTypeAny>(
  elemento: T,
  maximo: number
) {
  return z.array(elemento).transform((valores) => valores.slice(0, maximo))
}
