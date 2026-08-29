"use client"

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { ArrowDownIcon, ArrowUpIcon, ListTodoIcon } from "lucide-react"

import { cn } from "@/lib/utils"
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
  EstadoBadge,
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import { haceCuanto } from "@/lib/utils/fechas"
import { conParametros } from "@/lib/utils/search-params"
import type { IssueListItem } from "@/lib/db/queries/issues"
import type { Orden } from "@/lib/schemas/issue"

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
      `${pathname}${conParametros(searchParams, { orden: campo, dir })}`
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

export function IssueTable({ issues }: { issues: IssueListItem[] }) {
  if (issues.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListTodoIcon />
          </EmptyMedia>
          <EmptyTitle>No hay problemas</EmptyTitle>
          <EmptyDescription>
            Probá quitando algún filtro, o cargá uno nuevo con la tecla C.
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
            <TableHead>Tipo</TableHead>
            <CabeceraOrdenable campo="prioridad">Prioridad</CabeceraOrdenable>
            <TableHead>Estado</TableHead>
            <CabeceraOrdenable campo="actualizado" className="text-right">
              Actividad
            </CabeceraOrdenable>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {issue.number}
              </TableCell>
              <TableCell>
                <Link
                  href={`/problemas/${issue.number}`}
                  className={cn(
                    "font-medium underline-offset-4 hover:underline",
                    issue.status === "descartado" &&
                      "text-muted-foreground line-through"
                  )}
                >
                  {issue.title}
                </Link>
              </TableCell>
              <TableCell>
                <ProyectoBadge
                  nombre={issue.projectName}
                  color={issue.projectColor}
                />
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
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
