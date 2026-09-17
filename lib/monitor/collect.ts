import "server-only"

import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  monitoredResources,
  syncRuns,
  usageSnapshots,
  type UsageSource,
} from "@/lib/db/schema"
import { describirError, esErrorMonitor } from "@/lib/monitor/errors"
import { colectorOpenRouter } from "@/lib/monitor/openrouter"
import { colectorSupabase } from "@/lib/monitor/supabase-mgmt"
import { colectorVercel } from "@/lib/monitor/vercel"
import type {
  Colector,
  Medicion,
  MedicionesDeRecurso,
} from "@/lib/monitor/types"

/**
 * Orquestador de la recolección.
 *
 * Reglas de la casa, todas por el mismo motivo —que el monitor tiene que
 * seguir sirviendo cuando algo se rompe, que es justo cuando más se lo mira:
 *
 *   • El fallo de una fuente nunca tumba a las otras.
 *   • Cada corrida deja rastro en `sync_runs`, salga bien o mal. Sin eso, "no
 *     hay datos nuevos" y "hace tres días que no corre" se ven igual.
 *   • Todo es idempotente: los snapshots se upsertean por
 *     (recurso, métrica, día), así que correr veinte veces deja lo mismo que
 *     correr una.
 */
const COLECTORES: Colector[] = [
  colectorVercel,
  colectorSupabase,
  colectorOpenRouter,
]

/**
 * Presupuesto de tiempo de toda la corrida.
 *
 * Vercel Hobby corta las funciones a los 60 s. Apuntamos a 50 para que el
 * handler alcance a escribir `sync_runs` y a devolver el resumen: una corrida
 * que se muere sin dejar rastro es peor que una corrida parcial.
 */
const PRESUPUESTO_MS = 50_000

export type ResumenFuente = {
  fuente: UsageSource
  ok: boolean
  saltada: boolean
  recursos: number
  filas: number
  avisos: string[]
  error?: string
}

export async function recolectarTodo(opciones?: {
  forzar?: boolean
}): Promise<ResumenFuente[]> {
  const limite = AbortSignal.timeout(PRESUPUESTO_MS)

  const resumenes: ResumenFuente[] = []

  // En serie y no en paralelo: los tres colectores comparten el mismo
  // presupuesto de tiempo y el mismo pool de conexiones, y en Hobby el
  // paralelismo entre fuentes sólo adelanta el momento de chocar con el
  // timeout. El paralelismo que sí importa es el de adentro de Supabase.
  for (const colector of COLECTORES) {
    resumenes.push(await correrColector(colector, limite, opciones?.forzar))
  }

  return resumenes
}

async function correrColector(
  colector: Colector,
  señal: AbortSignal,
  forzar?: boolean
): Promise<ResumenFuente> {
  const base = {
    fuente: colector.fuente,
    recursos: 0,
    filas: 0,
    avisos: [] as string[],
  }

  if (colector.apagado()) {
    // Una fuente sin credencial no es un fallo de la corrida: es una fuente
    // apagada. Se registra como saltada para que la UI pueda decir "falta
    // configurar" en vez de "falló".
    await registrarCorrida(colector.fuente, {
      ok: true,
      saltada: true,
      error: "sin credencial configurada",
    })

    return { ...base, ok: true, saltada: true, error: "sin credencial" }
  }

  if (!forzar && (await esReciente(colector))) {
    return { ...base, ok: true, saltada: true }
  }

  const comienzo = new Date()

  try {
    const resultado = await colector.recolectar(señal)

    let filas = 0

    for (const entrada of resultado.datos) {
      filas += await guardar(entrada)
    }

    await registrarCorrida(colector.fuente, {
      ok: true,
      saltada: false,
      comienzo,
      recursos: resultado.datos.length,
      filas,
    })

    return {
      ...base,
      ok: true,
      saltada: false,
      recursos: resultado.datos.length,
      filas,
      avisos: resultado.avisos,
    }
  } catch (error) {
    const mensaje = describirError(error)

    console.error(`[monitor/${colector.fuente}]`, error)

    await registrarCorrida(colector.fuente, {
      ok: false,
      saltada: false,
      comienzo,
      error: mensaje,
    })

    await db
      .update(monitoredResources)
      .set({ lastSyncOk: false, lastError: mensaje })
      .where(eq(monitoredResources.source, colector.fuente))

    return {
      ...base,
      ok: false,
      saltada: false,
      error: mensaje,
      avisos: esErrorMonitor(error) ? [`código ${error.codigo}`] : [],
    }
  }
}

/**
 * ¿Ya se recolectó esta fuente hace menos que su cadencia?
 *
 * El cron corre cada hora y dispara los tres colectores, pero pedirle a Vercel
 * un dato de granularidad diaria veinticuatro veces por día devuelve lo mismo
 * veinticuatro veces y gasta rate limit y segundos de función. Cada colector
 * decide si le toca.
 */
async function esReciente(colector: Colector): Promise<boolean> {
  const [ultima] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.source, colector.fuente), eq(syncRuns.ok, true)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  if (!ultima?.finishedAt) return false

  const minutos = (Date.now() - ultima.finishedAt.getTime()) / 60_000

  return minutos < colector.cadenciaMinutos
}

/** Upsert del recurso y de sus mediciones. Devuelve cuántas filas se tocaron. */
async function guardar(entrada: MedicionesDeRecurso): Promise<number> {
  const ahora = new Date()

  const [recurso] = await db
    .insert(monitoredResources)
    .values({
      source: entrada.recurso.fuente,
      externalId: entrada.recurso.idExterno,
      name: entrada.recurso.nombre,
      organization: entrada.recurso.organizacion ?? null,
      status: entrada.recurso.estado ?? null,
      metadata: entrada.recurso.metadata ?? null,
      lastSyncAt: ahora,
      lastSyncOk: true,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [monitoredResources.source, monitoredResources.externalId],
      set: {
        name: entrada.recurso.nombre,
        organization: entrada.recurso.organizacion ?? null,
        status: entrada.recurso.estado ?? null,
        metadata: entrada.recurso.metadata ?? null,
        lastSyncAt: ahora,
        lastSyncOk: true,
        lastError: null,
        updatedAt: ahora,
      },
    })
    .returning({ id: monitoredResources.id })

  if (!recurso || entrada.mediciones.length === 0) return 0

  const mediciones = consolidar(entrada.mediciones)

  await db
    .insert(usageSnapshots)
    .values(
      mediciones.map((medicion) => ({
        resourceId: recurso.id,
        metric: medicion.metrica,
        day: medicion.dia,
        // numeric se manda como string: en JS un bigint de bytes pasado por
        // float pierde precisión antes de llegar a Postgres.
        value: medicion.valor.toFixed(6),
        unit: medicion.unidad,
        aggregation: medicion.agregacion,
        updatedAt: ahora,
      }))
    )
    .onConflictDoUpdate({
      target: [
        usageSnapshots.resourceId,
        usageSnapshots.metric,
        usageSnapshots.day,
      ],
      // Se pisa, no se suma. El colector ya devuelve el total absoluto del día
      // (ver el invariante en types.ts); sumar acá duplicaría en cada corrida.
      set: {
        value: sql`excluded.value`,
        unit: sql`excluded.unit`,
        aggregation: sql`excluded.aggregation`,
        updatedAt: ahora,
      },
    })

  return mediciones.length
}

/**
 * Colapsa las mediciones repetidas de (métrica, día) antes de insertar.
 *
 * Postgres rechaza un INSERT ... ON CONFLICT DO UPDATE cuando el mismo lote
 * trae dos filas que chocan con la misma clave: "command cannot affect row a
 * second time". Y pasa de verdad — el endpoint de peticiones de Supabase
 * devuelve buckets horarios si se le pide una ventana corta, y varios caen en
 * el mismo día.
 *
 * Se colapsa según la agregación de la propia medición, que es la misma regla
 * que usa el evaluador al mirar varios días.
 */
function consolidar(mediciones: Medicion[]): Medicion[] {
  const porClave = new Map<string, Medicion>()

  for (const medicion of mediciones) {
    const clave = `${medicion.metrica}:${medicion.dia}`
    const previa = porClave.get(clave)

    if (!previa) {
      porClave.set(clave, { ...medicion })

      continue
    }

    switch (medicion.agregacion) {
      case "suma":
        previa.valor += medicion.valor
        break
      case "maximo":
        previa.valor = Math.max(previa.valor, medicion.valor)
        break
      case "ultimo":
        previa.valor = medicion.valor
        break
    }
  }

  return [...porClave.values()]
}

async function registrarCorrida(
  fuente: UsageSource,
  datos: {
    ok: boolean
    saltada: boolean
    comienzo?: Date
    recursos?: number
    filas?: number
    error?: string
  }
) {
  try {
    await db.insert(syncRuns).values({
      source: fuente,
      startedAt: datos.comienzo ?? new Date(),
      finishedAt: new Date(),
      ok: datos.ok,
      skipped: datos.saltada,
      resources: datos.recursos ?? 0,
      rowsWritten: datos.filas ?? 0,
      error: datos.error ?? null,
    })
  } catch (error) {
    // Si ni el registro de la corrida se puede escribir, la base es el
    // problema; no tiene sentido hacer fallar la recolección por eso.
    console.error("[monitor] no se pudo registrar la corrida", error)
  }
}

/**
 * Poda. La llama el cron semanal, aprovechando que ya pasa por ahí.
 *
 * Un monitor de cuota de disco que llena el disco de 500 MB del plan Free sería
 * un chiste, así que la serie tiene techo por diseño.
 */
export async function podarHistorico() {
  await db.execute(
    sql`delete from ${usageSnapshots} where ${usageSnapshots.day} < current_date - interval '400 days'`
  )

  await db.execute(
    sql`delete from ${syncRuns} where ${syncRuns.startedAt} < now() - interval '90 days'`
  )
}
