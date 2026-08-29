import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"
import { cache } from "react"

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import { env } from "@/lib/env"
import * as schema from "@/lib/db/schema"

/**
 * Conexión a Postgres (Supabase) desde Cloudflare Workers.
 *
 * Los Workers no pueden abrir sockets TCP crudos a Postgres, así que la
 * conexión pasa por **Hyperdrive**, que además poolea del lado del servidor.
 * El driver es **node-postgres (`pg`)**: es el recomendado por Cloudflare por
 * su compatibilidad con el caché de Hyperdrive.
 *
 * Al binding de Hyperdrive se le carga la connection string DIRECTA de
 * Supabase; en desarrollo se usa el session pooler. El detalle está en
 * `connectionString()` acá abajo.
 *
 * ⚠️ Esta conexión BYPASSEA Row Level Security: se conecta con el rol dueño de
 * la base. RLS es defensa en profundidad contra la API REST de Supabase (la
 * anon key es pública). El aislamiento real lo garantiza la aplicación
 * filtrando SIEMPRE por el user_id de la sesión verificada en el servidor.
 * Ver lib/auth/require-user.ts.
 */
type Db = NodePgDatabase<typeof schema>

function connectionString(): string {
  // El binding sólo existe dentro de workerd.
  const hyperdrive = (
    cloudflareEnv as { HYPERDRIVE?: { connectionString: string } }
  ).HYPERDRIVE

  // En producción manda el binding de Hyperdrive.
  //
  // En desarrollo NO se puede usar: wrangler emula el binding devolviendo un
  // host ficticio `<hash>.hyperdrive.local`, que sólo workerd sabe interceptar.
  // `pg` intenta resolverlo por DNS y falla con "connection attempt failed".
  // Así que en dev vamos directo a DATABASE_URL, que apunta al session pooler
  // de Supabase (la conexión directa es IPv6-only; ver .env.example).
  if (process.env.NODE_ENV === "production") {
    return hyperdrive?.connectionString ?? env().DATABASE_URL
  }

  return env().DATABASE_URL
}

/**
 * Una conexión por request, memoizada con `cache()` de React.
 *
 * ⚠️ NO se puede usar un pool a nivel de módulo. Workerd aísla el I/O por
 * request: un socket abierto durante una request no se puede reutilizar en la
 * siguiente, y el intento cuelga el Worker sin lanzar excepción ("your Worker's
 * code had hung and would never generate a response"). Con un singleton, la
 * primera request funcionaba y la segunda moría.
 *
 * `cache()` memoiza por request, así que todas las consultas de una misma
 * página comparten el pool en vez de abrir uno por consulta. Los sockets los
 * cierra workerd al terminar la request.
 */
const crearDb = cache((): Db => {
  const pool = new Pool({
    connectionString: connectionString(),
    // Hyperdrive (o el pooler de Supabase en dev) ya poolea del lado del
    // servidor: acá alcanza con unas pocas conexiones por request.
    max: 5,
    connectionTimeoutMillis: 10_000,
  })

  return drizzle(pool, { schema })
})

export function getDb(): Db {
  return crearDb()
}

/**
 * Azúcar sintáctico sobre `getDb()` para poder escribir `db.select()...` en
 * todo el código sin arrastrar la llamada.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

export { schema }
