"use client"

import * as React from "react"
import Link from "next/link"
import { LockIcon, SearchIcon, StarIcon, GitForkIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { haceCuanto } from "@/lib/utils/fechas"
import type { RepoResumen } from "@/lib/github/queries"

export function RepoList({
  repos,
  vinculados,
}: {
  repos: RepoResumen[]
  /** `owner/repo` → nombre del proyecto que ya lo tiene vinculado. */
  vinculados: Record<string, string>
}) {
  const [busqueda, setBusqueda] = React.useState("")

  // Con 79 repos el filtrado en el cliente es instantáneo y evita un viaje al
  // servidor por cada tecla.
  const filtrados = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase()

    if (!q) return repos

    return repos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q) ||
        (repo.language ?? "").toLowerCase().includes(q)
    )
  }, [repos, busqueda])

  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar entre ${repos.length} repositorios`}
          aria-label="Buscar repositorios"
          className="pl-8"
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Ningún repositorio coincide con «{busqueda}».
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((repo) => {
            const proyecto = vinculados[repo.fullName]

            return (
              <Card
                key={repo.id}
                className="transition-colors hover:border-foreground/20"
              >
                <CardContent className="flex flex-col gap-2 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/github/${repo.owner}/${repo.name}`}
                      className="min-w-0 font-medium underline-offset-4 hover:underline"
                    >
                      <span className="text-muted-foreground">
                        {repo.owner}/
                      </span>
                      <span className="break-all">{repo.name}</span>
                    </Link>
                    {repo.isPrivate ? (
                      <LockIcon
                        className="mt-1 size-3.5 shrink-0 text-muted-foreground"
                        aria-label="Privado"
                      />
                    ) : null}
                  </div>

                  {repo.description ? (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {repo.description}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {repo.language ? <span>{repo.language}</span> : null}
                    {repo.stars > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <StarIcon className="size-3" />
                        {repo.stars}
                      </span>
                    ) : null}
                    {repo.isFork ? (
                      <span className="inline-flex items-center gap-1">
                        <GitForkIcon className="size-3" />
                        fork
                      </span>
                    ) : null}
                    {repo.updatedAt ? (
                      <span>{haceCuanto(repo.updatedAt)}</span>
                    ) : null}
                  </div>

                  {proyecto ? (
                    <Badge variant="secondary" className="w-fit">
                      Vinculado a {proyecto}
                    </Badge>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
