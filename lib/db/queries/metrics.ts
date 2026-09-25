import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { msLaborales } from "@/lib/utils/horario-laboral"

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
  enProgreso: number
  /**
   * Promedio de resolución en milisegundos de jornada laboral, o `null` si
   * todavía no hay datos. No es tiempo de reloj: ver lib/utils/horario-laboral.
   */
  tiempoPromedioMs: number | null
  /** Cuántos problemas resueltos alimentan ese promedio. */
  muestraPromedio: number
}

export async function getResumen(userId: string): Promise<ResumenMetricas> {
  const resultado = await db.execute(sql`
    select
      count(*) filter (
        where status in ('pendiente', 'en_progreso')
      )::int as abiertos,

      count(*) filter (
        where status = 'resuelto'
          and resolved_at >= date_trunc('week', now())
      )::int as resueltos_esta_semana,

      count(*) filter (where status = 'en_progreso')::int as en_progreso
    from issues
    where user_id = ${userId}
  `)

  // El promedio es la excepción a la regla de agregar todo en SQL: se mide en
  // horas de jornada, y eso necesita la zona horaria del usuario y el calendario
  // de la semana. Hacerlo en SQL sería un generate_series por problema; en
  // JavaScript es una función pura que se puede leer y probar. La muestra está
  // acotada a 90 días, así que son unas decenas de filas.
  const resueltos = await db.execute(sql`
    select created_at, resolved_at
    from issues
    where user_id = ${userId}
      and status = 'resuelto'
      and resolved_at is not null
      and resolved_at >= now() - interval '90 days'
  `)

  const duraciones = (
    resueltos.rows as { created_at: Date; resolved_at: Date }[]
  ).map((fila) =>
    msLaborales(new Date(fila.created_at), new Date(fila.resolved_at))
  )

  const fila = resultado.rows[0] as
    | {
        abiertos: number
        resueltos_esta_semana: number
        en_progreso: number
      }
    | undefined

  return {
    abiertos: fila?.abiertos ?? 0,
    resueltosEstaSemana: fila?.resueltos_esta_semana ?? 0,
    enProgreso: fila?.en_progreso ?? 0,
    tiempoPromedioMs: duraciones.length
      ? duraciones.reduce((total, ms) => total + ms, 0) / duraciones.length
      : null,
    muestraPromedio: duraciones.length,
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
 * Problemas por área, para saber qué parte de un proyecto da más trabajo.
 *
 * Sólo cuenta los que tienen área: "sin área" sería casi siempre la barra más
 * larga —es lo que traen los problemas viejos y los que se cargan a las
 * apuradas— y taparía justamente la comparación que el gráfico viene a hacer.
 *
 * El nombre del proyecto viaja aparte porque dos proyectos pueden tener un área
 * con el mismo nombre; quien dibuja decide si hace falta aclararlo.
 */
export async function getDistribucionPorArea(userId: string): Promise<
  (Distribucion & {
    proyecto: string
    color: string | null
  })[]
> {
  const resultado = await db.execute(sql`
    select
      a.id::text as clave,
      a.name as etiqueta,
      p.name as proyecto,
      a.color as color,
      count(*)::int as total
    from issues i
    join project_areas a on a.id = i.area_id
    join projects p on p.id = a.project_id
    where i.user_id = ${userId}
    group by a.id, a.name, p.name, a.color
    order by total desc
    limit 8
  `)

  return resultado.rows as (Distribucion & {
    proyecto: string
    color: string | null
  })[]
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
