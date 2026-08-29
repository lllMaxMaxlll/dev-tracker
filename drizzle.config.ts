import { existsSync } from "node:fs"

import { defineConfig } from "drizzle-kit"

// drizzle-kit evalúa este archivo en un proceso propio que no hereda las
// variables que carga el runtime, así que el .env.local se lee acá a mano.
for (const archivo of [".env.local", ".env"]) {
  if (existsSync(archivo)) {
    process.loadEnvFile(archivo)
    break
  }
}

// Las migraciones necesitan transacciones y DDL, así que van por session mode
// (puerto 5432), nunca por transaction mode (6543).
//
// Ojo: la conexión DIRECTA de Supabase (db.<ref>.supabase.co) resuelve sólo a
// IPv6; desde una red IPv4 hay que usar el session pooler. Ver .env.example.
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
