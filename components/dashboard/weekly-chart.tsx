"use client"

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ClientOnly } from "@/components/ui/client-only"
import { Skeleton } from "@/components/ui/skeleton"
import type { PuntoSemanal } from "@/lib/db/queries/metrics"

const config = {
  abiertos: { label: "Abiertos", color: "var(--chart-1)" },
  resueltos: { label: "Resueltos", color: "var(--chart-2)" },
} satisfies ChartConfig

/** "2026-08-24" → "24 ago" */
function etiquetaSemana(iso: string) {
  const [, mes, dia] = iso.split("-")
  const meses = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic",
  ]

  return `${Number(dia)} ${meses[Number(mes) - 1]}`
}

export function WeeklyChart({ datos }: { datos: PuntoSemanal[] }) {
  const puntos = datos.map((punto) => ({
    ...punto,
    etiqueta: etiquetaSemana(punto.semana),
  }))

  return (
    // Recharts mide el contenedor en el cliente: renderizarlo en el servidor
    // sólo produce un gráfico de 0px que después salta.
    <ClientOnly fallback={<Skeleton className="h-64 w-full" />}>
      <ChartContainer config={config} className="h-64 w-full">
        <LineChart data={puntos} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={28}
            allowDecimals={false}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          {/* Sin animación de montaje: el dashboard se re-renderiza en cada
              navegación y ver las líneas dibujarse de nuevo cada vez es ruido,
              además de mostrar el gráfico vacío durante el primer segundo. */}
          <Line
            dataKey="abiertos"
            type="monotone"
            stroke="var(--color-abiertos)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="resueltos"
            type="monotone"
            stroke="var(--color-resueltos)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartContainer>
    </ClientOnly>
  )
}
