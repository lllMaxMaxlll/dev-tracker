import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { DiaHeatmap } from "@/lib/github/queries"

/**
 * Heatmap de commits estilo contribution graph: 53 columnas (semanas) por 7
 * filas (días), con la intensidad según la cantidad de commits.
 *
 * Es un grid propio y no un gráfico de recharts: la forma es fija y así queda
 * más liviano y accesible.
 */
const NIVELES = [
  "bg-muted",
  "bg-emerald-500/25",
  "bg-emerald-500/45",
  "bg-emerald-500/70",
  "bg-emerald-500",
]

function nivel(total: number, maximo: number): number {
  if (total === 0) return 0
  if (maximo <= 1) return 4

  // Escala relativa al día más activo, para que el gráfico sirva igual en un
  // repo de 2 commits por semana que en uno de 40.
  const proporcion = total / maximo

  if (proporcion <= 0.25) return 1
  if (proporcion <= 0.5) return 2
  if (proporcion <= 0.75) return 3

  return 4
}

const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
]

export function CommitHeatmap({
  dias,
  calculando,
}: {
  dias: DiaHeatmap[]
  calculando: boolean
}) {
  if (calculando) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        GitHub está preparando las estadísticas de este repositorio. Volvé a
        entrar en un rato.
      </p>
    )
  }

  if (dias.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Todavía no hay actividad registrada.
      </p>
    )
  }

  const maximo = Math.max(...dias.map((d) => d.total))
  const total = dias.reduce((suma, d) => suma + d.total, 0)

  // Se agrupa en columnas de 7 empezando por el primer día que trae la API,
  // que ya viene alineado a domingo.
  const semanas: DiaHeatmap[][] = []
  for (let i = 0; i < dias.length; i += 7) {
    semanas.push(dias.slice(i, i + 7))
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {total.toLocaleString("es-AR")} commits en el último año
      </p>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max flex-col gap-1">
          {/* Etiquetas de mes: sólo cuando cambia respecto de la semana previa */}
          <div className="flex gap-[3px] pl-0 text-[10px] text-muted-foreground">
            {semanas.map((semana, i) => {
              const primero = semana[0]
              const mesActual = primero
                ? new Date(primero.fecha).getMonth()
                : -1
              const mesPrevio =
                i > 0 && semanas[i - 1][0]
                  ? new Date(semanas[i - 1][0].fecha).getMonth()
                  : -1

              return (
                <span key={i} className="w-[11px] shrink-0">
                  {mesActual !== mesPrevio ? MESES[mesActual] : ""}
                </span>
              )
            })}
          </div>

          <div className="flex gap-[3px]">
            {semanas.map((semana, i) => (
              <div key={i} className="flex flex-col gap-[3px]">
                {semana.map((dia) => (
                  <Tooltip key={dia.fecha}>
                    <TooltipTrigger
                      render={
                        <div
                          className={cn(
                            "size-[11px] rounded-[2px]",
                            NIVELES[nivel(dia.total, maximo)]
                          )}
                        />
                      }
                    />
                    <TooltipContent>
                      {dia.total === 0
                        ? "Sin commits"
                        : `${dia.total} ${dia.total === 1 ? "commit" : "commits"}`}{" "}
                      · {dia.fecha}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Menos</span>
        {NIVELES.map((clase, i) => (
          <span key={i} className={cn("size-[11px] rounded-[2px]", clase)} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}
