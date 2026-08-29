import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/lib/auth/require-user"

export const metadata: Metadata = { title: "Dashboard · DevTracker" }

async function Saludo() {
  const user = await requireUser()
  const nombre = user.displayName.split(" ")[0]

  return (
    <PageHeader
      title={`Hola, ${nombre}`}
      description="Este es el resumen de tu trabajo. Por ahora está vacío: cargá tu primer problema para empezar a ver métricas."
    />
  )
}

export default function DashboardPage() {
  return (
    <>
      <Suspense fallback={<Skeleton className="h-16 w-full max-w-md" />}>
        <Saludo />
      </Suspense>

      <Proximamente
        fase="Fase 3"
        detalle="Tarjetas resumen, abiertos vs. resueltos por semana, distribución por tipo y proyecto, y los últimos problemas tocados."
      />
    </>
  )
}
