import { GitBranchIcon, GitPullRequestIcon, CircleDotIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { haceCuanto } from "@/lib/utils/fechas"
import type {
  CommitResumen,
  IssueResumen,
  PullResumen,
  RamaResumen,
} from "@/lib/github/queries"

function Vacio({ texto }: { texto: string }) {
  return <p className="py-6 text-sm text-muted-foreground">{texto}</p>
}

export function CommitList({ commits }: { commits: CommitResumen[] }) {
  if (commits.length === 0) {
    return <Vacio texto="Sin commits recientes." />
  }

  return (
    <ul className="flex flex-col divide-y">
      {commits.map((commit) => (
        <li key={commit.sha} className="flex flex-col gap-1 py-3 first:pt-0">
          <a
            href={commit.url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {commit.mensaje}
          </a>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              {commit.sha.slice(0, 7)}
            </code>
            {commit.autor ? <span>{commit.autor}</span> : null}
            {commit.fecha ? <span>{haceCuanto(commit.fecha)}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

const COLOR_PR: Record<PullResumen["estado"], string> = {
  abierto: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fusionado: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  cerrado: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
}

export function PullList({ pulls }: { pulls: PullResumen[] }) {
  if (pulls.length === 0) {
    return <Vacio texto="Este repositorio no tiene pull requests." />
  }

  return (
    <ul className="flex flex-col divide-y">
      {pulls.map((pr) => (
        <li key={pr.numero} className="flex flex-col gap-1 py-3 first:pt-0">
          <div className="flex items-baseline gap-2">
            <GitPullRequestIcon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              {pr.titulo}
            </a>
            <Badge
              variant="secondary"
              className={`border-0 ${COLOR_PR[pr.estado]}`}
            >
              {pr.estado}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-5 text-xs text-muted-foreground">
            <span>#{pr.numero}</span>
            {pr.autor ? <span>{pr.autor}</span> : null}
            <span>{haceCuanto(pr.creadoEn)}</span>
            <code className="rounded bg-muted px-1 py-0.5 font-mono">
              {pr.rama}
            </code>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function IssueList({ issues }: { issues: IssueResumen[] }) {
  if (issues.length === 0) {
    return <Vacio texto="Este repositorio no tiene issues." />
  }

  return (
    <ul className="flex flex-col divide-y">
      {issues.map((issue) => (
        <li key={issue.numero} className="flex flex-col gap-1 py-3 first:pt-0">
          <div className="flex items-baseline gap-2">
            <CircleDotIcon className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground" />
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 text-sm font-medium underline-offset-4 hover:underline"
            >
              {issue.titulo}
            </a>
            <Badge
              variant={issue.estado === "abierto" ? "secondary" : "outline"}
            >
              {issue.estado}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-5 text-xs text-muted-foreground">
            <span>#{issue.numero}</span>
            {issue.autor ? <span>{issue.autor}</span> : null}
            <span>{haceCuanto(issue.creadoEn)}</span>
            {issue.etiquetas.slice(0, 3).map((etiqueta) => (
              <Badge key={etiqueta} variant="outline" className="text-[10px]">
                {etiqueta}
              </Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}

export function BranchList({ ramas }: { ramas: RamaResumen[] }) {
  if (ramas.length === 0) {
    return <Vacio texto="Sin ramas." />
  }

  return (
    <ul className="flex flex-col divide-y">
      {ramas.map((rama) => (
        <li
          key={rama.nombre}
          className="flex items-center gap-2 py-2.5 first:pt-0"
        >
          <GitBranchIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-sm">
            {rama.nombre}
          </span>
          {rama.esPorDefecto ? (
            <Badge variant="secondary">por defecto</Badge>
          ) : null}
          {rama.protegida ? <Badge variant="outline">protegida</Badge> : null}
          <code className="text-xs text-muted-foreground">
            {rama.sha.slice(0, 7)}
          </code>
        </li>
      ))}
    </ul>
  )
}
