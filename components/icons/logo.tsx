import type { SVGProps } from "react"

/**
 * Marca de DevTracker: un cuaderno con el primer renglón resuelto.
 *
 * Dos variantes por un motivo concreto:
 * - `Logotipo` lleva su propio fondo y sirve como ficha de la app (sidebar,
 *   login, favicon). Se lee a 16px porque no depende del contraste del entorno.
 * - `LogotipoMarca` es monocromo con `currentColor`, para cuando va sobre un
 *   fondo que ya tiene color.
 */
export function Logotipo({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <rect width="32" height="32" rx="7" fill="#2f5fe0" />
      <rect
        x="7"
        y="7"
        width="2.5"
        height="18"
        rx="1.25"
        fill="#fff"
        opacity="0.55"
      />
      <path
        d="M12.5 12.2l2 2 4-4.2"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect
        x="12.5"
        y="17"
        width="12"
        height="2.2"
        rx="1.1"
        fill="#fff"
        opacity="0.9"
      />
      <rect
        x="12.5"
        y="21.5"
        width="8"
        height="2.2"
        rx="1.1"
        fill="#fff"
        opacity="0.6"
      />
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
      <rect x="6" y="5" width="20" height="22" rx="3" strokeWidth="2" />
      <path d="M11 5v22" strokeWidth="2" />
      <path
        d="M15 12.5l2 2 4-4.2"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M15 19h7" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
