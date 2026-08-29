import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

/**
 * Métricas del dashboard.
 *
 * Todo se agrega en SQL, no en JavaScript: traer los problemas a memoria para
 * contarlos no escala y además desaprovecha los índices.
 *
 * Las semanas se calculan con `date_trunc('week', …)`, que en Postgres arranca
 * el lunes (semana ISO). El servidor corre en UTC, así que un problema
 * resuelto un domingo a la noche hora Argentina cuenta en la semana siguiente;
 * para un tablero personal la distorsión es irrelevante.
 */

export type ResumenMetricas = {
  abiertos: number
  resueltosEstaSemana: number
  bloqueados: number
  /** Promedio de resolución en milisegundos, o `null` si todavía no hay datos. */
  tiempoPromedioMs: number | null
  /** Cuántos problemas resueltos alimentan ese promedio. */
  muestraPromedio: number
}

export async function getResumen(userId: string): Promise<ResumenMetricas> {
  const resultado = await db.execute(sql`
    select
      count(*) filter (
        where status in ('pendiente', 'en_progreso', 'bloqueado')
      )::int as abiertos,

      count(*) filter (
        where status = 'resuelto'
          and resolved_at >= date_trunc('week', now())
      )::int as resueltos_esta_semana,

      count(*) filter (where status = 'bloqueado')::int as bloqueados,

      -- El promedio se limita a los últimos 90 días para que refleje cómo
      -- venís trabajando ahora y no quede anclado a la historia vieja.
      avg(
        extract(epoch from (resolved_at - created_at)) * 1000
      ) filter (
        where status = 'resuelto'
          and resolved_at is not null
          and resolved_at >= now() - interval '90 days'
      ) as tiempo_promedio_ms,

      count(*) filter (
        where status = 'resuelto'
          and resolved_at is not null
          and resolved_at >= now() - interval '90 days'
      )::int as muestra_promedio
    from issues
    where user_id = ${userId}
  `)

  const fila = resultado.rows[0] as
    | {
        abiertos: number
        resueltos_esta_semana: number
        bloqueados: number
        tiempo_promedio_ms: string | number | null
        muestra_promedio: number
      }
    | undefined

  return {
    abiertos: fila?.abiertos ?? 0,
    resueltosEstaSemana: fila?.resueltos_esta_semana ?? 0,
    bloqueados: fila?.bloqueados ?? 0,
    // `avg` de Postgres vuelve como numeric, que node-postgres entrega string.
    tiempoPromedioMs:
      fila?.tiempo_promedio_ms == null ? null : Number(fila.tiempo_promedio_ms),
    muestraPromedio: fila?.muestra_promedio ?? 0,
  }
}

export type PuntoSemanal = {
  semana: string
  abiertos: number
  resueltos: number
}

/**
 * Serie de 12 semanas. El `generate_series` es lo que garantiza que aparezcan
 * también las semanas sin actividad: sin él, el gráfico saltearía huecos y
 * daría una impresión falsa de continuidad.
 */
export async function getSerieSemanal(
  userId: string,
  semanas = 12
): Promise<PuntoSemanal[]> {
  const resultado = await db.execute(sql`
    with rango as (
      select generate_series(
        date_trunc('week', now()) - make_interval(weeks => ${semanas - 1}),
        date_trunc('week', now()),
        interval '1 week'
      ) as semana
    )
    select
      rango.semana::date as semana,
      count(distinct i.id) filter (
        where date_trunc('week', i.created_at) = rango.semana
      )::int as abiertos,
      count(distinct i.id) filter (
        where date_trunc('week', i.resolved_at) = rango.semana
      )::int as resueltos
    from rango
    left join issues i
      on i.user_id = ${userId}
      and (
        date_trunc('week', i.created_at) = rango.semana
        or date_trunc('week', i.resolved_at) = rango.semana
      )
    group by rango.semana
    order by rango.semana
  `)

  return (
    resultado.rows as {
      semana: string | Date
      abiertos: number
      resueltos: number
    }[]
  ).map((fila) => ({
    semana:
      fila.semana instanceof Date
        ? fila.semana.toISOString().slice(0, 10)
        : String(fila.semana),
    abiertos: fila.abiertos,
    resueltos: fila.resueltos,
  }))
}

export type Distribucion = { clave: string; etiqueta: string; total: number }

export async function getDistribucionPorTipo(
  userId: string
): Promise<Distribucion[]> {
  const resultado = await db.execute(sql`
    select type::text as clave, count(*)::int as total
    from issues
    where user_id = ${userId}
    group by type
    order by total desc
  `)

  return (resultado.rows as { clave: string; total: number }[]).map((fila) => ({
    clave: fila.clave,
    etiqueta: fila.clave,
    total: fila.total,
  }))
}

export async function getDistribucionPorProyecto(
  userId: string
): Promise<Distribucion[]> {
  const resultado = await db.execute(sql`
    select
      coalesce(p.slug, '__sin_proyecto__') as clave,
      coalesce(p.name, 'Sin proyecto') as etiqueta,
      count(*)::int as total
    from issues i
    left join projects p on p.id = i.project_id
    where i.user_id = ${userId}
    group by p.slug, p.name
    order by total desc
    limit 8
  `)

  return resultado.rows as Distribucion[]
}

/**
 * Tiempo promedio de resolución partido por tipo. No entra en las tarjetas,
 * pero es lo que alimenta los insights de la Fase 6 ("resolvés bugs tres veces
 * más rápido que features").
 */
export async function getTiempoPorTipo(userId: string) {
  const resultado = await db.execute(sql`
    select
      type::text as tipo,
      avg(extract(epoch from (resolved_at - created_at)) * 1000) as promedio_ms,
      count(*)::int as total
    from issues
    where user_id = ${userId}
      and status = 'resuelto'
      and resolved_at is not null
    group by type
    order by total desc
  `)

  return (
    resultado.rows as {
      tipo: string
      promedio_ms: string | number | null
      total: number
    }[]
  ).map((fila) => ({
    tipo: fila.tipo,
    promedioMs: fila.promedio_ms == null ? null : Number(fila.promedio_ms),
    total: fila.total,
  }))
}
