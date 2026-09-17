import { cn } from "@/lib/utils"
import { formatearValor, type Unidad } from "@/lib/monitor/metrics"

/**
 * Barra de uso contra la cuota.
 *
 * Sólo se dibuja cuando el tope es un dato real —lo informa el proveedor, o
 * está en lib/monitor/quotas.ts con fecha y fuente—. Sin tope se muestra el
 * valor absoluto y nada más: una barra con un denominador inventado se ve
 * igual de convincente que una correcta, y es exactamente el error que haría
 * ignorar un aviso que sí importaba.
 */
export function BarraCuota({
  valor,
  tope,
  unidad,
  etiqueta,
}: {
  valor: number
  tope?: number
  unidad: Unidad
  etiqueta: string
}) {
  const formateado = formatearValor(valor, unidad)

  if (!tope || tope <= 0) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="font-medium tabular-nums">{formateado}</span>
      </div>
    )
  }

  const porcentaje = Math.min(100, (valor / tope) * 100)

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
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            porcentaje >= 90
              ? "bg-destructive"
              : porcentaje >= 70
                ? "bg-amber-500"
                : "bg-primary"
          )}
          style={{ width: `${Math.max(porcentaje, 1)}%` }}
        />
      </div>
    </div>
  )
}
