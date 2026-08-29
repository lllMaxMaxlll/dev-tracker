import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"
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
 * En la connection string va la conexión DIRECTA de Supabase (puerto 5432),
 * no la pooled: el pooling lo hace Hyperdrive.
 *
 * Se cae a `DATABASE_URL` cuando no hay binding (por ejemplo al correr
 * drizzle-kit fuera del Worker).
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

  return hyperdrive?.connectionString ?? env().DATABASE_URL
}

/**
 * El pool vive a nivel de módulo, o sea una vez por isolate. Hyperdrive hace
 * que abrir conexiones sea barato y mantiene el pool real del lado del
 * servidor, así que no hace falta crear y cerrar un cliente por request.
 */
let instancia: Db | undefined

export function getDb(): Db {
  if (!instancia) {
    const pool = new Pool({
      connectionString: connectionString(),
      // Hyperdrive ya poolea: acá alcanza con pocas conexiones por isolate.
      max: 5,
    })

    instancia = drizzle(pool, { schema })
  }

  return instancia
}

/**
 * Azúcar sintáctico sobre `getDb()` para poder escribir `db.select()...` en
 * todo el código. El Proxy difiere la creación del cliente hasta el primer
 * acceso, que es lo que permite que el build no necesite credenciales.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

export { schema }
