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
  pendiente: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  en_progreso: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  bloqueado: "bg-red-500/10 text-red-700 dark:text-red-300",
  resuelto: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  descartado: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
}

const COLOR_PRIORIDAD: Record<Prioridad, string> = {
  baja: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  media: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  alta: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  urgente: "bg-red-500/10 text-red-700 dark:text-red-300",
}

const COLOR_TIPO: Record<Tipo, string> = {
  bug: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  feature: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  mejora: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  idea: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  deuda_tecnica: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
}

export function EstadoBadge({ estado }: { estado: string }) {
  const valor = estado as Estado

  return (
    <Badge
      variant="secondary"
      className={cn("border-0 font-medium", COLOR_ESTADO[valor])}
    >
      {ETIQUETAS_ESTADO[valor] ?? estado}
    </Badge>
  )
}

export function PrioridadBadge({ prioridad }: { prioridad: string }) {
  const valor = prioridad as Prioridad

  return (
    <Badge
      variant="secondary"
      className={cn("border-0 font-medium", COLOR_PRIORIDAD[valor])}
    >
      {ETIQUETAS_PRIORIDAD[valor] ?? prioridad}
    </Badge>
  )
}

export function TipoBadge({ tipo }: { tipo: string }) {
  const valor = tipo as Tipo

  return (
    <Badge
      variant="secondary"
      className={cn("border-0 font-medium", COLOR_TIPO[valor])}
    >
      {ETIQUETAS_TIPO[valor] ?? tipo}
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
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={color ? { backgroundColor: color } : undefined}
      />
      <span className="truncate">{nombre}</span>
    </span>
  )
}
