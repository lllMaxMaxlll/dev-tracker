import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import type { UsageAggregation, UsageSource } from "@/lib/db/schema"

/**
 * Lecturas del monitor de consumo.
 *
 * Todo se agrega en SQL. Traer la serie entera a memoria para sumarla sería
 * gratis hoy, con cuatro recursos, y dejaría de serlo sin que nadie lo note.
 *
 * `value` es numeric y el driver de Postgres lo devuelve como string para no
 * perder precisión; se castea a `float8` en la consulta, igual que hace
 * `lib/ai/usage.ts` con `estimated_cost_usd`.
 */

// Cómo combinar varios días de la misma métrica. La regla la lleva cada fila en
// `aggregation`, así que la decisión vive con el dato y no en el que consulta.
const AGREGAR = sql`
  case ${sql.raw('"aggregation"')}
    when 'suma' then sum(value)
    when 'maximo' then max(value)
    else (array_agg(value order by day desc))[1]
  end
`

/**
 * `db.execute()` devuelve las filas tal como las entrega el driver, y las
 * marcas de tiempo llegan como texto en vez de como Date: a diferencia de
 * `db.select()`, no pasa por el mapeo de tipos del esquema. Sin esta
 * conversión el tipo declarado diría Date y el valor sería string, que es la
 * clase de mentira que explota lejos de acá.
 */
function comoFecha(valor: unknown): Date | null {
  if (valor === null || valor === undefined) return null

  if (valor instanceof Date) return valor

  const fecha = new Date(String(valor))

  return Number.isNaN(fecha.getTime()) ? null : fecha
}

export type RecursoConConsumo = {
  id: string
  fuente: UsageSource
  nombre: string
  organizacion: string | null
  estado: string | null
  ultimaSync: Date | null
  ultimoError: string | null
  metricas: {
    metrica: string
    unidad: string
    agregacion: UsageAggregation
    /** Último valor conocido. */
    ultimo: number
    /** Agregado del mes en curso, según la agregación de la métrica. */
    mes: number
    dia: string
  }[]
}

/**
 * Recursos con sus métricas: el último valor de cada una y el agregado del mes.
 *
 * Es la consulta que alimenta las tablas de /consumo y el comando /consumo del
 * bot, así que los dos muestran exactamente los mismos números.
 */
export async function getRecursosConConsumo(): Promise<RecursoConConsumo[]> {
  const recursos = await db.execute<{
    id: string
    fuente: UsageSource
    nombre: string
    organizacion: string | null
    estado: string | null
    ultima_sync: string | Date | null
    ultimo_error: string | null
  }>(sql`
    select id, source as fuente, name as nombre, organization as organizacion,
           status as estado, last_sync_at as ultima_sync, last_error as ultimo_error
    from monitored_resources
    where active
    order by source, name
  `)

  const metricas = await db.execute<{
    resource_id: string
    metrica: string
    unidad: string
    agregacion: UsageAggregation
    ultimo: number
    mes: number
    dia: string
  }>(sql`
    with ultimos as (
      select distinct on (resource_id, metric)
             resource_id, metric, unit, aggregation,
             value::float8 as ultimo, day
      from usage_snapshots
      order by resource_id, metric, day desc
    ),
    del_mes as (
      select resource_id, metric, (${AGREGAR})::float8 as mes
      from usage_snapshots
      where day >= date_trunc('month', current_date)::date
      group by resource_id, metric, aggregation
    )
    select u.resource_id, u.metric as metrica, u.unit as unidad,
           u.aggregation as agregacion, u.ultimo,
           coalesce(m.mes, u.ultimo) as mes, u.day::text as dia
    from ultimos u
    left join del_mes m on m.resource_id = u.resource_id and m.metric = u.metric
    order by u.metric
  `)

  const porRecurso = new Map<string, RecursoConConsumo["metricas"]>()

  for (const fila of metricas.rows) {
    const lista = porRecurso.get(fila.resource_id) ?? []

    lista.push({
      metrica: fila.metrica,
      unidad: fila.unidad,
      agregacion: fila.agregacion,
      ultimo: Number(fila.ultimo),
      mes: Number(fila.mes),
      dia: fila.dia,
    })

    porRecurso.set(fila.resource_id, lista)
  }

  return recursos.rows.map((fila) => ({
    id: fila.id,
    fuente: fila.fuente,
    nombre: fila.nombre,
    organizacion: fila.organizacion,
    estado: fila.estado,
    ultimaSync: comoFecha(fila.ultima_sync),
    ultimoError: fila.ultimo_error,
    metricas: porRecurso.get(fila.id) ?? [],
  }))
}

/**
 * Serie diaria de una o varias métricas, sumada entre recursos.
 *
 * Recibe una lista y no una sola métrica porque "peticiones a Supabase" son
 * cuatro métricas distintas que comparten unidad. Lo que NO se puede es mezclar
 * unidades: sumar bytes con peticiones daría un gráfico con forma y sin
 * significado, así que eso lo decide quien llama.
 */
export async function getSerieDiaria(
  metricas: string[],
  dias = 30
): Promise<{ dia: string; valor: number }[]> {
  if (metricas.length === 0) return []

  const resultado = await db.execute<{ dia: string; valor: number }>(sql`
    select day::text as dia, sum(value)::float8 as valor
    from usage_snapshots
    where metric in (${sql.join(
      metricas.map((m) => sql`${m}`),
      sql`, `
    )})
      and day >= current_date - ${sql.raw(String(dias))}
    group by day
    order by day
  `)

  return resultado.rows.map((fila) => ({
    dia: fila.dia,
    valor: Number(fila.valor),
  }))
}

export type EstadoFuente = {
  fuente: UsageSource
  ultimaOk: Date | null
  ultimoError: string | null
  fallando: boolean
}

/**
 * Estado de la recolección por fuente.
 *
 * Es lo que hace que la página distinga "no hay consumo" de "hace tres días que
 * no se recolecta". Sin esto, las dos cosas se ven igual: un cero.
 */
export async function getEstadoDeFuentes(): Promise<EstadoFuente[]> {
  const resultado = await db.execute<{
    fuente: UsageSource
    ultima_ok: string | Date | null
    ultimo_error: string | null
    fallando: boolean
  }>(sql`
    select source as fuente,
           max(finished_at) filter (where ok and not skipped) as ultima_ok,
           (array_agg(error order by started_at desc) filter (where not ok))[1] as ultimo_error,
           coalesce(
             (array_agg(ok order by started_at desc))[1] = false,
             false
           ) as fallando
    from sync_runs
    group by source
    order by source
  `)

  return resultado.rows.map((fila) => ({
    fuente: fila.fuente,
    ultimaOk: comoFecha(fila.ultima_ok),
    ultimoError: fila.ultimo_error,
    fallando: fila.fallando,
  }))
}

export type ReglaConEstado = {
  id: string
  fuente: UsageSource
  metrica: string
  etiqueta: string
  tipoUmbral: string
  umbral: number
  ventana: string
  activa: boolean
  silenciadaHasta: Date | null
  /**
   * Calculado con `now()` de Postgres y no en el componente: el reloj que
   * decide si una alerta está callada es el del servidor que la evalúa, y
   * además `Date.now()` durante el render no es puro.
   */
  silenciada: boolean
  ultimoDisparo: Date | null
  ultimoEstado: string | null
}

export async function getReglasConEstado(): Promise<ReglaConEstado[]> {
  const resultado = await db.execute<{
    id: string
    fuente: UsageSource
    metrica: string
    etiqueta: string
    tipo_umbral: string
    umbral: number
    ventana: string
    activa: boolean
    silenciada_hasta: string | Date | null
    silenciada: boolean
    ultimo_disparo: string | Date | null
    ultimo_estado: string | null
  }>(sql`
    select r.id, r.source as fuente, r.metric as metrica, r.label as etiqueta,
           r.threshold_kind as tipo_umbral, r.threshold::float8 as umbral,
           r.window_kind as ventana, r.active as activa,
           r.silenced_until as silenciada_hasta,
           coalesce(r.silenced_until > now(), false) as silenciada,
           e.triggered_at as ultimo_disparo, e.status::text as ultimo_estado
    from alert_rules r
    left join lateral (
      select triggered_at, status from alert_events
      where rule_id = r.id order by triggered_at desc limit 1
    ) e on true
    order by r.source, r.metric
  `)

  return resultado.rows.map((fila) => ({
    id: fila.id,
    fuente: fila.fuente,
    metrica: fila.metrica,
    etiqueta: fila.etiqueta,
    tipoUmbral: fila.tipo_umbral,
    umbral: Number(fila.umbral),
    ventana: fila.ventana,
    activa: fila.activa,
    silenciadaHasta: comoFecha(fila.silenciada_hasta),
    silenciada: fila.silenciada,
    ultimoDisparo: comoFecha(fila.ultimo_disparo),
    ultimoEstado: fila.ultimo_estado,
  }))
}

/**
 * Gasto de IA del mes, de todos los usuarios.
 *
 * `getConsumoDelMes()` de lib/ai/usage.ts responde lo mismo para un usuario;
 * acá hace falta el total de la instancia, porque lo que se compara contra el
 * saldo de OpenRouter es lo que gastó la cuenta entera, no una persona.
 */
export async function getGastoIaDelMes(): Promise<{
  costoUsd: number
  llamadas: number
  tokens: number
}> {
  const resultado = await db.execute<{
    costo_usd: number
    llamadas: number
    tokens: number
  }>(sql`
    select coalesce(sum(estimated_cost_usd), 0)::float8 as costo_usd,
           count(*)::int as llamadas,
           coalesce(sum(total_tokens), 0)::int as tokens
    from ai_usage_log
    where created_at >= date_trunc('month', now())
  `)

  const fila = resultado.rows[0]

  return {
    costoUsd: Number(fila?.costo_usd ?? 0),
    llamadas: Number(fila?.llamadas ?? 0),
    tokens: Number(fila?.tokens ?? 0),
  }
}

/** Serie diaria del gasto de IA, para el gráfico de OpenRouter. */
export async function getSerieGastoIa(
  dias = 30
): Promise<{ dia: string; valor: number }[]> {
  const resultado = await db.execute<{ dia: string; valor: number }>(sql`
    select (created_at at time zone 'utc')::date::text as dia,
           coalesce(sum(estimated_cost_usd), 0)::float8 as valor
    from ai_usage_log
    where created_at >= now() - ${sql.raw(String(dias))} * interval '1 day'
    group by 1
    order by 1
  `)

  return resultado.rows.map((fila) => ({
    dia: fila.dia,
    valor: Number(fila.valor),
  }))
}
