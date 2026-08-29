import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { conDb } from "@/lib/db"

/**
 * Health check para el despliegue.
 *
 * Usa `conDb` y no el proxy `db`: en un route handler el `cache()` de React no
 * memoiza, y cada acceso abriría una conexión nueva. Ver lib/db/index.ts.
 */
export async function GET() {
  try {
    await conDb((db) => db.execute(sql`select 1`))

    return NextResponse.json({ status: "ok", db: "ok" })
  } catch (error) {
    console.error("[health] la base no responde", error)

    return NextResponse.json({ status: "error", db: "error" }, { status: 503 })
  }
}
