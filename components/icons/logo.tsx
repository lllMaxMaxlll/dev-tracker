import type { SVGProps } from "react"

/**
 * Marca de Taller: la silueta de un galpón con techo de diente de sierra.
 *
 * Dos variantes por un motivo concreto:
 * - `Logotipo` lleva su propio fondo y sirve como ficha de la app (sidebar,
 *   login, favicon). Se lee a 16px porque no depende del contraste del entorno.
 * - `LogotipoMarca` es monocromo con `currentColor`, para cuando va sobre un
 *   fondo que ya tiene color.
 *
 * Tres dientes y una chimenea, nada más: a 16px, que es como se ve en una
 * pestaña, cualquier detalle extra se empasta.
 */
export function Logotipo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Teja y tinta salen de los tokens del tema, así el logo acompaña un
          cambio de color sin tocar este archivo. El favicon (app/icon.svg)
          repite el dibujo con los valores resueltos a hex, porque ahí no
          llegan las variables CSS. */}
      <rect width="32" height="32" rx="4" fill="var(--primary)" />
      <g fill="var(--primary-foreground)">
        <path d="M6 25V14l5-3.4v5l5-3.4v5l5-3.4V25z" />
        <rect x="22.5" y="7" width="3.5" height="18" />
        <rect x="4.5" y="25" width="23" height="2.5" />
      </g>
    </svg>
  )
}

export function LogotipoMarca({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M6 25V14l5-3.4v5l5-3.4v5l5-3.4V25z" />
      <rect x="22.5" y="7" width="3.5" height="18" />
      <rect x="4.5" y="25" width="23" height="2.5" />
    </svg>
  )
}
