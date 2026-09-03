import { NextResponse, type NextRequest } from "next/server"
import { eq, isNotNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { profiles, userAiSettings } from "@/lib/db/schema"
import { env } from "@/lib/env"
import { isAllowed } from "@/lib/auth/whitelist"
import { generarResumenSemanal } from "@/lib/ai/tasks/summary"
import { limpiarCacheVencido } from "@/lib/github/cache"

/**
 * Resumen semanal. Lo dispara el Cron Trigger de Workers los viernes.
 *
 * Corre para cada usuario habilitado y es idempotente por semana: si ya existe
 * el resumen, no lo regenera, así un reintento no duplica ni gasta tokens.
 *
 */
export async function GET(request: NextRequest) {
  const secreto = env().CRON_SECRET

  if (!secreto) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 500 }
    )
  }

  const autorizacion = request.headers.get("authorization")

  if (autorizacion !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  const usuarios = await db
    .select({
      id: profiles.id,
      email: profiles.email,
      githubLogin: profiles.githubLogin,
    })
    .from(profiles)
    // Sólo los que tienen ajustes de IA, o sea los que completaron el alta.
    .innerJoin(userAiSettings, eq(userAiSettings.userId, profiles.id))
    .where(isNotNull(profiles.email))

  const resultados = []

  for (const usuario of usuarios) {
    if (
      !isAllowed({ email: usuario.email, githubLogin: usuario.githubLogin })
    ) {
      resultados.push({ usuario: usuario.id, saltado: "no habilitado" })

      continue
    }

    try {
      const r = await generarResumenSemanal({
        userId: usuario.id,
        origen: "cron",
      })

      resultados.push({ usuario: usuario.id, ...r })
    } catch (error) {
      console.error("[cron/weekly-summary]", usuario.id, error)
      resultados.push({
        usuario: usuario.id,
        generado: false,
        motivo: error instanceof Error ? error.message : "error desconocido",
      })
    }
  }

  // Aprovechamos la corrida para limpiar el caché vencido de GitHub.
  try {
    await limpiarCacheVencido()
  } catch (error) {
    console.error("[cron/weekly-summary] limpieza de caché", error)
  }

  return NextResponse.json({ usuarios: usuarios.length, resultados })
}
