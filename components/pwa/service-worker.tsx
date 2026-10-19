"use client"

import * as React from "react"

/**
 * Registra public/sw.js. Sólo en producción: en `next dev` el caché de assets
 * pisaría los cambios del hot reload.
 */
export function RegistrarServiceWorker() {
  React.useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    ) {
      return
    }

    // `updateViaCache: "none"`: el navegador siempre baja sw.js de nuevo para
    // ver si cambió, así un deploy llega sin esperar al caché HTTP.
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch((error) => {
        console.error("[sw] no se pudo registrar", error)
      })
  }, [])

  return null
}
