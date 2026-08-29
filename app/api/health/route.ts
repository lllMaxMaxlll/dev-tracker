import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { db } from "@/lib/db"

/**
 * Health check para Coolify: si esto no responde 200, el deploy nuevo no
 * reemplaza al que está funcionando.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`)

    return NextResponse.json({ status: "ok", db: "ok" })
  } catch (error) {
    console.error("[health] la base no responde", error)

    return NextResponse.json({ status: "error", db: "error" }, { status: 503 })
  }
}
