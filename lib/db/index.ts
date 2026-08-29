import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"
import { AsyncLocalStorage } from "node:async_hooks"

import { cache } from "react"
import { after } from "next/server"

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
 * página comparten el pool en vez de abrir uno por consulta.
 *
 * ⚠️ Y el pool se CIERRA al terminar la respuesta, con `after()`. Sin eso las
 * conexiones se acumulan: el session pooler de Supabase corta en 15 clientes y
 * empieza a devolver `EMAXCONNSESSION`. Los timers de pg (`idleTimeoutMillis`)
 * no alcanzan, porque en workerd no siguen corriendo una vez que la request
 * terminó.
 */
function nuevoPool() {
  return new Pool({
    connectionString: connectionString(),
    // Hyperdrive (o el pooler de Supabase en dev) ya poolea del lado del
    // servidor. Con pocas conexiones por request alcanza, y así no se agota
    // el límite del pooler, que en Supabase corta en 15 clientes.
    max: 3,
    connectionTimeoutMillis: 10_000,
  })
}

const crearDb = cache((): Db => {
  const pool = nuevoPool()

  try {
    after(async () => {
      try {
        await pool.end()
      } catch (error) {
        console.error("[db] no se pudo cerrar el pool", error)
      }
    })
  } catch {
    // `after()` sólo existe dentro de una request.
  }

  return drizzle(pool, { schema })
})

/**
 * Contexto de conexión para los route handlers.
 *
 * `cache()` sólo memoiza dentro del scope de React, que en un route handler no
 * existe. Con AsyncLocalStorage, `conDb()` deja la conexión disponible para
 * TODO el código que corra dentro, incluidas las funciones de librería que
 * importan el proxy `db` sin recibirlo por parámetro.
 */
const contexto = new AsyncLocalStorage<Db>()

export function getDb(): Db {
  return contexto.getStore() ?? crearDb()
}

/**
 * Azúcar sintáctico sobre `getDb()` para poder escribir `db.select()...` en
 * todo el código sin arrastrar la llamada.
 *
 * ⚠️ Usar SÓLO en componentes de servidor y server actions.
 *
 * `cache()` memoiza por request únicamente dentro del scope de React. En un
 * **route handler** ese scope no existe, así que cada acceso a una propiedad de
 * este Proxy construiría un pool nuevo: medido, una sola query en un handler
 * abría 4 conexiones, y el session pooler de Supabase corta en 15. En los route
 * handlers usá `conDb()`.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver)
  },
})

/**
 * Conexión para **route handlers**, donde `cache()` no memoiza.
 *
 * Abre un pool, lo publica en el contexto para que el proxy `db` lo use, corre
 * lo que le pasés y lo cierra siempre, incluso si falla.
 *
 * Envolvé el cuerpo COMPLETO del handler: cualquier función de librería que se
 * llame adentro (`guardarEmbedding`, `registrarUso`, las queries) usa el proxy
 * `db`, y sin el contexto cada acceso abriría su propia conexión.
 */
export async function conDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const existente = contexto.getStore()

  // Llamada anidada: ya hay conexión, se reusa.
  if (existente) {
    return fn(existente)
  }

  const pool = nuevoPool()
  const instancia = drizzle(pool, { schema })

  try {
    return await contexto.run(instancia, () => fn(instancia))
  } finally {
    try {
      await pool.end()
    } catch (error) {
      console.error("[conDb] no se pudo cerrar el pool", error)
    }
  }
}

export { schema }
