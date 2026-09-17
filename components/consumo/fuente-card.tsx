import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarraCuota } from "@/components/consumo/barra-cuota"
import { definicionDe, formatearValor } from "@/lib/monitor/metrics"
import { haceCuanto } from "@/lib/utils/fechas"
import type { EstadoFuente, RecursoConConsumo } from "@/lib/db/queries/consumo"

const TITULOS: Record<string, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  openrouter: "OpenRouter",
}

/**
 * Por qué una métrica no tiene barra.
 *
 * Decirlo es la mitad del valor: "sin tope" y "no pudimos leer el tope" son
 * cosas distintas, y ninguna de las dos es "estás al 0 %".
 */
const SIN_TOPE: Record<string, string> = {
  "supabase.db_size_bytes":
    "El plan Pro factura disco aprovisionado, no tamaño de base",
  "supabase.disk_used_bytes":
    "Se compara contra el disco aprovisionado del proyecto",
  "supabase.rest_requests": "Ilimitadas en todos los planes",
  "supabase.auth_requests": "Ilimitadas en todos los planes",
  "supabase.storage_requests": "Ilimitadas en todos los planes",
  "supabase.realtime_requests": "Ilimitadas en todos los planes",
  "vercel.deployments": "El plan no pone un tope de despliegues",
  "openrouter.usage_monthly_usd": "Sin tope: se gasta lo que se carga",
  "openrouter.credits_remaining_usd": "Saldo disponible, no un consumo",
}

/**
 * Una tarjeta por fuente.
 *
 * Tres estados distintos y visibles: apagada (falta la credencial), fallando
 * (la última recolección dio error) y con datos. Sin esa distinción, las tres
 * situaciones se ven como un panel vacío, que es la forma más fácil de que un
 * monitor mienta.
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

  const excedenteTotal = conDatos.reduce(
    (total, recurso) =>
      total +
      recurso.metricas.reduce(
        (suma, metrica) => suma + (metrica.excedente?.costoUsd ?? 0),
        0
      ),
    0
  )

  const enVista = conDatos[0]?.planDeVista
  const real = conDatos[0]?.plan
  const simulado = Boolean(enVista && real && enVista !== real)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle>{TITULOS[fuente] ?? fuente}</CardTitle>
          {enVista ? (
            <Badge variant={simulado ? "outline" : "secondary"}>
              {enVista}
              {simulado ? " (simulado)" : ""}
            </Badge>
          ) : null}
        </div>
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

        {simulado ? (
          <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
            Estás mirando las cuotas del plan <strong>{enVista}</strong>, pero
            la cuenta está en <strong>{real}</strong>. Las alertas se siguen
            evaluando contra el plan real.
          </p>
        ) : null}

        {excedenteTotal > 0 ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm">
            <strong className="text-destructive">
              {formatearValor(excedenteTotal, "usd")}
            </strong>{" "}
            <span className="text-muted-foreground">
              de excedente acumulado este mes
            </span>
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

  const visibles = recurso.metricas.filter(
    (metrica) =>
      // Las que sólo son el denominador de otra ya aparecen dentro de su barra.
      !metrica.soloTope &&
      // `project_paused` se muestra como badge arriba; repetirlo como
      // "Proyecto pausado: no" sería ruido.
      metrica.metrica !== "supabase.project_paused"
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

      <div className="flex flex-col gap-2.5 pl-1">
        {visibles.map((metrica) => {
          const definicion = definicionDe(metrica.metrica)

          return (
            <BarraCuota
              key={metrica.metrica}
              etiqueta={definicion.etiqueta}
              valor={metrica.mes}
              tope={metrica.tope}
              excedente={metrica.excedente}
              unidad={definicion.unidad}
              motivoSinTope={SIN_TOPE[metrica.metrica]}
            />
          )
        })}
      </div>
    </div>
  )
}
