import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  ETIQUETAS_ESTADO,
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_TIPO,
  type Estado,
  type Prioridad,
  type Tipo,
} from "@/lib/schemas/enums"

/**
 * Los colores van con clases explícitas (no interpoladas) para que Tailwind
 * las detecte al escanear el código.
 */
const COLOR_ESTADO: Record<Estado, string> = {
  pendiente: "bg-muted-foreground",
  en_progreso: "bg-primary",
  resuelto: "bg-emerald-600 dark:bg-emerald-400",
  descartado: "bg-transparent border border-muted-foreground",
}

/** Barras encendidas y su color: urgente es la única que va en rojo. */
const SENAL_PRIORIDAD: Record<Prioridad, { barras: number; color: string }> = {
  baja: { barras: 1, color: "bg-muted-foreground" },
  media: { barras: 2, color: "bg-muted-foreground" },
  alta: { barras: 3, color: "bg-amber-500 dark:bg-amber-400" },
  urgente: { barras: 4, color: "bg-red-600 dark:bg-red-500" },
}

const ALTURAS_BARRA = ["h-1", "h-1.5", "h-2.5", "h-3"]

const COLOR_TIPO: Record<Tipo, string> = {
  bug: "bg-red-500/15 text-red-700 dark:text-red-400",
  feature: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  mejora: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  idea: "bg-yellow-500/20 text-yellow-800 dark:text-yellow-300",
  deuda_tecnica: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
}

/** Código corto, como en una orden de trabajo. La etiqueta va en el title. */
const CODIGO_TIPO: Record<Tipo, string> = {
  bug: "BUG",
  feature: "FEAT",
  mejora: "MEJ",
  idea: "IDEA",
  deuda_tecnica: "DEUDA",
}

export function EstadoBadge({ estado }: { estado: string }) {
  const valor = estado as Estado

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0", COLOR_ESTADO[valor])}
      />
      <span className={cn(valor === "descartado" && "line-through")}>
        {ETIQUETAS_ESTADO[valor] ?? estado}
      </span>
    </span>
  )
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  const valor = prioridad as Prioridad
  const senal = SENAL_PRIORIDAD[valor] ?? SENAL_PRIORIDAD.media

  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono text-xs"
      title={`Prioridad ${ETIQUETAS_PRIORIDAD[valor] ?? prioridad}`}
    >
      <span aria-hidden="true" className="inline-flex h-3 items-end gap-0.5">
        {ALTURAS_BARRA.map((altura, i) => (
          <span
            key={altura}
            className={cn(
              "w-0.75",
              altura,
              i < senal.barras ? senal.color : "bg-border"
            )}
          />
        ))}
      </span>
      {ETIQUETAS_PRIORIDAD[valor] ?? prioridad}
    </span>
  )
}

export function TipoBadge({ tipo }: { tipo: string }) {
  const valor = tipo as Tipo

  return (
    <Badge
      variant="secondary"
      title={ETIQUETAS_TIPO[valor] ?? tipo}
      className={cn(
        "rounded-sm border-0 font-mono text-[0.7rem] font-bold tracking-wide",
        COLOR_TIPO[valor]
      )}
    >
      {CODIGO_TIPO[valor] ?? tipo}
    </Badge>
  )
}

export function ProyectoBadge({
  nombre,
  color,
}: {
  nombre: string | null
  color?: string | null
}) {
  if (!nombre) {
    return <span className="text-sm text-muted-foreground">Sin proyecto</span>
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 bg-muted-foreground"
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="truncate">{nombre}</span>
    </span>
  )
}

/**
 * El área usa el color que el usuario le puso, así que no puede salir de las
 * clases fijas de arriba: va como estilo en línea sobre un fondo tenue.
 */
export function AreaBadge({
  nombre,
  color,
}: {
  nombre: string | null
  color?: string | null
}) {
  if (!nombre) return null

  return (
    <Badge
      variant="secondary"
      className="border-0 font-medium"
      style={
        color
          ? {
              // `color-mix` deja el texto con el color elegido y el fondo con
              // una versión suave del mismo, sin tener que calcular dos.
              color,
              backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
            }
          : undefined
      }
    >
      {nombre}
    </Badge>
  )
}
