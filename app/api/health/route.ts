import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

/** Health check para el despliegue. También lo usa el cron que mantiene
 * despierta la base: Supabase pausa los proyectos gratuitos a los 7 días sin
 * actividad. */
export async function GET() {
  try {
    await db.execute(sql`select 1`)

    return NextResponse.json({ status: "ok", db: "ok" })
  } catch (error) {
    console.error("[health] la base no responde", error)

    return NextResponse.json({ status: "error", db: "error" }, { status: 503 })
  }
}
