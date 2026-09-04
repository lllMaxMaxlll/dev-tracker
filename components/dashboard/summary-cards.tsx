import Link from "next/link"
import {
  CheckCircle2Icon,
  CircleDotIcon,
  CircleDashedIcon,
  TimerIcon,
} from "lucide-react"

import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { duracionLegible } from "@/lib/utils/fechas"
import type { ResumenMetricas } from "@/lib/db/queries/metrics"

function Tarjeta({
  titulo,
  valor,
  detalle,
  icono: Icono,
  href,
}: {
  titulo: string
  valor: string
  detalle: string
  icono: typeof CircleDotIcon
  href?: string
}) {
  const contenido = (
    <Card className="h-full transition-colors hover:border-foreground/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {titulo}
        </CardTitle>
        {/* CardHeader es un grid: el icono va en el slot de acción, si no cae
            en su propia fila debajo del título. */}
        <CardAction>
          <Icono className="size-4 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        <span className="text-xs text-muted-foreground">{detalle}</span>
      </CardContent>
    </Card>
  )

  return href ? <Link href={href}>{contenido}</Link> : contenido
}

export function SummaryCards({ resumen }: { resumen: ResumenMetricas }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tarjeta
        titulo="Abiertos"
        valor={String(resumen.abiertos)}
        detalle="Pendientes y en progreso"
        icono={CircleDotIcon}
        // Sin `vista`: agrupa pendiente y en progreso, o sea dos columnas
        // con contenido, y el kanban por defecto le queda bien.
        href="/problemas?estado=abiertos"
      />
      <Tarjeta
        titulo="Resueltos esta semana"
        valor={String(resumen.resueltosEstaSemana)}
        detalle="Desde el lunes"
        icono={CheckCircle2Icon}
        // `vista=tabla` explícita: filtrar a un solo estado en el kanban deja
        // una columna con tarjetas y tres vacías.
        href="/problemas?estado=resuelto&vista=tabla"
      />
      <Tarjeta
        titulo="En progreso"
        valor={String(resumen.enProgreso)}
        detalle={
          resumen.enProgreso > 0 ? "Lo que tenés entre manos" : "Nada empezado"
        }
        icono={CircleDashedIcon}
        href="/problemas?estado=en_progreso&vista=tabla"
      />
      <Tarjeta
        titulo="Tiempo de resolución"
        valor={
          resumen.tiempoPromedioMs === null
            ? "—"
            : duracionLegible(resumen.tiempoPromedioMs)
        }
        detalle={
          resumen.muestraPromedio === 0
            ? "Todavía no resolviste nada"
            : `Promedio de ${resumen.muestraPromedio} ${
                resumen.muestraPromedio === 1 ? "problema" : "problemas"
              } en 90 días`
        }
        icono={TimerIcon}
      />
    </div>
  )
}
