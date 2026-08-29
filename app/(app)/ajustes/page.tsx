import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SettingsForm } from "@/components/settings/settings-form"
import { UsagePanel } from "@/components/settings/usage-panel"
import { requireUser } from "@/lib/auth/require-user"
import { getAjustes } from "@/lib/ai/settings"
import { getModelosDeEmbeddings, getModelosDeTexto } from "@/lib/ai/models"
import { getConsumoDelMes } from "@/lib/ai/usage"

export const metadata: Metadata = { title: "Ajustes · DevTracker" }

async function Ajustes() {
  const user = await requireUser()

  const [ajustes, modelosTexto, modelosEmbeddings] = await Promise.all([
    getAjustes(user.id),
    getModelosDeTexto(),
    getModelosDeEmbeddings(),
  ])

  return (
    <SettingsForm
      ajustes={ajustes}
      modelosTexto={modelosTexto}
      modelosEmbeddings={modelosEmbeddings}
    />
  )
}

async function Consumo() {
  const user = await requireUser()
  const filas = await getConsumoDelMes(user.id)

  return <UsagePanel filas={filas} />
}

export default function AjustesPage() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Qué modelo usa cada tarea y cuánto consumiste este mes."
      />

      <Suspense
        fallback={
          <div className="flex flex-col gap-6">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        }
      >
        <Ajustes />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Consumo del mes</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-40 w-full" />}>
            <Consumo />
          </Suspense>
        </CardContent>
      </Card>
    </>
  )
}
