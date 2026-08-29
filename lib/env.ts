import "server-only"

import { z } from "zod"

/**
 * Validación de las variables de entorno del SERVIDOR.
 *
 * Este módulo es `server-only` a propósito: importarlo desde un componente
 * cliente rompe el build, que es exactamente lo que queremos para que la
 * service role key no pueda filtrarse al navegador por accidente.
 *
 * Las variables `NEXT_PUBLIC_*` se leen directamente donde se usan, porque
 * Next las reemplaza en tiempo de build y no sobreviven a una lectura dinámica.
 */
const csv = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  )

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "Falta DATABASE_URL"),
  DIRECT_URL: z.string().optional(),

  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  // 32 bytes en base64 → 44 caracteres.
  ENCRYPTION_KEY: z
    .string()
    .min(1, "Falta ENCRYPTION_KEY (generar con: openssl rand -base64 32)"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_SITE_URL: z.string().optional(),
  OPENROUTER_APP_NAME: z.string().default("DevTracker"),

  EMBEDDINGS_PROVIDER: z
    .enum(["workers-ai", "ollama", "local", "openai"])
    .default("workers-ai"),
  EMBEDDINGS_MODEL: z.string().default("@cf/baai/bge-m3"),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),

  CRON_SECRET: z.string().optional(),

  ALLOWED_EMAILS: csv,
  ALLOWED_GITHUB_LOGINS: csv,
})

type ServerEnv = z.infer<typeof serverEnvSchema>

let cached: ServerEnv | undefined

/**
 * Se valida de forma perezosa (no al importar) para que `next build` no falle
 * en entornos donde todavía no están todas las variables cargadas.
 */
export function env(): ServerEnv {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env)

    if (!parsed.success) {
      const detalle = parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n")

      throw new Error(
        `Variables de entorno inválidas:\n${detalle}\n\nRevisá .env.example`
      )
    }

    cached = parsed.data
  }

  return cached
}
