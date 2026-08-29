import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * `useSyncExternalStore` es la primitiva correcta para leer de una API del
 * navegador: no necesita un setState dentro de un effect y devuelve el valor
 * del servidor (false) durante el render inicial.
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY)

  mql.addEventListener("change", onStoreChange)

  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
