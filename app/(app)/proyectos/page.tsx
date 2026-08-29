import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { ProjectsView } from "@/components/projects/projects-view"
import { requireUser } from "@/lib/auth/require-user"
import { listProjects } from "@/lib/db/queries/projects"

export const metadata: Metadata = { title: "Proyectos · DevTracker" }

async function Proyectos() {
  const user = await requireUser()
  const proyectos = await listProjects(user.id)

  return <ProjectsView proyectos={proyectos} />
}

function ProyectosSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="ml-auto h-9 w-36" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export default function ProyectosPage() {
  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Agrupá tus problemas y vinculá cada proyecto a un repo."
      />
      <Suspense fallback={<ProyectosSkeleton />}>
        <Proyectos />
      </Suspense>
    </>
  )
}
