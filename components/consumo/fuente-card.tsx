import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarraCuota } from "@/components/consumo/barra-cuota"
import { definicionDe, formatearValor } from "@/lib/monitor/metrics"
import { cuotaDe } from "@/lib/monitor/quotas"
import { haceCuanto } from "@/lib/utils/fechas"
import type { EstadoFuente, RecursoConConsumo } from "@/lib/db/queries/consumo"

const TITULOS: Record<string, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  openrouter: "OpenRouter",
}

/**
 * Una tarjeta por fuente.
 *
 * Tres estados distintos y visibles: apagada (falta la credencial), fallando
 * (la última recolección dio error) y con datos. Sin esa distinción, las tres
 * situaciones se verían como un panel vacío, que es la forma más fácil de que
 * un monitor mienta.
 */
export function FuenteCard({
  fuente,
  recursos,
  estado,
  nota,
}: {
  fuente: string
  recursos: RecursoConConsumo[]
  estado?: EstadoFuente
  nota?: string
}) {
  const conDatos = recursos.filter((recurso) => recurso.metricas.length > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>{TITULOS[fuente] ?? fuente}</CardTitle>
        {estado?.ultimaOk ? (
          <span className="text-xs text-muted-foreground">
            {haceCuanto(estado.ultimaOk)}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {estado?.fallando ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            La última recolección falló: {estado.ultimoError ?? "sin detalle"}
          </p>
        ) : null}

        {!estado ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se recolectó nada de esta fuente. Si falta la credencial,
            cargala en las variables de entorno.
          </p>
        ) : conDatos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin métricas registradas.
          </p>
        ) : (
          conDatos.map((recurso) => (
            <RecursoBloque key={recurso.id} recurso={recurso} />
          ))
        )}

        {nota ? (
          <p className="border-t pt-3 text-xs text-muted-foreground">{nota}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RecursoBloque({ recurso }: { recurso: RecursoConConsumo }) {
  const pausado = Boolean(
    recurso.fuente === "supabase" &&
    recurso.estado &&
    recurso.estado !== "ACTIVE_HEALTHY"
  )

  // Las métricas que sólo existen para servir de tope no se listan solas: ya
  // aparecen como denominador de la barra a la que pertenecen.
  const topes = new Set(
    recurso.metricas
      .map((metrica) => cuotaDe(metrica.metrica))
      .filter((cuota) => cuota?.tipo === "derivada")
      .map((cuota) => (cuota?.tipo === "derivada" ? cuota.metrica : ""))
  )

  const visibles = recurso.metricas.filter(
    (metrica) => !topes.has(metrica.metrica)
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{recurso.nombre}</span>
        {pausado ? <Badge variant="destructive">{recurso.estado}</Badge> : null}
        {recurso.organizacion ? (
          <span className="text-xs text-muted-foreground">
            {recurso.organizacion}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 pl-1">
        {visibles.map((metrica) => {
          const definicion = definicionDe(metrica.metrica)
          const cuota = cuotaDe(metrica.metrica)

          const tope =
            cuota?.tipo === "derivada"
              ? recurso.metricas.find((otra) => otra.metrica === cuota.metrica)
                  ?.ultimo
              : cuota?.tipo === "fija"
                ? cuota.valor
                : undefined

          // `project_paused` ya se muestra como badge arriba; repetirlo como
          // "Proyecto pausado: no" sería ruido.
          if (metrica.metrica === "supabase.project_paused") return null

          return (
            <BarraCuota
              key={metrica.metrica}
              etiqueta={definicion.etiqueta}
              valor={metrica.mes}
              tope={tope}
              unidad={definicion.unidad}
            />
          )
        })}
      </div>
    </div>
  )
}

/** Total de una métrica entre todos los recursos, para las tarjetas de arriba. */
export function totalDe(recursos: RecursoConConsumo[], metrica: string) {
  const definicion = definicionDe(metrica)

  const total = recursos.reduce((suma, recurso) => {
    const encontrada = recurso.metricas.find((m) => m.metrica === metrica)

    return suma + (encontrada?.mes ?? 0)
  }, 0)

  return { total, texto: formatearValor(total, definicion.unidad) }
}
