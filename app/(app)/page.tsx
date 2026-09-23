import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SummaryCards } from "@/components/dashboard/summary-cards"
import { WeeklyChart } from "@/components/dashboard/weekly-chart"
import { DistributionChart } from "@/components/dashboard/distribution-chart"
import { requireUser } from "@/lib/auth/require-user"
import {
  getDistribucionPorArea,
  getDistribucionPorProyecto,
  getDistribucionPorTipo,
  getResumen,
  getSerieSemanal,
} from "@/lib/db/queries/metrics"
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

  const [serie, porTipo, porProyecto, porArea] = await Promise.all([
    getSerieSemanal(user.id),
    getDistribucionPorTipo(user.id),
    getDistribucionPorProyecto(user.id),
    getDistribucionPorArea(user.id),
  ])

  // Las etiquetas de tipo se traducen acá y no en SQL: el enum guarda el valor
  // crudo y la interfaz decide cómo mostrarlo.
  const tipos = porTipo.map((fila) => ({
    ...fila,
    etiqueta: ETIQUETAS_TIPO[fila.clave as Tipo] ?? fila.clave,
  }))

  // Dos proyectos pueden tener un área con el mismo nombre. Se aclara con el
  // proyecto sólo cuando el nombre solo sería ambiguo.
  const areas = porArea.map((fila) => {
    const repetida = porArea.some(
      (otra) => otra.clave !== fila.clave && otra.etiqueta === fila.etiqueta
    )

    return {
      ...fila,
      etiqueta: repetida
        ? `${fila.etiqueta} · ${fila.proyecto}`
        : fila.etiqueta,
    }
  })

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

      <Card>
        <CardHeader>
          <CardTitle>Por área</CardTitle>
          <p className="text-sm text-muted-foreground">
            Qué parte de cada proyecto da más trabajo
          </p>
        </CardHeader>
        <CardContent>
          {areas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ningún problema tiene área todavía. Las áreas se crean en
              Proyectos y se eligen al cargar un problema.
            </p>
          ) : (
            <DistributionChart datos={areas} />
          )}
        </CardContent>
      </Card>
    </>
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

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-80 rounded-xl" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-56 rounded-xl" />
              <Skeleton className="h-56 rounded-xl" />
            </div>
            <Skeleton className="h-56 rounded-xl" />
          </div>
        }
      >
        <Graficos />
      </Suspense>
    </div>
  )
}
