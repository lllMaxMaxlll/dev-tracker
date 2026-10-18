import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Revision } from "@/components/bandeja/revision"
import { CommitsPorVincular } from "@/components/bandeja/commits-por-vincular"
import { requireUser } from "@/lib/auth/require-user"
import { getSinRevisar } from "@/lib/db/queries/bandeja"
import { listAreas, listProjectOptions } from "@/lib/db/queries/projects"
import { listarSugerenciasPendientes } from "@/actions/commit-suggestions"

export const metadata: Metadata = { title: "Bandeja · Taller" }

async function SinRevisar() {
  const user = await requireUser()
  const [ordenes, proyectos, areas] = await Promise.all([
    getSinRevisar(user.id),
    listProjectOptions(user.id),
    listAreas(user.id),
  ])

  return <Revision ordenes={ordenes} proyectos={proyectos} areas={areas} />
}

async function Commits() {
  const sugerencias = await listarSugerenciasPendientes()

  return <CommitsPorVincular sugerencias={sugerencias} />
}

/**
 * La Bandeja junta todo lo que la IA propuso y espera tu sí o tu no: las
 * órdenes de la captura rápida y los commits que podrían resolver una.
 */
export default function BandejaPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Bandeja"
        description="Lo que entró por la captura rápida y lo que la IA quiere vincular. Nada de esto cambia hasta que lo confirmes."
      />

      {/* Revisión a la izquierda, commits a la derecha: son dos colas
          independientes y así se ven las dos sin scrollear. */}
      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <Suspense fallback={<Skeleton className="h-72" />}>
          <SinRevisar />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-40" />}>
          <Commits />
        </Suspense>
      </div>
    </div>
  )
}
