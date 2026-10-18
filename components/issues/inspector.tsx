import Link from "next/link"
import { ArrowUpRightIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Markdown } from "@/components/issues/markdown"
import { StatusTimeline } from "@/components/issues/status-timeline"
import {
  AreaBadge,
  PrioridadBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import { CambiarEstado } from "@/components/issues/issue-detail-actions"
import { getIssueByNumber, getIssueHistory } from "@/lib/db/queries/issues"
import { haceCuanto } from "@/lib/utils/fechas"
import type { Estado } from "@/lib/schemas/enums"

/**
 * Inspector de Órdenes: lo esencial de una orden al costado de la tabla, para
 * recorrer la lista sin ir y volver de cada detalle. Lo que requiere más
 * espacio (fotos, vínculos, la ayuda de la IA) queda en la página completa.
 */
export async function Inspector({
  userId,
  numero,
  cerrarHref,
}: {
  userId: string
  numero: number
  cerrarHref: string
}) {
  const issue = await getIssueByNumber(userId, numero)

  if (!issue) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        La orden #{numero} no existe o es de otra cuenta.
      </p>
    )
  }

  const historial = await getIssueHistory(userId, issue.id)

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            #{issue.number}
            {issue.projectName ? ` · ${issue.projectName}` : ""}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            nativeButton={false}
            render={<Link href={cerrarHref} scroll={false} />}
            aria-label="Cerrar el inspector"
            title="Cerrar (Esc)"
          >
            <XIcon />
          </Button>
        </div>
        <h2 className="text-lg font-bold leading-snug">{issue.title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <TipoBadge tipo={issue.type} />
          <PrioridadBadge prioridad={issue.priority} />
          <AreaBadge nombre={issue.areaName} color={issue.areaColor} />
        </div>
        <div className="flex flex-wrap gap-2">
          <CambiarEstado issueId={issue.id} estado={issue.status as Estado} />
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/ordenes/${issue.number}`} />}
          >
            Abrir completa
            <ArrowUpRightIcon data-icon="inline-end" />
          </Button>
        </div>
      </div>

      <div className="border-b p-4 text-sm">
        {issue.description ? (
          <Markdown>{issue.description}</Markdown>
        ) : (
          <p className="text-muted-foreground">Sin descripción todavía.</p>
        )}
      </div>

      <div className="flex flex-col gap-3 p-4">
        <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
          Cronología
        </h3>
        <StatusTimeline historial={historial} />
        <p className="font-mono text-xs text-muted-foreground">
          Creada {haceCuanto(issue.createdAt)} · actualizada{" "}
          {haceCuanto(issue.updatedAt)}
        </p>
      </div>
    </div>
  )
}
