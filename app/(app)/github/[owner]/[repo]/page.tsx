import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"
import { ArrowLeftIcon, ExternalLinkIcon, LockIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CommitHeatmap } from "@/components/github/commit-heatmap"
import {
  BranchList,
  CommitList,
  IssueList,
  PullList,
} from "@/components/github/repo-sections"
import { GithubReconectar } from "@/components/github/github-alert"
import { requireUser } from "@/lib/auth/require-user"
import {
  getActividad,
  getRepo,
  listarCommits,
  listarIssuesDelRepo,
  listarPulls,
  listarRamas,
} from "@/lib/github/queries"
import { cargarSeguro } from "@/lib/github/cargar-seguro"

export const metadata: Metadata = { title: "Repositorio · DevTracker" }

type Params = Promise<{ owner: string; repo: string }>

async function Encabezado({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(() => getRepo(user.id, owner, repo))

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  const { datos } = resultado.datos

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className="text-muted-foreground">{owner}/</span>
          {repo}
        </h1>
        {datos.description ? (
          <p className="text-sm text-muted-foreground">{datos.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {datos.isPrivate ? (
            <Badge variant="outline">
              <LockIcon className="size-3" />
              Privado
            </Badge>
          ) : null}
          {datos.language ? (
            <Badge variant="secondary">{datos.language}</Badge>
          ) : null}
          <Badge variant="outline">{datos.stars} estrellas</Badge>
          <Badge variant="outline">rama {datos.defaultBranch}</Badge>
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={<a href={datos.htmlUrl} target="_blank" rel="noreferrer" />}
      >
        Abrir en GitHub
        <ExternalLinkIcon data-icon="inline-end" />
      </Button>
    </div>
  )
}

async function Actividad({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(() => getActividad(user.id, owner, repo))

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  const { datos } = resultado.datos

  return <CommitHeatmap dias={datos.dias} calculando={datos.calculando} />
}

async function Commits({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(() =>
    listarCommits(user.id, owner, repo)
  )

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  return <CommitList commits={resultado.datos.datos} />
}

async function Pulls({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(() => listarPulls(user.id, owner, repo))

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  return <PullList pulls={resultado.datos.datos} />
}

async function Issues({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(() =>
    listarIssuesDelRepo(user.id, owner, repo)
  )

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  return <IssueList issues={resultado.datos.datos} />
}

async function Ramas({ params }: { params: Params }) {
  const user = await requireUser()
  const { owner, repo } = await params
  const resultado = await cargarSeguro(async () => {
    const { datos: info } = await getRepo(user.id, owner, repo)

    return listarRamas(user.id, owner, repo, info.defaultBranch)
  })

  if (!resultado.ok) {
    return <GithubReconectar mensaje={resultado.mensaje} />
  }

  return <BranchList ramas={resultado.datos.datos} />
}

function Seccion({
  titulo,
  children,
  alto = "h-56",
}: {
  titulo: string
  children: React.ReactNode
  alto?: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<Skeleton className={`w-full ${alto}`} />}>
          {children}
        </Suspense>
      </CardContent>
    </Card>
  )
}

export default function RepoPage({ params }: { params: Params }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/github" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a repositorios
        </Button>
      </div>

      <Suspense fallback={<Skeleton className="h-24 w-full max-w-lg" />}>
        <Encabezado params={params} />
      </Suspense>

      <Seccion titulo="Actividad" alto="h-32">
        <Actividad params={params} />
      </Seccion>

      <div className="grid gap-6 lg:grid-cols-2">
        <Seccion titulo="Commits recientes">
          <Commits params={params} />
        </Seccion>

        <Seccion titulo="Ramas">
          <Ramas params={params} />
        </Seccion>

        <Seccion titulo="Pull requests">
          <Pulls params={params} />
        </Seccion>

        <Seccion titulo="Issues del repo">
          <Issues params={params} />
        </Seccion>
      </div>
    </div>
  )
}
