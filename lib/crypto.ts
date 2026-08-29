import "server-only"

import { env } from "@/lib/env"

/**
 * Cifrado simétrico para los secretos que guardamos en la base: el provider
 * token de GitHub y la API key propia de OpenRouter de cada usuario.
 *
 * Usa **WebCrypto** (`crypto.subtle`), no `node:crypto`. En Cloudflare Workers
 * WebCrypto es nativo y está garantizado; `node:crypto` depende del alcance de
 * `nodejs_compat`, que cubre distinto según la versión del runtime. WebCrypto
 * además funciona igual en Node 18+, así que el mismo código sirve para
 * drizzle-kit y para cualquier script fuera del Worker.
 *
 * A diferencia de la versión con `node:crypto`, estas funciones son **async**.
 *
 * Formato del ciphertext: `v1:<iv>:<datos+authTag>`, en base64url. El prefijo
 * de versión permite rotar el algoritmo sin tener que adivinar cómo se cifró
 * cada fila.
 */
const IV_LENGTH = 12 // AES-GCM recomienda 96 bits.
const VERSION = "v1"

let claveCacheada: CryptoKey | undefined

async function getKey(): Promise<CryptoKey> {
  if (claveCacheada) {
    return claveCacheada
  }

  const raw = base64ToBytes(env().ENCRYPTION_KEY)

  if (raw.byteLength !== 32) {
    throw new Error(
      "ENCRYPTION_KEY debe ser de 32 bytes en base64. Generala con: openssl rand -base64 32"
    )
  }

  claveCacheada = await crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )

  return claveCacheada
}

export async function encrypt(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  const cifrado = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await getKey(),
    new TextEncoder().encode(plaintext)
  )

  // WebCrypto ya deja el authTag pegado al final del ciphertext.
  return [
    VERSION,
    bytesToBase64url(iv),
    bytesToBase64url(new Uint8Array(cifrado)),
  ].join(":")
}

export async function decrypt(ciphertext: string): Promise<string> {
  const [version, iv, datos] = ciphertext.split(":")

  if (version !== VERSION || !iv || !datos) {
    throw new Error("Ciphertext con formato inválido o versión desconocida")
  }

  const plano = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64urlToBytes(iv) as BufferSource },
    await getKey(),
    base64urlToBytes(datos) as BufferSource
  )

  return new TextDecoder().decode(plano)
}

/** Devuelve `null` en vez de romper: útil para tokens viejos o key rotada. */
export async function tryDecrypt(
  ciphertext: string | null
): Promise<string | null> {
  if (!ciphertext) {
    return null
  }

  try {
    return await decrypt(ciphertext)
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

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de base64. No usamos Buffer: no existe en workerd sin nodejs_compat
// y queremos que este módulo no dependa de él.
// ─────────────────────────────────────────────────────────────────────────────
function base64ToBytes(base64: string): Uint8Array {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)

  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i)
  }

  return bytes
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binario = ""

  for (const byte of bytes) {
    binario += String.fromCharCode(byte)
  }

  return btoa(binario)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/")

  return base64ToBytes(base64)
}
