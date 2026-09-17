"use client"

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { ClientOnly } from "@/components/ui/client-only"
import { Skeleton } from "@/components/ui/skeleton"

const MESES = [
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

function etiquetaDia(iso: string) {
  const [, mes, dia] = iso.split("-")

  return `${Number(dia)} ${MESES[Number(mes) - 1]}`
}

/**
 * Serie diaria de UNA unidad.
 *
 * Deliberadamente no apila fuentes: bytes, peticiones y dólares no se suman, y
 * un área apilada con unidades mezcladas tendría forma pero no significado.
 * Por eso hay un gráfico por fuente en vez de uno solo más vistoso.
 */
export function SerieChart({
  datos,
  etiqueta,
  formato,
}: {
  datos: { dia: string; valor: number }[]
  etiqueta: string
  formato?: (valor: number) => string
}) {
  if (datos.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Todavía no hay serie para graficar.
      </p>
    )
  }

  const config = {
    valor: { label: etiqueta, color: "var(--chart-1)" },
  } satisfies ChartConfig

  const puntos = datos.map((punto) => ({
    ...punto,
    etiqueta: etiquetaDia(punto.dia),
  }))

  return (
    // Recharts mide el contenedor en el cliente: en el servidor sólo produce un
    // gráfico de 0px que después salta.
    <ClientOnly fallback={<Skeleton className="h-48 w-full" />}>
      <ChartContainer config={config} className="h-48 w-full">
        <AreaChart data={puntos} margin={{ left: 4, right: 12, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="etiqueta"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={formato}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(valor) =>
                  formato ? formato(Number(valor)) : String(valor)
                }
              />
            }
          />
          <Area
            dataKey="valor"
            type="monotone"
            stroke="var(--color-valor)"
            fill="var(--color-valor)"
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </ClientOnly>
  )
}
