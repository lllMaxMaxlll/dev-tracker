"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ClientOnly } from "@/components/ui/client-only"
import { Skeleton } from "@/components/ui/skeleton"
import type { Distribucion } from "@/lib/db/queries/metrics"

const config = {
  total: { label: "Problemas", color: "var(--chart-1)" },
} satisfies ChartConfig

/**
 * Barras horizontales: las etiquetas ("Deuda técnica", nombres de proyecto) no
 * entran en un eje X sin quedar rotadas o cortadas.
 */
export function DistributionChart({ datos }: { datos: Distribucion[] }) {
  if (datos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay datos.
      </p>
    )
  }

  // La altura acompaña la cantidad de barras, si no quedan aplastadas o
  // separadísimas según cuántas categorías haya.
  const altura = Math.max(160, datos.length * 40)

  return (
    <ClientOnly fallback={<Skeleton className="h-40 w-full" />}>
      <ChartContainer
        config={config}
        className="w-full"
        style={{ height: altura }}
      >
        <BarChart
          data={datos}
          layout="vertical"
          margin={{ left: 4, right: 16 }}
        >
          <CartesianGrid horizontal={false} />
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            width={110}
            tickMargin={4}
          />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar
            dataKey="total"
            fill="var(--color-total)"
            radius={4}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    </ClientOnly>
  )
}
