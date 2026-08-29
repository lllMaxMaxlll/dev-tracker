import "server-only"

import { and, eq, lt, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { githubCache } from "@/lib/db/schema"

/**
 * Caché de las respuestas de la API de GitHub, por usuario.
 *
 * No usamos el caché de Next (`revalidate` / ISR): estas páginas son privadas y
 * el contenido depende del usuario, así que una entrada compartida filtraría
 * datos de una cuenta a otra. Un caché explícito con `user_id` en la clave no
 * tiene esa ambigüedad.
 *
 * TTL por defecto: 12 minutos, dentro de la ventana de 10–15 que pide el plan.
 */
const TTL_POR_DEFECTO_MS = 12 * 60 * 1000

export async function conCache<T>(
  userId: string,
  clave: string,
  ttlMs: number = TTL_POR_DEFECTO_MS,
  cargar: () => Promise<T>,
  opciones?: {
    /**
     * Decide si el resultado merece guardarse. Sirve para respuestas
     * provisorias: GitHub calcula algunas estadísticas de forma diferida y
     * devuelve 202 con el cuerpo vacío. Cachear eso dejaría el heatmap en
     * blanco durante todo el TTL aunque GitHub ya hubiera terminado.
     */
    cachearSi?: (datos: T) => boolean
  }
): Promise<{ datos: T; desdeCache: boolean; fetchedAt: Date }> {
  const ahora = new Date()

  const [entrada] = await db
    .select()
    .from(githubCache)
    .where(and(eq(githubCache.userId, userId), eq(githubCache.cacheKey, clave)))
    .limit(1)

  if (entrada && entrada.expiresAt > ahora) {
    return {
      datos: entrada.payload as T,
      desdeCache: true,
      fetchedAt: entrada.fetchedAt,
    }
  }

  const datos = await cargar()

  if (opciones?.cachearSi && !opciones.cachearSi(datos)) {
    return { datos, desdeCache: false, fetchedAt: ahora }
  }

  const expiresAt = new Date(ahora.getTime() + ttlMs)

  await db
    .insert(githubCache)
    .values({
      userId,
      cacheKey: clave,
      payload: datos as never,
      fetchedAt: ahora,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [githubCache.userId, githubCache.cacheKey],
      set: { payload: datos as never, fetchedAt: ahora, expiresAt },
    })

  return { datos, desdeCache: false, fetchedAt: ahora }
}

/** Invalida las entradas de un usuario, opcionalmente por prefijo de clave. */
export async function invalidarCache(userId: string, prefijo?: string) {
  await db
    .delete(githubCache)
    .where(
      prefijo
        ? and(
            eq(githubCache.userId, userId),
            sql`${githubCache.cacheKey} like ${`${prefijo}%`}`
          )
        : eq(githubCache.userId, userId)
    )
}

/** Limpieza de entradas vencidas. La llama el cron semanal (Fase 6). */
export async function limpiarCacheVencido() {
  await db.delete(githubCache).where(lt(githubCache.expiresAt, new Date()))
}
