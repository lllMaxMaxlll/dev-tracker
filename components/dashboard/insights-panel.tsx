import Link from "next/link"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Markdown } from "@/components/issues/markdown"
import { fechaCorta, haceCuanto } from "@/lib/utils/fechas"
import type { WeeklySummary } from "@/lib/db/schema"

export function InsightsPanel({
  insights,
  generadoEn,
  ultimoResumen,
}: {
  insights: string | null
  generadoEn: Date | null
  ultimoResumen: WeeklySummary | null
}) {
  if (!insights && !ultimoResumen) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Observaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cargá algunos problemas y en un par de días vas a ver acá
            observaciones sobre tus patrones de trabajo, más el último resumen
            semanal.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {insights ? (
        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
            {generadoEn ? (
              <span className="text-xs text-muted-foreground">
                Generadas {haceCuanto(generadoEn)}. Se actualizan una vez por
                día.
              </span>
            ) : null}
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{insights}</p>
          </CardContent>
        </Card>
      ) : null}

      {ultimoResumen ? (
        <Card>
          <CardHeader>
            <CardTitle>Último resumen semanal</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {fechaCorta(ultimoResumen.weekStart)} al{" "}
                {fechaCorta(ultimoResumen.weekEnd)}
              </Badge>
              <Link
                href="/resumenes"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Ver todos
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Markdown>{ultimoResumen.contentMd}</Markdown>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
