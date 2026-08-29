import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IssueFilters } from "@/components/issues/issue-filters"
import { IssueKanban } from "@/components/issues/issue-kanban"
import { IssueTable } from "@/components/issues/issue-table"
import { ViewSwitcher } from "@/components/issues/view-switcher"
import { requireUser } from "@/lib/auth/require-user"
import { listIssues, listIssuesForKanban } from "@/lib/db/queries/issues"
import { listProjectOptions } from "@/lib/db/queries/projects"
import { issueFiltersSchema } from "@/lib/schemas/issue"

export const metadata: Metadata = { title: "Problemas · DevTracker" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function Contenido({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser()
  const crudos = await searchParams

  // Los search params vienen del usuario: se validan como cualquier otra
  // entrada. Un valor inválido cae al default en vez de romper la página.
  const filtros = issueFiltersSchema
    .catch({
      vista: "tabla",
      orden: "actualizado",
      dir: "desc",
    })
    .parse(crudos)

  const [proyectos, issues] = await Promise.all([
    listProjectOptions(user.id),
    filtros.vista === "kanban"
      ? listIssuesForKanban(user.id, filtros)
      : listIssues(user.id, filtros),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <IssueFilters proyectos={proyectos} />
        <ViewSwitcher vista={filtros.vista} />
      </div>

      {filtros.vista === "kanban" ? (
        <IssueKanban issues={issues} />
      ) : (
        <IssueTable issues={issues} />
      )}
    </div>
  )
}

function ContenidoSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}

export default function ProblemasPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  return (
    <>
      <PageHeader
        title="Problemas"
        description="Todo lo que anotarías en el cuaderno, en un solo lugar."
      />
      <Suspense fallback={<ContenidoSkeleton />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  )
}
