"use client"

import * as React from "react"

/**
 * Renderiza sus hijos sólo después de la hidratación.
 *
 * Sirve para componentes que generan ids en tiempo de render (dnd-kit y los
 * diálogos de Base UI): el contador arranca distinto en el servidor y en el
 * cliente, y React reporta un mismatch de hidratación. Como son piezas
 * puramente interactivas, no pierden nada por no renderizarse en el servidor.
 *
 * Usa `useSyncExternalStore` en vez del típico flag con useEffect: es la
 * primitiva correcta y no dispara un setState dentro de un efecto.
 */
const suscripcionVacia = () => () => {}

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const hidratado = React.useSyncExternalStore(
    suscripcionVacia,
    () => true,
    () => false
  )

  return <>{hidratado ? children : fallback}</>
}
