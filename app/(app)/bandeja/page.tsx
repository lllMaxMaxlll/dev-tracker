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
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        title="Bandeja"
        description="Lo que entró por la captura rápida y lo que la IA quiere vincular. Se revisa de a uno: ↵ acepta, E edita, P busca parecidas, X descarta."
      />

      <Suspense fallback={<Skeleton className="h-72" />}>
        <SinRevisar />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-40" />}>
        <Commits />
      </Suspense>
    </div>
  )
}
