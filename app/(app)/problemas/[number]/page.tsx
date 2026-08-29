import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ArrowLeftIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Markdown } from "@/components/issues/markdown"
import { StatusTimeline } from "@/components/issues/status-timeline"
import {
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import {
  AccionesIssue,
  CambiarEstado,
  VinculosIssue,
} from "@/components/issues/issue-detail-actions"
import { Proximamente } from "@/components/layout/proximamente"
import { requireUser } from "@/lib/auth/require-user"
import {
  getIssueByNumber,
  getIssueHistory,
  getIssueLinks,
} from "@/lib/db/queries/issues"
import { listProjectOptions } from "@/lib/db/queries/projects"
import { fechaLarga, haceCuanto } from "@/lib/utils/fechas"
import type { Estado } from "@/lib/schemas/enums"

export const metadata: Metadata = { title: "Problema · DevTracker" }

type Params = Promise<{ number: string }>

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

  const [historial, vinculos, proyectos] = await Promise.all([
    getIssueHistory(user.id, issue.id),
    getIssueLinks(user.id, issue.id),
    listProjectOptions(user.id),
  ])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/problemas" />}
        >
          <ArrowLeftIcon data-icon="inline-start" />
          Volver a problemas
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <span className="text-sm text-muted-foreground tabular-nums">
            #{issue.number}
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            {issue.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <TipoBadge tipo={issue.type} />
            <PrioridadBadge prioridad={issue.priority} />
            <ProyectoBadge
              nombre={issue.projectName}
              color={issue.projectColor}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CambiarEstado issueId={issue.id} estado={issue.status as Estado} />
          <AccionesIssue
            issueId={issue.id}
            numero={issue.number}
            proyectos={proyectos}
            valoresIniciales={{
              title: issue.title,
              description: issue.description ?? "",
              projectId: issue.projectId ?? "",
              type: issue.type as never,
              priority: issue.priority as never,
              status: issue.status as never,
            }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Descripción</CardTitle>
            </CardHeader>
            <CardContent>
              {issue.description ? (
                <Markdown>{issue.description}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin descripción todavía.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Commits y PRs</CardTitle>
            </CardHeader>
            <CardContent>
              <VinculosIssue issueId={issue.id} vinculos={vinculos} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Relacionados</CardTitle>
            </CardHeader>
            <CardContent>
              <Proximamente
                fase="Fase 6"
                detalle="Problemas parecidos detectados por similitud de embeddings."
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <StatusTimeline historial={historial} />

              <Separator />

              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Creado</dt>
                  <dd title={fechaLarga(issue.createdAt)}>
                    {haceCuanto(issue.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Actualizado</dt>
                  <dd title={fechaLarga(issue.updatedAt)}>
                    {haceCuanto(issue.updatedAt)}
                  </dd>
                </div>
                {issue.resolvedAt ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Resuelto</dt>
                    <dd title={fechaLarga(issue.resolvedAt)}>
                      {haceCuanto(issue.resolvedAt)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Origen</dt>
                  <dd>
                    {issue.createdVia === "ai_capture"
                      ? "Captura por IA"
                      : "Manual"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default function ProblemaPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-96 max-w-full" />
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      }
    >
      <Detalle params={params} />
    </Suspense>
  )
}
