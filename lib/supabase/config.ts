/**
 * Variables públicas de Supabase.
 *
 * No pueden leerse con el validador de `lib/env.ts` porque ese módulo es
 * `server-only` y estas se necesitan también en el navegador. Next las
 * reemplaza literalmente en tiempo de build, así que hay que escribirlas
 * completas (nada de `process.env[nombre]`).
 */
function requerida(valor: string | undefined, nombre: string): string {
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}.\n\n` +
        "Creá un proyecto en Supabase y copiá sus credenciales a .env.local " +
        "(Project Settings → Data API). El archivo .env.example tiene la " +
        "plantilla completa y el README los pasos."
    )
  }

  return valor
}

export function supabaseUrl(): string {
  return requerida(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    "NEXT_PUBLIC_SUPABASE_URL"
  )
}

export function supabaseAnonKey(): string {
  return requerida(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  )
}
