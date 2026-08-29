import "server-only"

import { cache } from "react"
import { and, eq } from "drizzle-orm"
import { Octokit } from "octokit"

import { db } from "@/lib/db"
import { githubCredentials } from "@/lib/db/schema"
import { decrypt } from "@/lib/crypto"
import { GithubAuthError } from "@/lib/github/errors"

/**
 * Cliente de Octokit del usuario actual.
 *
 * `cache()` lo memoiza por request: una página que pide repos, commits y ramas
 * descifra el token y arma el cliente una sola vez.
 */
export const getOctokit = cache(async (userId: string): Promise<Octokit> => {
  const [credencial] = await db
    .select()
    .from(githubCredentials)
    .where(eq(githubCredentials.userId, userId))
    .limit(1)

  if (!credencial) {
    throw new GithubAuthError(
      "Todavía no conectaste tu cuenta de GitHub",
      "sin_token"
    )
  }

  if (!credencial.isValid) {
    throw new GithubAuthError(
      "El acceso a GitHub dejó de funcionar. Volvé a autorizar la app.",
      "token_invalido"
    )
  }

  let token: string

  try {
    token = await decrypt(credencial.accessTokenEncrypted)
  } catch {
    // Pasa si se rotó ENCRYPTION_KEY: el token guardado ya no se puede leer.
    await marcarCredencialInvalida(userId)

    throw new GithubAuthError(
      "No se pudo descifrar el token de GitHub. Volvé a autorizar la app.",
      "token_invalido"
    )
  }

  return new Octokit({ auth: token, request: { timeout: 15_000 } })
})

async function marcarCredencialInvalida(userId: string) {
  await db
    .update(githubCredentials)
    .set({ isValid: false, lastCheckedAt: new Date() })
    .where(eq(githubCredentials.userId, userId))
}

type ErrorHttp = { status?: number; message?: string }

/**
 * Envuelve una llamada a la API de GitHub y traduce los fallos de credenciales.
 *
 * Un 401 significa token inválido o revocado. Un 403 puede ser rate limit o
 * falta de permisos, así que se distingue mirando la cabecera que manda GitHub:
 * marcar la credencial como inválida por haber agotado el rate limit obligaría
 * a reconectar sin motivo.
 */
export async function conGithub<T>(
  userId: string,
  operacion: (octokit: Octokit) => Promise<T>
): Promise<T> {
  const octokit = await getOctokit(userId)

  try {
    return await operacion(octokit)
  } catch (error) {
    const http = error as ErrorHttp

    if (http.status === 401) {
      await marcarCredencialInvalida(userId)

      throw new GithubAuthError(
        "GitHub rechazó el token. Volvé a autorizar la app.",
        "token_invalido"
      )
    }

    if (http.status === 403 || http.status === 429) {
      const esRateLimit = /rate limit|secondary rate/i.test(http.message ?? "")

      if (!esRateLimit) {
        throw new GithubAuthError(
          "El token no tiene permisos para esto. Volvé a autorizar la app pidiendo acceso a repos.",
          "sin_permisos"
        )
      }
    }

    throw error
  }
}

/** Cuota restante de la API, para poder diagnosticar sin adivinar. */
export async function getRateLimit(userId: string) {
  return conGithub(userId, async (octokit) => {
    const { data } = await octokit.rest.rateLimit.get()

    return {
      limite: data.rate.limit,
      restante: data.rate.remaining,
      seRenuevaEn: new Date(data.rate.reset * 1000),
    }
  })
}

/** Si el usuario tiene una credencial de GitHub utilizable. */
export async function tieneGithubConectado(userId: string): Promise<boolean> {
  const [credencial] = await db
    .select({ isValid: githubCredentials.isValid })
    .from(githubCredentials)
    .where(
      and(
        eq(githubCredentials.userId, userId),
        eq(githubCredentials.isValid, true)
      )
    )
    .limit(1)

  return Boolean(credencial)
}
