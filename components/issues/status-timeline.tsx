import { ETIQUETAS_ESTADO, type Estado } from "@/lib/schemas/enums"
import { fechaLarga, haceCuanto } from "@/lib/utils/fechas"
import type { IssueStatusHistoryEntry } from "@/lib/db/schema"

const ORIGEN: Record<string, string> = {
  manual: "",
  ai_suggestion_accepted: " (sugerencia de IA aceptada)",
  system: " (automático)",
}

export function StatusTimeline({
  historial,
}: {
  historial: IssueStatusHistoryEntry[]
}) {
  if (historial.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Todavía no hay cambios.</p>
    )
  }

  return (
    <ol className="flex flex-col gap-3">
      {historial.map((entrada) => (
        <li key={entrada.id} className="flex gap-3 text-sm">
          <span
            aria-hidden="true"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-border"
          />
          <div className="flex flex-col gap-0.5">
            <span>
              {entrada.fromStatus ? (
                <>
                  De{" "}
                  <strong className="font-medium">
                    {ETIQUETAS_ESTADO[entrada.fromStatus as Estado]}
                  </strong>{" "}
                  a{" "}
                </>
              ) : (
                "Creado como "
              )}
              <strong className="font-medium">
                {ETIQUETAS_ESTADO[entrada.toStatus as Estado]}
              </strong>
              {ORIGEN[entrada.source] ?? ""}
            </span>
            <time
              dateTime={new Date(entrada.changedAt).toISOString()}
              title={fechaLarga(entrada.changedAt)}
              className="text-xs text-muted-foreground"
            >
              {haceCuanto(entrada.changedAt)}
            </time>
            {entrada.note ? (
              <span className="text-xs text-muted-foreground">
                {entrada.note}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
