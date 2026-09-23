import type { SVGProps } from "react"

/**
 * Marca de DevTracker: un cuaderno con lo hecho tildado y lo que falta debajo.
 *
 * Dos variantes por un motivo concreto:
 * - `Logotipo` lleva su propio fondo y sirve como ficha de la app (sidebar,
 *   login, favicon). Se lee a 16px porque no depende del contraste del entorno.
 * - `LogotipoMarca` es monocromo con `currentColor`, para cuando va sobre un
 *   fondo que ya tiene color.
 *
 * El dibujo es de dos trazos y no de una lista de tres renglones: a 16px, que
 * es como se ve en una pestaña, tres renglones se empastan en una mancha.
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
          cambio de color sin tocar este archivo. El par
          primary/primary-foreground está pensado para esto: sobre el verde
          actual da 5.7:1, mientras que el blanco daría 1.5:1. El favicon
          (app/icon.svg) repite el dibujo con los valores resueltos a hex,
          porque ahí no llegan las variables CSS. */}
      <rect width="32" height="32" rx="7.5" fill="var(--primary)" />
      <g fill="var(--primary-foreground)">
        <rect x="7.4" y="7.6" width="3" height="16.8" rx="1.5" opacity="0.5" />
        <path
          d="M13.8 15.9l2.6 2.6 6.6-6.6"
          fill="none"
          stroke="var(--primary-foreground)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="13.8"
          y="21.6"
          width="9.2"
          height="2.8"
          rx="1.4"
          opacity="0.5"
        />
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
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect x="6" y="5" width="20" height="22" rx="3.5" strokeWidth="2" />
      <path d="M11 5v22" strokeWidth="2" />
      <path
        d="M14.6 16l2.2 2.2 5-5"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14.6 22.4h6.4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
