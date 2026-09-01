import { ETIQUETAS_ESTADO, type Estado } from "@/lib/schemas/enums"
import { fechaLarga, haceCuanto } from "@/lib/utils/fechas"
import type { IssueStatusHistoryEntry } from "@/lib/db/schema"

/**
 * Etiqueta de un estado del historial.
 *
 * El historial guarda texto libre, no el enum, justamente para poder conservar
 * estados que la app ya no ofrece (`bloqueado` se quitó). Cuando aparece uno
 * así, se muestra el valor crudo con la primera en mayúscula en vez de
 * "undefined".
 */
function etiqueta(estado: string): string {
  return (
    ETIQUETAS_ESTADO[estado as Estado] ??
    estado.charAt(0).toUpperCase() + estado.slice(1).replace(/_/g, " ")
  )
}

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
                    {etiqueta(entrada.fromStatus)}
                  </strong>{" "}
                  a{" "}
                </>
              ) : (
                "Creado como "
              )}
              <strong className="font-medium">
                {etiqueta(entrada.toStatus)}
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
