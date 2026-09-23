import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function suscribir(alCambiar: () => void) {
  const mql = window.matchMedia(CONSULTA)

  mql.addEventListener("change", alCambiar)

  return () => mql.removeEventListener("change", alCambiar)
}

/**
 * Si la ventana es angosta.
 *
 * Va con `useSyncExternalStore` y no con un estado sincronizado desde un
 * efecto: el media query es un dato que vive afuera de React, y leerlo en un
 * efecto obliga a un render extra en cada montaje —además de ser justo lo que
 * marca la regla `react-hooks/set-state-in-effect`—.
 *
 * En el servidor no hay ventana, así que la respuesta es `false` y el valor
 * real llega en la hidratación. Es lo mismo que hacía la versión anterior, que
 * arrancaba en `undefined`.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false
  )
}
