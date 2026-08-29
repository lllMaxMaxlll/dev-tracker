import "server-only"

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "@/lib/env"
import * as schema from "@/lib/db/schema"

/**
 * Conexión a Postgres (Supabase).
 *
 * Corremos en un proceso Node de larga vida (contenedor en Coolify), así que
 * usamos la conexión DIRECTA con un pool chico y prepared statements activos.
 * Si algún día se pasa a serverless o a varias réplicas, alcanza con apuntar
 * DATABASE_URL al transaction pooler (:6543): el `prepare: false` se activa
 * solo al detectar el puerto.
 *
 * ⚠️ Esta conexión BYPASSEA Row Level Security: se conecta con el rol dueño de
 * la base. RLS es defensa en profundidad contra la API REST de Supabase (la
 * anon key es pública). El aislamiento real lo garantiza la aplicación
 * filtrando SIEMPRE por el user_id de la sesión verificada en el servidor.
 * Ver lib/auth/require-user.ts.
 */
type Db = PostgresJsDatabase<typeof schema>

// En desarrollo el hot reload recrearía el pool en cada cambio y agotaría las
// conexiones de Supabase, así que lo guardamos en el objeto global.
const globalForDb = globalThis as unknown as {
  __devtrackerSql?: ReturnType<typeof postgres>
  __devtrackerDb?: Db
}

function createDb(): Db {
  if (globalForDb.__devtrackerDb) {
    return globalForDb.__devtrackerDb
  }

  const url = env().DATABASE_URL
  const isPooled = url.includes(":6543")

  const client =
    globalForDb.__devtrackerSql ??
    postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: !isPooled,
    })

  const instance = drizzle(client, { schema })

  if (process.env.NODE_ENV !== "production") {
    globalForDb.__devtrackerSql = client
    globalForDb.__devtrackerDb = instance
  }

  return instance
}

let instancia: Db | undefined

/**
 * Conexión perezosa: no se abre (ni se validan las variables de entorno) hasta
 * la primera consulta real. Es lo que permite que `next build` recolecte las
 * páginas sin necesitar credenciales de base de datos.
 */
export function getDb(): Db {
  instancia ??= createDb()

  return instancia
}

/**
 * Azúcar sintáctico sobre `getDb()` para poder escribir `db.select()...` en
 * todo el código sin arrastrar la llamada. El Proxy sólo difiere la creación
 * del cliente hasta el primer acceso a una propiedad.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

export { schema }
