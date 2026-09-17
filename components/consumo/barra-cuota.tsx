import { cn } from "@/lib/utils"
import { formatearValor, type Unidad } from "@/lib/monitor/metrics"
import type { Excedente } from "@/lib/monitor/quotas"

/**
 * Uso de una métrica contra el tope de su plan.
 *
 * La barra sólo se dibuja cuando el tope es un dato real: lo informa el
 * proveedor en la misma respuesta, o está en `plan_quotas` con su fuente y su
 * fecha. Sin tope se muestra el valor y se dice que no hay límite que mostrar.
 *
 * Es la diferencia entre informar y aparentar: una barra con un denominador
 * supuesto se ve exactamente igual de convincente que una correcta, y es la
 * clase de número que hace ignorar un aviso que sí importaba.
 */
export function BarraCuota({
  valor,
  tope,
  unidad,
  etiqueta,
  excedente,
  motivoSinTope,
}: {
  valor: number
  tope?: number
  unidad: Unidad
  etiqueta: string
  excedente?: Excedente
  /** Por qué no hay barra, cuando se sabe. */
  motivoSinTope?: string
}) {
  const formateado = formatearValor(valor, unidad)

  if (!tope || tope <= 0) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{etiqueta}</span>
          <span className="font-medium tabular-nums">{formateado}</span>
        </div>
        {motivoSinTope ? (
          <span className="text-xs text-muted-foreground/70">
            {motivoSinTope}
          </span>
        ) : null}
      </div>
    )
  }

  const proporcion = valor / tope
  const porcentaje = Math.min(100, proporcion * 100)
  const pasado = proporcion > 1

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="font-medium tabular-nums">
          {formateado}
          <span className="text-muted-foreground">
            {" / "}
            {formatearValor(tope, unidad)}
          </span>
          <span
            className={cn(
              "ml-2 text-xs",
              pasado
                ? "text-destructive"
                : porcentaje >= 80
                  ? "text-amber-600 dark:text-amber-500"
                  : "text-muted-foreground"
            )}
          >
            {Math.round(proporcion * 100)}%
          </span>
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pasado || porcentaje >= 90
              ? "bg-destructive"
              : porcentaje >= 70
                ? "bg-amber-500"
                : "bg-primary"
          )}
          style={{ width: `${Math.max(porcentaje, 1)}%` }}
        />
      </div>

      {excedente ? (
        <span className="text-xs text-destructive">
          Excedente: {formatearValor(excedente.cantidad, unidad)} ·{" "}
          {formatearValor(excedente.costoUsd, "usd")} este mes
        </span>
      ) : null}
    </div>
  )
}
