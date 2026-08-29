import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { ResumenConsumo } from "@/lib/ai/usage"

const ETIQUETA_TAREA: Record<string, string> = {
  capture: "Captura",
  commit_link: "Vinculación de commits",
  summary: "Resumen semanal",
  prioritize: "Priorización",
  enrich: "Enriquecimiento",
  insights: "Insights",
  embedding: "Embeddings",
}

function usd(valor: number) {
  // Los montos son de milésimos de dólar: con 2 decimales todo daría $0,00.
  return valor < 0.01 ? `$${valor.toFixed(5)}` : `$${valor.toFixed(2)}`
}

export function UsagePanel({ filas }: { filas: ResumenConsumo[] }) {
  if (filas.length === 0) {
    return (
      <p className="py-6 text-sm text-muted-foreground">
        Todavía no usaste la IA este mes.
      </p>
    )
  }

  const total = filas.reduce(
    (acumulado, fila) => ({
      llamadas: acumulado.llamadas + fila.llamadas,
      fallidas: acumulado.fallidas + fila.fallidas,
      tokens: acumulado.tokens + fila.tokensEntrada + fila.tokensSalida,
      neurons: acumulado.neurons + fila.neurons,
      costo: acumulado.costo + fila.costoUsd,
    }),
    { llamadas: 0, fallidas: 0, tokens: 0, neurons: 0, costo: 0 }
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { etiqueta: "Llamadas", valor: String(total.llamadas) },
          { etiqueta: "Tokens", valor: total.tokens.toLocaleString("es-AR") },
          {
            etiqueta: "Neurons",
            valor: Math.round(total.neurons).toLocaleString("es-AR"),
          },
          { etiqueta: "Costo estimado", valor: usd(total.costo) },
        ].map((dato) => (
          <div
            key={dato.etiqueta}
            className="flex flex-col gap-0.5 rounded-lg border p-3"
          >
            <span className="text-xs text-muted-foreground">
              {dato.etiqueta}
            </span>
            <span className="text-lg font-semibold tabular-nums">
              {dato.valor}
            </span>
          </div>
        ))}
      </div>

      {total.fallidas > 0 ? (
        <p className="text-xs text-muted-foreground">
          {total.fallidas} de {total.llamadas} llamadas fallaron. Los fallos se
          registran igual para que el consumo no se vea más bajo de lo real.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tarea</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Llamadas</TableHead>
              <TableHead className="text-right">Entrada</TableHead>
              <TableHead className="text-right">Salida</TableHead>
              <TableHead className="text-right">Neurons</TableHead>
              <TableHead className="text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={`${fila.tarea}-${fila.modelo}`}>
                <TableCell>
                  {ETIQUETA_TAREA[fila.tarea] ?? fila.tarea}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {fila.modelo}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fila.llamadas}
                  {fila.fallidas > 0 ? (
                    <Badge variant="outline" className="ml-1.5 text-[10px]">
                      {fila.fallidas} con error
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fila.tokensEntrada.toLocaleString("es-AR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fila.tokensSalida.toLocaleString("es-AR")}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Math.round(fila.neurons)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {usd(fila.costoUsd)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Workers AI incluye 10.000 Neurons por día sin cargo. El costo estimado
        sale de los precios del catálogo, no de una conversión de Neurons.
      </p>
    </div>
  )
}
