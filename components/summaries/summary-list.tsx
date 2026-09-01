import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Markdown } from "@/components/issues/markdown"
import { fechaCorta, haceCuanto } from "@/lib/utils/fechas"
import type { WeeklySummary } from "@/lib/db/schema"

type Stats = {
  creados?: number
  resueltos?: number
  commits?: number
}

export function SummaryList({ resumenes }: { resumenes: WeeklySummary[] }) {
  if (resumenes.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyTitle>Todavía no hay resúmenes</EmptyTitle>
          <EmptyDescription>
            Se generan solos los viernes. También podés generar el de esta
            semana ahora mismo, si ya hubo actividad.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {resumenes.map((resumen) => {
        const stats = (resumen.stats ?? {}) as Stats

        return (
          <Card key={resumen.id}>
            <CardHeader>
              <CardTitle>
                Semana del {fechaCorta(resumen.weekStart)} al{" "}
                {fechaCorta(resumen.weekEnd)}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                {stats.creados !== undefined ? (
                  <Badge variant="secondary">{stats.creados} creados</Badge>
                ) : null}
                {stats.resueltos !== undefined ? (
                  <Badge variant="secondary">{stats.resueltos} resueltos</Badge>
                ) : null}
                {stats.commits ? (
                  <Badge variant="outline">{stats.commits} commits</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {resumen.generatedBy === "cron" ? "automático" : "manual"} ·{" "}
                  {haceCuanto(resumen.generatedAt)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Markdown>{resumen.contentMd}</Markdown>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
