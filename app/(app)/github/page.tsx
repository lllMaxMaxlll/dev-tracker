import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { RepoList } from "@/components/github/repo-list"
import { GithubReconectar } from "@/components/github/github-alert"
import { requireUser } from "@/lib/auth/require-user"
import { listarRepos } from "@/lib/github/queries"
import { getRateLimit } from "@/lib/github/client"
import { cargarSeguro } from "@/lib/github/cargar-seguro"
import { listProjects } from "@/lib/db/queries/projects"

export const metadata: Metadata = { title: "GitHub · DevTracker" }

async function Repos() {
  const user = await requireUser()

  const resultado = await cargarSeguro(async () => {
    const [repos, proyectos] = await Promise.all([
      listarRepos(user.id),
      listProjects(user.id),
    ])

    return { repos, proyectos }
  })

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  const { repos, proyectos } = resultado.datos

  const vinculados: Record<string, string> = {}
  for (const proyecto of proyectos) {
    if (proyecto.githubRepoFullName) {
      vinculados[proyecto.githubRepoFullName] = proyecto.name
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {repos.desdeCache ? (
        <p className="text-xs text-muted-foreground">
          Datos cacheados. Se refrescan cada 15 minutos.
        </p>
      ) : null}
      <RepoList repos={repos.datos} vinculados={vinculados} />
    </div>
  )
}

/**
 * La cuota restante se muestra a propósito: sin esto, un problema de rate limit
 * se ve como "GitHub anda lento" y no hay forma de diagnosticarlo.
 */
async function Cuota() {
  const user = await requireUser()
  const resultado = await cargarSeguro(() => getRateLimit(user.id))

  if (!resultado.ok) {
    return null
  }

  const { restante, limite } = resultado.datos

  return (
    <Badge variant="outline" className="tabular-nums">
      {restante}/{limite} de cuota
    </Badge>
  )
}

export default function GithubPage() {
  return (
    <>
      <PageHeader
        title="GitHub"
        description="Commits, ramas, PRs e issues de tus repositorios."
      >
        <Suspense fallback={<Skeleton className="h-6 w-28" />}>
          <Cuota />
        </Suspense>
      </PageHeader>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-full max-w-sm" />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32 rounded-xl" />
              ))}
            </div>
          </div>
        }
      >
        <Repos />
      </Suspense>
    </>
  )
}
