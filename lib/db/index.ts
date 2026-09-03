import "server-only"

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "@/lib/env"
import * as schema from "@/lib/db/schema"

/**
 * Conexión a Postgres (Supabase) desde Vercel.
 *
 * La app corre en el runtime de **Node**, que a diferencia de workerd mantiene
 * vivo el scope del módulo entre invocaciones. Eso permite lo que en Cloudflare
 * era imposible: **un pool a nivel de módulo**, reutilizado por todas las
 * requests que atienda la misma instancia.
 *
 * `DATABASE_URL` tiene que apuntar al **pooler transaccional de Supavisor**
 * (puerto 6543), no a la conexión directa: en serverless las instancias
 * aparecen y desaparecen, y sin un pooler del lado del servidor la base se
 * queda sin conexiones. El modo transacción no soporta prepared statements,
 * pero drizzle sólo los usa si se pide `.prepare()` explícitamente, y en este
 * proyecto no se usa en ningún lado.
 *
 * `DIRECT_URL` (puerto 5432) queda para drizzle-kit: las migraciones sí
 * necesitan una sesión de verdad.
 *
 * ⚠️ Esta conexión BYPASSEA Row Level Security: se conecta con el rol dueño de
 * la base. RLS es defensa en profundidad contra la API REST de Supabase (la
 * anon key es pública). El aislamiento real lo garantiza la aplicación
 * filtrando SIEMPRE por el user_id de la sesión verificada en el servidor.
 * Ver lib/auth/require-user.ts.
 */
type Db = NodePgDatabase<typeof schema>

let pool: Pool | undefined

function getPool(): Pool {
  if (pool) {
    return pool
  }

  const url = env().DATABASE_URL

  if (!url) {
    throw new Error(
      "Falta DATABASE_URL. Tiene que ser la connection string del pooler " +
        "transaccional de Supabase (puerto 6543). Ver .env.example."
    )
  }

  pool = new Pool({
    connectionString: url,
    // Con Fluid compute una misma instancia atiende varias requests a la vez,
    // así que un pool de uno las serializaría sin necesidad. Cinco alcanza de
    // sobra: quien realmente poolea es Supavisor del otro lado.
    max: 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  })

  // Sin este handler, un socket que el pooler corta por inactividad tumba el
  // proceso entero con un error no capturado en vez de descartar la conexión.
  pool.on("error", (error) => {
    console.error("[db] conexión inactiva descartada", error)
  })

  return pool
}

let instancia: Db | undefined

function getDb(): Db {
  if (!instancia) {
    instancia = drizzle(getPool(), { schema })
  }

  return instancia
}

/**
 * Azúcar sintáctico sobre `getDb()` para poder escribir `db.select()...` en
 * todo el código sin arrastrar la llamada.
 *
 * Sigue siendo un Proxy y no una constante para que el pool se cree la primera
 * vez que alguien consulta, no al importar el módulo: así `next build` puede
 * cargar estos archivos sin necesidad de una base.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

export { schema }
