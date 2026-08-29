import "server-only"

import { and, eq, gt } from "drizzle-orm"

import { db } from "@/lib/db"
import { insightsCache } from "@/lib/db/schema"
import { generarInsights } from "@/lib/ai/tasks/insights"
import { getConfigTarea } from "@/lib/ai/settings"
import {
  getDistribucionPorProyecto,
  getDistribucionPorTipo,
  getResumen,
  getTiempoPorTipo,
} from "@/lib/db/queries/metrics"
import { getEstancados } from "@/lib/db/queries/semana"

const UN_DIA_MS = 24 * 60 * 60 * 1000

/**
 * Insights del dashboard, cacheados en la base.
 *
 * Se regeneran como mucho una vez por día: son observaciones sobre patrones de
 * semanas, no cambian de una carga a otra, y cada regeneración cuesta tokens.
 */
export async function getInsights(
  userId: string,
  forzar = false
): Promise<{ contenido: string | null; generadoEn: Date | null }> {
  if (!forzar) {
    const [cacheado] = await db
      .select()
      .from(insightsCache)
      .where(
        and(
          eq(insightsCache.userId, userId),
          eq(insightsCache.kind, "dashboard_insights"),
          gt(insightsCache.expiresAt, new Date())
        )
      )
      .limit(1)

    if (cacheado) {
      return { contenido: cacheado.contentMd, generadoEn: cacheado.generatedAt }
    }
  }

  const [resumen, porTipo, porProyecto, tiempoPorTipo, estancados] =
    await Promise.all([
      getResumen(userId),
      getDistribucionPorTipo(userId),
      getDistribucionPorProyecto(userId),
      getTiempoPorTipo(userId),
      getEstancados(userId),
    ])

  // Con muy pocos datos no hay patrón que observar y el modelo terminaría
  // inventando. Mejor no gastar la llamada.
  const totalProblemas = porTipo.reduce((suma, d) => suma + d.total, 0)

  if (totalProblemas < 3) {
    return { contenido: null, generadoEn: null }
  }

  const contenido = await generarInsights({
    userId,
    resumen,
    porTipo,
    porProyecto,
    tiempoPorTipo,
    estancados,
  })

  if (!contenido.trim()) {
    return { contenido: null, generadoEn: null }
  }

  const ahora = new Date()
  const { modelo } = await getConfigTarea(userId, "reasoning")

  await db
    .insert(insightsCache)
    .values({
      userId,
      kind: "dashboard_insights",
      contentMd: contenido.trim(),
      model: modelo,
      generatedAt: ahora,
      expiresAt: new Date(ahora.getTime() + UN_DIA_MS),
    })
    .onConflictDoUpdate({
      target: [insightsCache.userId, insightsCache.kind],
      set: {
        contentMd: contenido.trim(),
        model: modelo,
        generatedAt: ahora,
        expiresAt: new Date(ahora.getTime() + UN_DIA_MS),
      },
    })

  return { contenido: contenido.trim(), generadoEn: ahora }
}
