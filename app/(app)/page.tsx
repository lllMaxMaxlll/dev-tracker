import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { WeeklyChart } from "@/components/dashboard/weekly-chart"
import { DistributionChart } from "@/components/dashboard/distribution-chart"
import { RecentIssues } from "@/components/dashboard/recent-issues"
import { Proximamente } from "@/components/layout/proximamente"
import { requireUser } from "@/lib/auth/require-user"
import {
  getDistribucionPorProyecto,
  getDistribucionPorTipo,
  getResumen,
  getSerieSemanal,
} from "@/lib/db/queries/metrics"
import { listRecentIssues } from "@/lib/db/queries/issues"
import { ETIQUETAS_TIPO, type Tipo } from "@/lib/schemas/enums"

export const metadata: Metadata = { title: "Dashboard · DevTracker" }

async function Saludo() {
  const user = await requireUser()

  return (
    <PageHeader
      title={`Hola, ${user.displayName.split(" ")[0]}`}
      description="Cómo viene tu semana, según lo que fuiste anotando."
    />
  )
}

async function Tarjetas() {
  const user = await requireUser()
  const resumen = await getResumen(user.id)

  return <SummaryCards resumen={resumen} />
}

async function Graficos() {
  const user = await requireUser()

  const [serie, porTipo, porProyecto] = await Promise.all([
    getSerieSemanal(user.id),
    getDistribucionPorTipo(user.id),
    getDistribucionPorProyecto(user.id),
  ])

  // Las etiquetas de tipo se traducen acá y no en SQL: el enum guarda el valor
  // crudo y la interfaz decide cómo mostrarlo.
  const tipos = porTipo.map((fila) => ({
    ...fila,
    etiqueta: ETIQUETAS_TIPO[fila.clave as Tipo] ?? fila.clave,
  }))

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Abiertos vs. resueltos</CardTitle>
          <p className="text-sm text-muted-foreground">Últimas 12 semanas</p>
        </CardHeader>
        <CardContent>
          <WeeklyChart datos={serie} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por tipo</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionChart datos={tipos} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Por proyecto</CardTitle>
          </CardHeader>
          <CardContent>
            <DistributionChart datos={porProyecto} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}

async function Recientes() {
  const user = await requireUser()
  const issues = await listRecentIssues(user.id, 6)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Últimos problemas tocados</CardTitle>
      </CardHeader>
      <CardContent>
        <RecentIssues issues={issues} />
      </CardContent>
    </Card>
  )
}

/**
 * Cada bloque tiene su propio Suspense: las tarjetas aparecen sin esperar a
 * los gráficos, que son las consultas más pesadas.
 */
export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-16 w-72 max-w-full" />}>
        <Saludo />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        }
      >
        <Tarjetas />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <Proximamente
            fase="Fase 6"
            detalle="Un párrafo generado con patrones de tu propio trabajo, y el último resumen semanal."
          />
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-80 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </div>
          </div>
        }
      >
        <Graficos />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <Recientes />
      </Suspense>
    </div>
  )
}
