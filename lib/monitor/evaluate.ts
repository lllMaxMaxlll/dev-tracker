import "server-only"

import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  alertEvents,
  alertRules,
  monitoredResources,
  syncRuns,
  usageSnapshots,
  type AlertRule,
} from "@/lib/db/schema"
import { definicionDe, formatearValor } from "@/lib/monitor/metrics"
import { resolverCuota } from "@/lib/monitor/quotas"
import { enviarMensaje } from "@/lib/telegram/client"
import { escaparHtml, negrita } from "@/lib/telegram/format"

/**
 * Evaluación de las reglas de alerta.
 *
 * Dos decisiones que sostienen todo lo demás:
 *
 * 1. El candado contra el spam es la base, no una variable en memoria. Cada
 *    disparo intenta insertar en `alert_events` una fila con clave
 *    (regla, período+recurso); si el UNIQUE la rechaza, ya se avisó y no se
 *    vuelve a avisar. El cron corre cada hora y esto es lo que hace que la
 *    misma alerta no llegue veinticuatro veces.
 *
 * 2. La fila nace `pendiente` y pasa a `enviada` sólo cuando Telegram la
 *    aceptó. Si se insertara ya como enviada y el envío fallara, el mismo
 *    UNIQUE que evita el spam impediría reintentar en todo el período: la
 *    alerta se perdería en silencio, que es lo único que un monitor no puede
 *    permitirse.
 */
export type ResultadoEvaluacion = {
  evaluadas: number
  disparadas: number
  enviadas: number
  pendientes: number
  reintentadas: number
}

export async function evaluarReglas(): Promise<ResultadoEvaluacion> {
  const resultado: ResultadoEvaluacion = {
    evaluadas: 0,
    disparadas: 0,
    enviadas: 0,
    pendientes: 0,
    reintentadas: 0,
  }

  // Primero los pendientes: son alertas que ya se decidieron y no llegaron.
  // Van antes que la evaluación nueva porque son las más viejas.
  resultado.reintentadas = await reintentarPendientes()

  const ahora = new Date()

  const reglas = await db
    .select()
    .from(alertRules)
    .where(
      and(
        eq(alertRules.active, true),
        or(
          isNull(alertRules.silencedUntil),
          sql`${alertRules.silencedUntil} <= ${ahora}`
        )
      )
    )

  for (const regla of reglas) {
    resultado.evaluadas += 1

    const disparos = await evaluarRegla(regla)

    for (const disparo of disparos) {
      resultado.disparadas += 1

      const creado = await registrarDisparo(regla, disparo)

      if (!creado) continue

      const envio = await enviarMensaje(disparo.mensaje)

      if (envio.enviado) {
        resultado.enviadas += 1

        await db
          .update(alertEvents)
          .set({ status: "enviada", sentAt: new Date() })
          .where(eq(alertEvents.id, creado))
      } else {
        resultado.pendientes += 1
      }
    }
  }

  return resultado
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluación
// ─────────────────────────────────────────────────────────────────────────────
type Disparo = {
  clavePeriodo: string
  valor: number
  umbral: number
  mensaje: string
}

async function evaluarRegla(regla: AlertRule): Promise<Disparo[]> {
  if (regla.metric.startsWith("monitor.")) {
    return await evaluarAntiguedad(regla)
  }

  const desde = inicioDeVentana(regla)
  const periodo = clavePeriodo(regla)

  const valores = await agregarPorRecurso(regla.metric, desde, regla.resourceId)

  if (valores.size === 0) return []

  const umbralPorRecurso = await resolverUmbrales(regla, [...valores.keys()])
  const nombres = await nombresDeRecursos([...valores.keys()])

  const disparos: Disparo[] = []

  for (const [recursoId, valor] of valores) {
    const umbral = umbralPorRecurso.get(recursoId)

    // Sin umbral resoluble no hay comparación posible: pasa con
    // `porcentaje_cuota` cuando el proveedor todavía no informó el tope. Callar
    // es correcto; alertar con una cuota inventada, no.
    if (umbral === undefined) continue

    if (valor < umbral) continue

    disparos.push({
      clavePeriodo: `${periodo}:${recursoId}`,
      valor,
      umbral,
      mensaje: redactar(regla, nombres.get(recursoId) ?? "?", valor, umbral),
    })
  }

  return disparos
}

/**
 * La regla que vigila al vigilante.
 *
 * No se puede resolver leyendo snapshots: si la recolección muere, nadie
 * escribe la fila que delataría que murió. Se calcula contra `sync_runs`, y por
 * eso el cron diario de Vercel es imprescindible aunque el reloj real sea el de
 * GitHub Actions — es el que sigue corriendo para dar la mala noticia.
 */
async function evaluarAntiguedad(regla: AlertRule): Promise<Disparo[]> {
  const [ultima] = await db
    .select({ finishedAt: syncRuns.finishedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.ok, true), eq(syncRuns.skipped, false)))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1)

  // Nunca corrió nada: no hay de qué alertar todavía, y avisar en la primera
  // instalación sería ruido.
  if (!ultima?.finishedAt) return []

  const horas = (Date.now() - ultima.finishedAt.getTime()) / 3_600_000
  const umbral = Number(regla.threshold)

  if (horas < umbral) return []

  return [
    {
      clavePeriodo: `${clavePeriodo(regla)}:monitor`,
      valor: horas,
      umbral,
      mensaje: [
        `⚠️ ${negrita(regla.label)}`,
        "",
        `Última recolección exitosa: hace ${formatearValor(horas, "horas")}.`,
        `Umbral: ${formatearValor(umbral, "horas")}.`,
        "",
        escaparHtml(
          "Probablemente se cortó el workflow horario de GitHub Actions. Los números de /consumo están viejos."
        ),
      ].join("\n"),
    },
  ]
}

/** Agrega los snapshots del período según la agregación de cada métrica. */
async function agregarPorRecurso(
  metrica: string,
  desde: string,
  recursoId: string | null
): Promise<Map<string, number>> {
  const filas = await db
    .select({
      recursoId: usageSnapshots.resourceId,
      dia: usageSnapshots.day,
      valor: sql<number>`${usageSnapshots.value}::float8`,
      agregacion: usageSnapshots.aggregation,
    })
    .from(usageSnapshots)
    .where(
      and(
        eq(usageSnapshots.metric, metrica),
        gte(usageSnapshots.day, desde),
        recursoId ? eq(usageSnapshots.resourceId, recursoId) : undefined
      )
    )
    .orderBy(usageSnapshots.day)

  const acumulado = new Map<string, number>()

  for (const fila of filas) {
    const previo = acumulado.get(fila.recursoId)

    if (previo === undefined) {
      acumulado.set(fila.recursoId, fila.valor)

      continue
    }

    switch (fila.agregacion) {
      case "suma":
        acumulado.set(fila.recursoId, previo + fila.valor)
        break
      case "maximo":
        acumulado.set(fila.recursoId, Math.max(previo, fila.valor))
        break
      case "ultimo":
        // Las filas vienen ordenadas por día, así que la última gana.
        acumulado.set(fila.recursoId, fila.valor)
        break
    }
  }

  return acumulado
}

/**
 * Umbral efectivo por recurso.
 *
 * Con `porcentaje_cuota` el umbral depende del recurso: el disco de un proyecto
 * no es el de otro, y el tope lo informa el propio proveedor en otra métrica.
 */
async function resolverUmbrales(
  regla: AlertRule,
  recursos: string[]
): Promise<Map<string, number>> {
  const umbral = Number(regla.threshold)
  const mapa = new Map<string, number>()

  if (regla.thresholdKind === "absoluto") {
    for (const recurso of recursos) mapa.set(recurso, umbral)

    return mapa
  }

  const topes = await ultimosValores(recursos)

  for (const recurso of recursos) {
    const cuota = resolverCuota(regla.metric, (clave) =>
      topes.get(`${recurso}:${clave}`)
    )

    if (cuota === undefined) continue

    mapa.set(recurso, (cuota * umbral) / 100)
  }

  return mapa
}

/** Último valor de cada métrica de cada recurso, para resolver cuotas. */
async function ultimosValores(
  recursos: string[]
): Promise<Map<string, number>> {
  if (recursos.length === 0) return new Map()

  const filas = await db
    .select({
      recursoId: usageSnapshots.resourceId,
      metrica: usageSnapshots.metric,
      valor: sql<number>`${usageSnapshots.value}::float8`,
    })
    .from(usageSnapshots)
    .where(inArray(usageSnapshots.resourceId, recursos))
    .orderBy(usageSnapshots.day)

  const mapa = new Map<string, number>()

  for (const fila of filas) {
    mapa.set(`${fila.recursoId}:${fila.metrica}`, fila.valor)
  }

  return mapa
}

async function nombresDeRecursos(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()

  const filas = await db
    .select({ id: monitoredResources.id, nombre: monitoredResources.name })
    .from(monitoredResources)
    .where(inArray(monitoredResources.id, ids))

  return new Map(filas.map((fila) => [fila.id, fila.nombre]))
}

// ─────────────────────────────────────────────────────────────────────────────
// Períodos y redacción
// ─────────────────────────────────────────────────────────────────────────────
function inicioDeVentana(regla: AlertRule): string {
  const ahora = new Date()

  if (regla.windowKind === "dia") return ahora.toISOString().slice(0, 10)

  return `${ahora.toISOString().slice(0, 7)}-01`
}

function clavePeriodo(regla: AlertRule): string {
  const ahora = new Date().toISOString()

  return regla.windowKind === "dia" ? ahora.slice(0, 10) : ahora.slice(0, 7)
}

function redactar(
  regla: AlertRule,
  recurso: string,
  valor: number,
  umbral: number
): string {
  const definicion = definicionDe(regla.metric)
  const ventana = regla.windowKind === "dia" ? "hoy" : "en el mes"

  const lineas = [
    `⚠️ ${negrita(regla.label)}`,
    "",
    `Recurso: ${escaparHtml(recurso)}`,
    `${escaparHtml(definicion.etiqueta)} ${ventana}: ${escaparHtml(formatearValor(valor, definicion.unidad))}`,
    `Umbral: ${escaparHtml(formatearValor(umbral, definicion.unidad))}`,
  ]

  if (regla.thresholdKind === "porcentaje_cuota") {
    lineas.push(
      `Equivale al ${escaparHtml(String(Number(regla.threshold)))} % de la cuota.`
    )
  }

  return lineas.join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistencia de los disparos
// ─────────────────────────────────────────────────────────────────────────────
/** Devuelve el id si creó la fila; null si ya se había avisado este período. */
async function registrarDisparo(
  regla: AlertRule,
  disparo: Disparo
): Promise<string | null> {
  const [fila] = await db
    .insert(alertEvents)
    .values({
      ruleId: regla.id,
      periodKey: disparo.clavePeriodo,
      value: disparo.valor.toFixed(6),
      threshold: disparo.umbral.toFixed(6),
      message: disparo.mensaje,
      status: "pendiente",
      attempts: 1,
    })
    .onConflictDoNothing({
      target: [alertEvents.ruleId, alertEvents.periodKey],
    })
    .returning({ id: alertEvents.id })

  return fila?.id ?? null
}

/**
 * Cuántas veces se reintenta un envío antes de darlo por perdido.
 *
 * Con el cron horario, cinco intentos son cinco horas: suficiente para una
 * caída pasajera de Telegram, y poco para que un token mal cargado quede
 * reintentando para siempre.
 */
const INTENTOS_MAXIMOS = 5

async function reintentarPendientes(): Promise<number> {
  const pendientes = await db
    .select()
    .from(alertEvents)
    .where(
      and(
        eq(alertEvents.status, "pendiente"),
        sql`${alertEvents.attempts} < ${INTENTOS_MAXIMOS}`
      )
    )
    .limit(20)

  let enviados = 0

  for (const evento of pendientes) {
    const envio = await enviarMensaje(evento.message)

    if (envio.enviado) {
      enviados += 1

      await db
        .update(alertEvents)
        .set({ status: "enviada", sentAt: new Date() })
        .where(eq(alertEvents.id, evento.id))

      continue
    }

    const intentos = evento.attempts + 1

    await db
      .update(alertEvents)
      .set({
        attempts: intentos,
        // `fallida` es terminal: deja de reintentar, pero la alerta sigue
        // visible en /consumo. Que no haya llegado al teléfono no significa
        // que no haya pasado.
        status: intentos >= INTENTOS_MAXIMOS ? "fallida" : "pendiente",
      })
      .where(eq(alertEvents.id, evento.id))
  }

  return enviados
}
