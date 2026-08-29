"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userAiSettings } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { aiSettingsSchema } from "@/lib/schemas/ai-settings"
import { getModelo, getModelosDeEmbeddings } from "@/lib/ai/models"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

export async function guardarAjustesIA(
  valores: unknown
): Promise<ActionResult<{ avisoDimensiones: string | null }>> {
  const user = await requireUser()
  const parsed = aiSettingsSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los ajustes",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const datos = parsed.data

  try {
    // La dimensión del vector es fija a nivel esquema: si el modelo nuevo
    // produce otra, los embeddings guardados dejan de ser comparables.
    const embeddings = await getModelosDeEmbeddings()
    const elegido = embeddings.find((m) => m.id === datos.embeddingModel)
    const dimensiones = elegido?.dimensiones ?? 1024

    const [actual] = await db
      .select({ dimensiones: userAiSettings.embeddingDimensions })
      .from(userAiSettings)
      .where(eq(userAiSettings.userId, user.id))
      .limit(1)

    const avisoDimensiones =
      actual && dimensiones !== actual.dimensiones
        ? `El modelo nuevo produce vectores de ${dimensiones} dimensiones y los guardados tienen ${actual.dimensiones}. Hay que regenerar los embeddings existentes (Fase 6).`
        : null

    await db
      .update(userAiSettings)
      .set({
        defaultModel: datos.defaultModel,
        fastModel: datos.fastModel || null,
        reasoningModel: datos.reasoningModel || null,
        embeddingModel: datos.embeddingModel,
        embeddingDimensions: dimensiones,
        fastTemperature: datos.fastTemperature,
        fastMaxTokens: datos.fastMaxTokens,
        reasoningTemperature: datos.reasoningTemperature,
        reasoningMaxTokens: datos.reasoningMaxTokens,
        requireToolCalling: datos.requireToolCalling,
      })
      .where(eq(userAiSettings.userId, user.id))

    revalidatePath("/ajustes")

    return actionOk({ avisoDimensiones })
  } catch (error) {
    console.error("[guardarAjustesIA]", error)

    return actionError("No se pudieron guardar los ajustes")
  }
}

/** Avisa si un modelo no soporta tool calling, para mostrarlo al elegirlo. */
export async function verificarModelo(id: string) {
  await requireUser()

  const modelo = await getModelo(id)

  return {
    existe: Boolean(modelo),
    soportaTools: modelo?.soportaTools ?? false,
    requierePlanPago: modelo?.requierePlanPago ?? false,
  }
}
