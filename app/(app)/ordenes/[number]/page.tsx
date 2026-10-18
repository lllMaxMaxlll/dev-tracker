import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ChevronLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Markdown } from "@/components/issues/markdown"
import { StatusTimeline } from "@/components/issues/status-timeline"
import {
  AreaBadge,
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import {
  AccionesIssue,
  CambiarEstado,
  VinculosIssue,
} from "@/components/issues/issue-detail-actions"
import { IssueAttachments } from "@/components/issues/issue-attachments"
import {
  SeccionEnriquecer,
  SeccionRelacionados,
} from "@/components/issues/issue-ai-sections"
import { requireUser } from "@/lib/auth/require-user"
import {
  getIssueByNumber,
  getIssueHistory,
  getIssueLinks,
} from "@/lib/db/queries/issues"
import { listAreas, listProjectOptions } from "@/lib/db/queries/projects"
import { listAttachments } from "@/lib/db/queries/attachments"
import { getRelacionesDeIssue } from "@/lib/db/queries/relaciones"
import { fechaLarga, haceCuanto } from "@/lib/utils/fechas"
import {
  duracionLaboralLegible,
  msLaborales,
} from "@/lib/utils/horario-laboral"
import type { Estado } from "@/lib/schemas/enums"

export const metadata: Metadata = { title: "Orden · Taller" }

type Params = Promise<{ number: string }>

/**
 * Una celda de la franja de propiedades. Todas tienen el mismo alto de valor
 * (el de un botón), así el selector de estado y los badges quedan alineados.
 */
function Propiedad({
  etiqueta,
  children,
  className,
}: {
  etiqueta: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 bg-card p-3", className)}>
      <dt className="font-mono text-[0.7rem] tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </dt>
      <dd className="flex min-h-8 min-w-0 items-center">{children}</dd>
    </div>
  )
}

/** Título de sección de la columna principal, con el mismo estilo que las tarjetas. */
function Seccion({
  titulo,
  children,
}: {
  titulo: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/**
 * Cuánto tiempo lleva o llevó, en horas de trabajo, según el estado. Es la
 * misma medida que el tiempo de resolución del Banco.
 */
function tiempoDeLaOrden(issue: {
  status: string
  createdAt: Date
  resolvedAt: Date | null
  firstInProgressAt: Date | null
}): { etiqueta: string; valor: string } {
  if (issue.status === "resuelto" && issue.resolvedAt) {
    return {
      etiqueta: "Resuelta en",
      valor: duracionLaboralLegible(
        msLaborales(issue.createdAt, issue.resolvedAt)
      ),
    }
  }

  if (issue.status === "en_progreso" && issue.firstInProgressAt) {
    return {
      etiqueta: "En el banco",
      valor: duracionLaboralLegible(
        msLaborales(issue.firstInProgressAt, new Date())
      ),
    }
  }

  return { etiqueta: "Abierta", valor: haceCuanto(issue.createdAt) }
}

async function Detalle({ params }: { params: Params }) {
  const user = await requireUser()
  const { number } = await params
  const numero = Number(number)

  if (!Number.isInteger(numero) || numero < 1) {
    notFound()
  }

  const issue = await getIssueByNumber(user.id, numero)

  if (!issue) {
    notFound()
  }

  const [historial, vinculos, proyectos, areas, relacionados, adjuntos] =
    await Promise.all([
      getIssueHistory(user.id, issue.id),
      getIssueLinks(user.id, issue.id),
      listProjectOptions(user.id),
      listAreas(user.id),
      getRelacionesDeIssue(user.id, issue.id),
      listAttachments(user.id, issue.id),
    ])

  const valoresActuales = {
    title: issue.title,
    description: issue.description ?? "",
    projectId: issue.projectId ?? "",
    areaId: issue.areaId ?? "",
    type: issue.type as never,
    priority: issue.priority as never,
    status: issue.status as never,
  }

  const tiempo = tiempoDeLaOrden(issue)

  const fechas: [string, Date][] = [
    ["Creada", issue.createdAt],
    ["Actualizada", issue.updatedAt],
  ]

  if (issue.resolvedAt) fechas.push(["Resuelta", issue.resolvedAt])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        {/* Ruta y acciones en la misma línea: los botones quedan arriba a la
            derecha siempre, sin importar cuánto mida el título. */}
        <div className="flex items-center justify-between gap-3">
          <nav
            aria-label="Ruta"
            className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground"
          >
            <Link
              href="/ordenes"
              className="inline-flex items-center gap-1 rounded-sm py-1 pr-1 hover:text-foreground"
            >
              <ChevronLeftIcon className="size-4" />
              ÓRDENES
            </Link>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">#{issue.number}</span>
            <span className="hidden truncate sm:inline">
              · {issue.createdVia === "ai_capture" ? "captura por IA" : "a mano"}
            </span>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <AccionesIssue
              issueId={issue.id}
              numero={issue.number}
              proyectos={proyectos}
              areas={areas}
              fotosExistentes={adjuntos.length}
              valoresIniciales={valoresActuales}
            />
          </div>
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-balance md:text-3xl">
          {issue.title}
        </h1>

        {/* gap-px sobre fondo de borde: las líneas entre celdas quedan de
            1px sin importar cuántas columnas entren en cada ancho. */}
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3 lg:grid-cols-6">
          <Propiedad etiqueta="Estado">
            <CambiarEstado
              issueId={issue.id}
              estado={issue.status as Estado}
              className="w-full"
            />
          </Propiedad>
          <Propiedad etiqueta="Tipo">
            <TipoBadge tipo={issue.type} />
          </Propiedad>
          <Propiedad etiqueta="Prioridad">
            <PrioridadBadge prioridad={issue.priority} />
          </Propiedad>
          <Propiedad etiqueta="Proyecto">
            <ProyectoBadge
              nombre={issue.projectName}
              color={issue.projectColor}
            />
          </Propiedad>
          <Propiedad etiqueta="Área">
            {issue.areaName ? (
              <AreaBadge nombre={issue.areaName} color={issue.areaColor} />
            ) : (
              <span className="text-sm text-muted-foreground">Sin área</span>
            )}
          </Propiedad>
          <Propiedad etiqueta={tiempo.etiqueta}>
            <span className="truncate font-mono text-sm">{tiempo.valor}</span>
          </Propiedad>
        </dl>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Seccion titulo="Descripción">
            {issue.description ? (
              <Markdown>{issue.description}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin descripción todavía. «Ayuda para completarla», más abajo,
                propone una a partir del título.
              </p>
            )}
          </Seccion>

          <Seccion titulo="Fotos">
            <IssueAttachments issueId={issue.id} adjuntos={adjuntos} />
          </Seccion>

          <Seccion titulo="Commits y PRs">
            <VinculosIssue issueId={issue.id} vinculos={vinculos} />
          </Seccion>

          <Seccion titulo="Relacionadas">
            <SeccionRelacionados
              issueId={issue.id}
              vinculadosIniciales={relacionados.map((r) => r.relatedIssueId)}
            />
          </Seccion>

          <Seccion titulo="Ayuda para completarla">
            <SeccionEnriquecer
              issueId={issue.id}
              valoresActuales={valoresActuales}
            />
          </Seccion>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-18">
          <Seccion titulo="Cronología">
            <div className="flex flex-col gap-4">
              <StatusTimeline historial={historial} />

              <dl className="flex flex-col border-t pt-3 font-mono text-xs">
                {fechas.map(([etiqueta, fecha]) => (
                  <div key={etiqueta} className="flex justify-between gap-2 py-1">
                    <dt className="text-muted-foreground uppercase">
                      {etiqueta}
                    </dt>
                    <dd title={fechaLarga(fecha)}>{haceCuanto(fecha)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Seccion>
        </aside>
      </div>
    </div>
  )
}

export default function OrdenPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-8 w-28" />
          </div>
          <Skeleton className="h-9 w-[32rem] max-w-full" />
          <Skeleton className="h-20" />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      }
    >
      <Detalle params={params} />
    </Suspense>
  )
}
