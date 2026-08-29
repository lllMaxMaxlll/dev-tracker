import "server-only"

import { createClient } from "@supabase/supabase-js"

import { env } from "@/lib/env"
import { supabaseUrl } from "@/lib/supabase/config"

/**
 * Cliente con service role key. SÓLO servidor, y sólo para lo que la anon key
 * no puede hacer: listar usuarios habilitados en el cron semanal, cerrar la
 * sesión de un usuario que no está en la lista blanca, etc.
 *
 * Nunca se importa desde un componente cliente: `server-only` lo garantiza en
 * tiempo de build.
 */
export function createAdminClient() {
  const serviceRoleKey = env().SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY: se necesita para operaciones administrativas"
    )
  }

  return createClient(supabaseUrl(), serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
