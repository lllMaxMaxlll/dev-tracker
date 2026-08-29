import { defineConfig } from "drizzle-kit"

// Las migraciones usan SIEMPRE la conexión directa (no el pooler): drizzle-kit
// necesita transacciones y sentencias DDL que el pooler en modo transaction no
// soporta.
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!url) {
  throw new Error(
    "Falta DIRECT_URL (o DATABASE_URL) para correr las migraciones"
  )
}

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  // No gestionamos el esquema `auth` de Supabase: sólo lo referenciamos.
  schemaFilter: ["public"],
  verbose: true,
  strict: true,
})
