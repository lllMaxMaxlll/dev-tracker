"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ListTodoIcon,
  PencilIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  AreaBadge,
  EstadoBadge,
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import { useEdicionRapida } from "@/components/issues/edicion-rapida"
import { TituloIssue } from "@/components/issues/titulo-issue"
import { haceCuanto } from "@/lib/utils/fechas"
import { conParametros } from "@/lib/utils/search-params"
import type { IssueListItem } from "@/lib/db/queries/issues"
import type { Orden } from "@/lib/schemas/issue"
import type {
  AreaOpcion,
  ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"

/** Cabecera que alterna el orden por esa columna vía la URL. */
function CabeceraOrdenable({
  campo,
  children,
  className,
}: {
  campo: Orden
  children: React.ReactNode
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const ordenActual = searchParams.get("orden") ?? "actualizado"
  const dirActual = searchParams.get("dir") ?? "desc"
  const activa = ordenActual === campo

  function alternar() {
    const dir = activa && dirActual === "desc" ? "asc" : "desc"

    router.push(
      `${pathname}${conParametros(searchParams, {
        orden: campo,
        dir,
        pagina: null,
      })}`
    )
  }

  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={alternar}
        className="inline-flex items-center gap-1 font-medium hover:text-foreground"
      >
        {children}
        {activa ? (
          dirActual === "asc" ? (
            <ArrowUpIcon className="size-3" />
          ) : (
            <ArrowDownIcon className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  )
}

export function IssueTable({
  issues,
  proyectos,
  areas,
}: {
  issues: IssueListItem[]
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
}) {
  const edicion = useEdicionRapida({ proyectos, areas })

  if (issues.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>No hay problemas</EmptyTitle>
          <EmptyDescription>
            Probá quitando algún filtro, o cargá uno con «Nuevo problema».
            También podés dictarlo en lenguaje natural desde «Anotar».
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <CabeceraOrdenable campo="numero" className="w-16">
              #
            </CabeceraOrdenable>
            <TableHead className="min-w-64">Título</TableHead>
            <TableHead>Proyecto</TableHead>
            <TableHead>Área</TableHead>
            <TableHead>Tipo</TableHead>
            <CabeceraOrdenable campo="prioridad">Prioridad</CabeceraOrdenable>
            <TableHead>Estado</TableHead>
            <CabeceraOrdenable campo="actualizado" className="text-right">
              Actividad
            </CabeceraOrdenable>
            <TableHead className="w-10">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id} className="group/fila">
              <TableCell className="text-muted-foreground tabular-nums">
                {issue.number}
              </TableCell>
              <TableCell>
                <TituloIssue
                  numero={issue.number}
                  titulo={issue.title}
                  excerpt={issue.excerpt}
                  className={cn(
                    "font-medium",
                    issue.status === "descartado" &&
                      "text-muted-foreground line-through"
                  )}
                />
              </TableCell>
              <TableCell>
                <ProyectoBadge
                  nombre={issue.projectName}
                  color={issue.projectColor}
                />
              </TableCell>
              <TableCell>
                {issue.areaName ? (
                  <AreaBadge nombre={issue.areaName} color={issue.areaColor} />
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <TipoBadge tipo={issue.type} />
              </TableCell>
              <TableCell>
                <PrioridadBadge prioridad={issue.priority} />
              </TableCell>
              <TableCell>
                <EstadoBadge estado={issue.status} />
              </TableCell>
              <TableCell className="text-right text-sm whitespace-nowrap text-muted-foreground">
                {haceCuanto(issue.updatedAt)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar #${issue.number}`}
                  title="Editar"
                  onClick={() => edicion.abrir(issue.id)}
                  disabled={edicion.abriendo !== null}
                  // Igual que en el kanban: aparece al pasar el mouse, y
                  // siempre en pantallas táctiles, que no tienen hover.
                  className="text-muted-foreground opacity-0 group-hover/fila:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                >
                  {edicion.abriendo === issue.id ? <Spinner /> : <PencilIcon />}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {edicion.dialogo}
    </div>
  )
}
