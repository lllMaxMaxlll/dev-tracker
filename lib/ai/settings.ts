import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userAiSettings, type UserAiSettings } from "@/lib/db/schema"

/**
 * Tipos de tarea. Determinan qué modelo y qué parámetros se usan.
 *
 * - `fast`: estructurar texto. Captura en lenguaje natural, vinculación de
 *   commits. Se quiere barato, rápido y obediente, no creativo.
 * - `reasoning`: escribir. Resúmenes, priorización, insights, enriquecimiento.
 */
export type TipoTarea = "fast" | "reasoning"

export type ConfigTarea = {
  modelo: string
  temperatura: number
  maxTokens: number
  requiereTools: boolean
}

/** Crea la fila de ajustes si el usuario todavía no la tiene. */
export async function getAjustes(userId: string): Promise<UserAiSettings> {
  const [existente] = await db
    .select()
    .from(userAiSettings)
    .where(eq(userAiSettings.userId, userId))
    .limit(1)

  if (existente) {
    return existente
  }

  const [creada] = await db
    .insert(userAiSettings)
    .values({ userId })
    .onConflictDoUpdate({
      target: userAiSettings.userId,
      set: { updatedAt: new Date() },
    })
    .returning()

  return creada
}

/**
 * Resuelve la configuración efectiva de una tarea.
 *
 * `fastModel` y `reasoningModel` en `null` significan "heredar del modelo por
 * defecto": así se puede cambiar el default una vez y que aplique a todo.
 */
export async function getConfigTarea(
  userId: string,
  tarea: TipoTarea
): Promise<ConfigTarea> {
  const ajustes = await getAjustes(userId)

  if (tarea === "fast") {
    return {
      modelo: ajustes.fastModel ?? ajustes.defaultModel,
      temperatura: ajustes.fastTemperature,
      maxTokens: ajustes.fastMaxTokens,
      requiereTools: ajustes.requireToolCalling,
    }
  }

  return {
    modelo: ajustes.reasoningModel ?? ajustes.defaultModel,
    temperatura: ajustes.reasoningTemperature,
    maxTokens: ajustes.reasoningMaxTokens,
    requiereTools: ajustes.requireToolCalling,
  }
}

export async function getModeloEmbeddings(userId: string) {
  const ajustes = await getAjustes(userId)

  return {
    modelo: ajustes.embeddingModel,
    dimensiones: ajustes.embeddingDimensions,
  }
}
