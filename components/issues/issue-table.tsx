"use client"

import * as React from "react"
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

function editandoTexto(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/** Desde este ancho el inspector va al costado; más angosto no entra. */
const ANCHO_INSPECTOR = 1024

export function IssueTable({
  issues,
  proyectos,
  areas,
  seleccionado,
}: {
  issues: IssueListItem[]
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
  /** Número de la orden abierta en el inspector. */
  seleccionado?: number
}) {
  const edicion = useEdicionRapida({ proyectos, areas })
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  /**
   * Abre una orden en el inspector, con la URL como única fuente de verdad:
   * así el back del navegador y un link compartido muestran lo mismo. En
   * pantallas angostas no hay lugar para el inspector y va a la página.
   */
  const seleccionar = React.useCallback(
    (numero: number | null) => {
      if (numero !== null && window.innerWidth < ANCHO_INSPECTOR) {
        router.push(`/ordenes/${numero}`)

        return
      }

      router.replace(
        `${pathname}${conParametros(searchParams, {
          sel: numero === null ? null : String(numero),
        })}`,
        { scroll: false }
      )
    },
    [pathname, router, searchParams]
  )

  // J/K recorren la lista, ↵ abre la página completa y Esc cierra el
  // inspector. Los números se leen desde un ref para no re-registrar el
  // listener con cada página.
  const numerosRef = React.useRef<number[]>([])

  React.useEffect(() => {
    numerosRef.current = issues.map((issue) => issue.number)
  }, [issues])

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.defaultPrevented || editandoTexto(event.target)) return
      if (document.querySelector("[role=dialog]")) return

      const numeros = numerosRef.current
      const indice =
        seleccionado === undefined ? -1 : numeros.indexOf(seleccionado)
      const tecla = event.key.toLowerCase()

      if (tecla === "j" || tecla === "k") {
        event.preventDefault()
        const siguiente =
          tecla === "j"
            ? Math.min(numeros.length - 1, indice + 1)
            : Math.max(0, indice - 1)

        if (numeros[siguiente] !== undefined) seleccionar(numeros[siguiente])
      } else if (tecla === "enter" && seleccionado !== undefined) {
        event.preventDefault()
        router.push(`/ordenes/${seleccionado}`)
      } else if (tecla === "escape" && seleccionado !== undefined) {
        seleccionar(null)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [router, seleccionado, seleccionar])

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
            <TableRow
              key={issue.id}
              data-state={issue.number === seleccionado ? "selected" : undefined}
              className="group/fila cursor-pointer data-[state=selected]:shadow-[inset_3px_0_0_var(--primary)]"
              onClick={(event) => {
                // Los links y botones de la fila hacen lo suyo.
                if ((event.target as HTMLElement).closest("a, button")) return

                seleccionar(issue.number)
              }}
            >
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
