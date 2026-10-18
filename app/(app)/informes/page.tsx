import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SummaryList } from "@/components/summaries/summary-list"
import { GenerateSummaryButton } from "@/components/summaries/generate-button"
import { WeeklyChart } from "@/components/dashboard/weekly-chart"
import { DistributionChart } from "@/components/dashboard/distribution-chart"
import { requireUser } from "@/lib/auth/require-user"
import { listarResumenes } from "@/lib/db/queries/summaries"
import {
  getDistribucionPorArea,
  getDistribucionPorProyecto,
  getDistribucionPorTipo,
  getSerieSemanal,
} from "@/lib/db/queries/metrics"
import { ETIQUETAS_TIPO, type Tipo } from "@/lib/schemas/enums"

export const metadata: Metadata = { title: "Informes · Taller" }

/**
 * Informes junta las dos maneras de mirar hacia atrás: los números (los
 * gráficos que antes estaban en el dashboard) y el texto (los resúmenes que
 * escribe la IA los viernes).
 */
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
          <CardTitle>Abiertas vs. cerradas</CardTitle>
          <p className="text-sm text-muted-foreground">Últimas 12 semanas</p>
        </CardHeader>
        <CardContent>
          <WeeklyChart datos={serie} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
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

        <Card>
          <CardHeader>
            <CardTitle>Por área</CardTitle>
          </CardHeader>
          <CardContent>
            {areas.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ninguna orden tiene área todavía. Las áreas se crean en Planta
                → Proyectos.
              </p>
            ) : (
              <DistributionChart datos={areas} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

async function Resumenes() {
  const user = await requireUser()
  const resumenes = await listarResumenes(user.id)

  return <SummaryList resumenes={resumenes} />
}

export default function InformesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Informes"
        description="Los números de las últimas semanas y el resumen que la IA escribe cada viernes."
      />

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-80" />
            <div className="grid gap-4 lg:grid-cols-3">
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
              <Skeleton className="h-56" />
            </div>
          </div>
        }
      >
        <Graficos />
      </Suspense>

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
          Resúmenes semanales
        </h2>
        <GenerateSummaryButton />

        <Suspense
          fallback={
            <div className="flex flex-col gap-4">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-40" />
              ))}
            </div>
          }
        >
          <Resumenes />
        </Suspense>
      </div>
    </div>
  )
}
