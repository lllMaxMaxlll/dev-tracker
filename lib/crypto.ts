import "server-only"

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import { env } from "@/lib/env"

/**
 * Cifrado simétrico para los secretos que guardamos en la base: el provider
 * token de GitHub y la API key propia de OpenRouter de cada usuario.
 *
 * Formato del ciphertext: `v1:<iv>:<authTag>:<datos>`, todo en base64url.
 * El prefijo de versión permite rotar el algoritmo más adelante sin tener que
 * adivinar cómo se cifró cada fila.
 */
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // GCM recomienda 96 bits.
const VERSION = "v1"

function getKey(): Buffer {
  const key = Buffer.from(env().ENCRYPTION_KEY, "base64")

  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY debe ser de 32 bytes en base64. Generala con: openssl rand -base64 32"
    )
  }

  return key
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])

  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function decrypt(ciphertext: string): string {
  const [version, iv, authTag, data] = ciphertext.split(":")

  if (version !== VERSION || !iv || !authTag || !data) {
    throw new Error("Ciphertext con formato inválido o versión desconocida")
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(authTag, "base64url"))

  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/** Devuelve `null` en vez de romper: útil para tokens viejos o key rotada. */
export function tryDecrypt(ciphertext: string | null): string | null {
  if (!ciphertext) {
    return null
  }

  try {
    return decrypt(ciphertext)
  } catch {
    return null
  }
}

/** Para mostrar una key en la interfaz sin exponerla: `sk-or-…a1b2`. */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return "…"
  }

  return `${secret.slice(0, 6)}…${secret.slice(-4)}`
}
