"use client"

import * as React from "react"
import { WifiOffIcon } from "lucide-react"

function suscribir(avisar: () => void) {
  window.addEventListener("online", avisar)
  window.addEventListener("offline", avisar)
  return () => {
    window.removeEventListener("online", avisar)
    window.removeEventListener("offline", avisar)
  }
}

/**
 * Franja bajo el header cuando no hay red. Sin conexión, lo que se ve es la
 * última copia guardada por el service worker: hay que avisar que puede estar
 * desactualizada y que los cambios no se van a guardar.
 */
export function AvisoSinConexion() {
  const enLinea = React.useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true
  )

  if (enLinea) {
    return null
  }

  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b bg-muted px-4 py-2 text-xs text-muted-foreground"
    >
      <WifiOffIcon className="size-3.5 shrink-0 text-primary" />
      Sin conexión: estás viendo la última copia guardada. Los cambios no se
      guardan hasta que vuelva la red.
    </div>
  )
}
