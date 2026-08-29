import "server-only"

import { desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { weeklySummaries } from "@/lib/db/schema"

export async function listarResumenes(userId: string, limite = 20) {
  return db
    .select()
    .from(weeklySummaries)
    .where(eq(weeklySummaries.userId, userId))
    .orderBy(desc(weeklySummaries.weekStart))
    .limit(limite)
}

export async function getUltimoResumen(userId: string) {
  const [resumen] = await listarResumenes(userId, 1)

  return resumen ?? null
}
