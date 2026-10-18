import { Suspense } from "react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { IssueFilters } from "@/components/issues/issue-filters"
import { IssueKanban } from "@/components/issues/issue-kanban"
import { IssueTable } from "@/components/issues/issue-table"
import { ViewSwitcher } from "@/components/issues/view-switcher"
import { requireUser } from "@/lib/auth/require-user"
import { IssuePagination } from "@/components/issues/issue-pagination"
import {
  getAutoArchivoKanban,
  listIssues,
  listIssuesForKanban,
} from "@/lib/db/queries/issues"
import { listAreas, listProjectOptions } from "@/lib/db/queries/projects"
import {
  TAMANO_PAGINA,
  issueFiltersSchema,
  type IssueFilters as Filtros,
} from "@/lib/schemas/issue"
import { conParametros } from "@/lib/utils/search-params"
import { NewIssueButton } from "@/components/issues/new-issue-button"
import { Inspector } from "@/components/issues/inspector"

export const metadata: Metadata = { title: "Órdenes · Taller" }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

async function BotonNuevo() {
  const user = await requireUser()
  const [proyectos, areas] = await Promise.all([
    listProjectOptions(user.id),
    listAreas(user.id),
  ])

  return <NewIssueButton proyectos={proyectos} areas={areas} />
}

async function Kanban({
  userId,
  filtros,
  proyectos,
  areas,
}: {
  userId: string
  filtros: Filtros
  proyectos: Awaited<ReturnType<typeof listProjectOptions>>
  areas: Awaited<ReturnType<typeof listAreas>>
}) {
  const diasAuto = await getAutoArchivoKanban(userId)
  const { issues, archivadas } = await listIssuesForKanban(
    userId,
    filtros,
    diasAuto
  )

  return (
    <IssueKanban
      issues={issues}
      archivadas={archivadas}
      verArchivadas={Boolean(filtros.archivadas)}
      diasAuto={diasAuto}
      proyectos={proyectos}
      areas={areas}
    />
  )
}

async function Tabla({
  userId,
  filtros,
  crudos,
  proyectos,
  areas,
}: {
  userId: string
  filtros: Filtros
  crudos: Record<string, string | string[] | undefined>
  proyectos: Awaited<ReturnType<typeof listProjectOptions>>
  areas: Awaited<ReturnType<typeof listAreas>>
}) {
  const { issues, total } = await listIssues(userId, filtros)
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))

  // Una página que ya no existe (se borraron problemas, o cambió un filtro en
  // una URL vieja) lleva a la última en vez de mostrar una tabla vacía.
  if (filtros.pagina > paginas) {
    const params = new URLSearchParams()

    for (const [clave, valor] of Object.entries(crudos)) {
      if (typeof valor === "string") params.set(clave, valor)
    }

    redirect(
      `/ordenes${conParametros(params, { pagina: paginas > 1 ? String(paginas) : null })}`
    )
  }

  const tabla = (
    <div className="flex min-w-0 flex-col gap-3">
      <IssueTable
        issues={issues}
        proyectos={proyectos}
        areas={areas}
        seleccionado={filtros.sel}
      />
      <IssuePagination pagina={filtros.pagina} total={total} />
    </div>
  )

  if (filtros.sel === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {tabla}
        <p className="hidden font-mono text-xs text-muted-foreground lg:block">
          Click en una fila o J/K para abrir el inspector · ↵ abre la orden
          completa
        </p>
      </div>
    )
  }

  const sinSeleccion = new URLSearchParams()

  for (const [clave, valor] of Object.entries(crudos)) {
    if (typeof valor === "string" && clave !== "sel") {
      sinSeleccion.set(clave, valor)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
      {tabla}
      <aside className="hidden self-start rounded-md border bg-card lg:sticky lg:top-18 lg:block">
        <Suspense
          key={filtros.sel}
          fallback={<Skeleton className="m-4 h-64" />}
        >
          <Inspector
            userId={userId}
            numero={filtros.sel}
            cerrarHref={`/ordenes${conParametros(sinSeleccion, {})}`}
          />
        </Suspense>
      </aside>
    </div>
  )
}

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
      pagina: 1,
    })
    .parse(crudos)

  const [proyectos, areas] = await Promise.all([
    listProjectOptions(user.id),
    listAreas(user.id),
  ])

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <IssueFilters proyectos={proyectos} areas={areas} />
        <ViewSwitcher vista={filtros.vista} />
      </div>

      {filtros.vista === "kanban" ? (
        <Kanban
          userId={user.id}
          filtros={filtros}
          proyectos={proyectos}
          areas={areas}
        />
      ) : (
        <Tabla
          userId={user.id}
          filtros={filtros}
          crudos={crudos}
          proyectos={proyectos}
          areas={areas}
        />
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
        title="Órdenes"
        description="Todas las órdenes de trabajo: bugs, features, mejoras, ideas y deuda."
      >
        <Suspense fallback={<Skeleton className="h-9 w-40" />}>
          <BotonNuevo />
        </Suspense>
      </PageHeader>
      <Suspense fallback={<ContenidoSkeleton />}>
        <Contenido searchParams={searchParams} />
      </Suspense>
    </>
  )
}
