import "server-only"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userAiSettings, type UserAiSettings } from "@/lib/db/schema"
import {
  MODELO_EMBEDDINGS_POR_DEFECTO,
  MODELO_RAPIDO_POR_DEFECTO,
  MODELO_RAZONADOR_POR_DEFECTO,
  resolverModeloHeredado,
} from "@/lib/ai/models"

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
      modelo: resolverModeloHeredado(
        ajustes.fastModel ?? ajustes.defaultModel,
        MODELO_RAPIDO_POR_DEFECTO
      ),
      temperatura: ajustes.fastTemperature,
      maxTokens: ajustes.fastMaxTokens,
      requiereTools: ajustes.requireToolCalling,
    }
  }

  return {
    modelo: resolverModeloHeredado(
      ajustes.reasoningModel ?? ajustes.defaultModel,
      MODELO_RAZONADOR_POR_DEFECTO
    ),
    temperatura: ajustes.reasoningTemperature,
    maxTokens: ajustes.reasoningMaxTokens,
    requiereTools: ajustes.requireToolCalling,
  }
}

export async function getModeloEmbeddings(userId: string) {
  const ajustes = await getAjustes(userId)

  return {
    modelo: resolverModeloHeredado(
      ajustes.embeddingModel,
      MODELO_EMBEDDINGS_POR_DEFECTO
    ),
    dimensiones: ajustes.embeddingDimensions,
  }
}
