import type { UsageAggregation, UsageSource } from "@/lib/db/schema"

/**
 * Una medición de un día para un recurso.
 *
 * ⚠️ INVARIANTE DEL SISTEMA: `valor` es siempre el valor ABSOLUTO del día,
 * nunca un incremento respecto de la lectura anterior.
 *
 * De esto depende que el cron sea idempotente. La recolección corre cada hora
 * y hace UPSERT sobre (resource_id, metric, day): con valores absolutos, correr
 * una vez o veinte deja exactamente la misma fila. Un colector que devolviera
 * deltas los duplicaría en cada corrida — y el bug sería silencioso, porque los
 * números seguirían pareciendo plausibles.
 *
 * Si una API sólo expone acumulados desde el inicio del ciclo, el colector
 * tiene que convertirlos antes de devolverlos, no después.
 */
export type Medicion = {
  /** Clave del catálogo de `lib/monitor/metrics.ts`. */
  metrica: string
  /** Día en UTC, formato ISO corto (`2026-09-17`). */
  dia: string
  valor: number
  unidad: string
  agregacion: UsageAggregation
}

/** Un recurso descubierto: un proyecto, o la cuenta entera. */
export type RecursoDescubierto = {
  fuente: UsageSource
  /** projectId de Vercel, ref de Supabase, o "cuenta". */
  idExterno: string
  nombre: string
  organizacion?: string
  /** Tal como lo devuelve el proveedor. */
  estado?: string
  metadata?: Record<string, unknown>
}

/** Mediciones de un recurso, ya emparejadas con él. */
export type MedicionesDeRecurso = {
  recurso: RecursoDescubierto
  mediciones: Medicion[]
}

export type ResultadoColector = {
  datos: MedicionesDeRecurso[]
  /**
   * Cosas que salieron raro pero no justifican tirar la corrida: una unidad
   * que el mapeo no reconoce, un proyecto que dio 429. Se devuelven en vez de
   * loguearse a la nada para que aparezcan en la respuesta del cron.
   */
  avisos: string[]
  /**
   * La corrida se quedó sin presupuesto de tiempo y devolvió lo que alcanzó a
   * juntar. Un resultado parcial es mejor que ninguno, pero conviene saberlo.
   */
  parcial?: boolean
}

export interface Colector {
  fuente: UsageSource
  nombre: string
  /**
   * Cada cuánto tiene sentido volver a pedir los datos.
   *
   * El cron corre cada hora y dispara todos los colectores, pero pedirle a
   * Vercel un dato de granularidad diaria veinticuatro veces por día devuelve
   * lo mismo veinticuatro veces, gasta rate limit y gasta tiempo de función.
   * Cada colector decide si le toca.
   */
  cadenciaMinutos: number
  /** `true` si la fuente no tiene credenciales configuradas. */
  apagado(): boolean
  recolectar(señal: AbortSignal): Promise<ResultadoColector>
}
