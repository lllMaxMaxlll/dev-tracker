import "server-only"

import { and, eq, gte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { aiUsageLog, type AiTaskKind } from "@/lib/db/schema"
import { getModelo } from "@/lib/ai/models"

/** Lo que devuelve Workers AI en `usage`. */
export type ConsumoCrudo = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  neurons?: number
}

/**
 * Costo en dólares a partir de los tokens y el precio del catálogo.
 *
 * Se calcula con los precios por millón de tokens en vez de convertir Neurons,
 * porque el catálogo publica el precio en USD directamente y así el número
 * coincide con lo que factura Cloudflare.
 */
async function costoUsd(
  modelo: string,
  consumo: ConsumoCrudo
): Promise<number | null> {
  const info = await getModelo(modelo)

  if (!info?.precioEntradaUsd || !info?.precioSalidaUsd) {
    return null
  }

  const entrada =
    ((consumo.prompt_tokens ?? 0) / 1_000_000) * info.precioEntradaUsd
  const salida =
    ((consumo.completion_tokens ?? 0) / 1_000_000) * info.precioSalidaUsd

  return entrada + salida
}

/**
 * Registra una llamada. Se invoca **también cuando falla**: sin los fallos, el
 * panel de consumo daría una idea equivocada de cuánto se está usando la IA.
 */
export async function registrarUso(params: {
  userId: string
  tarea: AiTaskKind
  modelo: string
  consumo?: ConsumoCrudo
  latenciaMs: number
  exito: boolean
  error?: string
}) {
  const consumo = params.consumo ?? {}

  try {
    await db.insert(aiUsageLog).values({
      userId: params.userId,
      task: params.tarea,
      provider: "workers-ai",
      model: params.modelo,
      promptTokens: consumo.prompt_tokens ?? 0,
      completionTokens: consumo.completion_tokens ?? 0,
      totalTokens: consumo.total_tokens ?? 0,
      neurons: consumo.neurons ?? null,
      estimatedCostUsd: params.exito
        ? ((await costoUsd(params.modelo, consumo))?.toFixed(6) ?? null)
        : null,
      latencyMs: params.latenciaMs,
      success: params.exito,
      errorMessage: params.error ?? null,
    })
  } catch (error) {
    // Que falle el registro no debe tumbar la operación que el usuario pidió.
    console.error("[registrarUso] no se pudo registrar la llamada", error)
  }
}

export type ResumenConsumo = {
  tarea: string
  modelo: string
  llamadas: number
  fallidas: number
  tokensEntrada: number
  tokensSalida: number
  neurons: number
  costoUsd: number
}

/** Consumo agregado del mes en curso, por tarea y por modelo. */
export async function getConsumoDelMes(
  userId: string
): Promise<ResumenConsumo[]> {
  const inicioDeMes = new Date()
  inicioDeMes.setDate(1)
  inicioDeMes.setHours(0, 0, 0, 0)

  const filas = await db
    .select({
      tarea: aiUsageLog.task,
      modelo: aiUsageLog.model,
      llamadas: sql<number>`count(*)::int`,
      fallidas: sql<number>`count(*) filter (where not ${aiUsageLog.success})::int`,
      tokensEntrada: sql<number>`coalesce(sum(${aiUsageLog.promptTokens}), 0)::int`,
      tokensSalida: sql<number>`coalesce(sum(${aiUsageLog.completionTokens}), 0)::int`,
      neurons: sql<number>`coalesce(sum(${aiUsageLog.neurons}), 0)::float8`,
      costoUsd: sql<number>`coalesce(sum(${aiUsageLog.estimatedCostUsd}), 0)::float8`,
    })
    .from(aiUsageLog)
    .where(
      and(eq(aiUsageLog.userId, userId), gte(aiUsageLog.createdAt, inicioDeMes))
    )
    .groupBy(aiUsageLog.task, aiUsageLog.model)
    .orderBy(sql`count(*) desc`)

  return filas
}
