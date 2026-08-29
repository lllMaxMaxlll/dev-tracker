import "server-only"

import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 *
 * En Server Components la escritura de cookies falla (Next no permite mutar la
 * respuesta durante el render); la ignoramos porque el refresco de sesión ya lo
 * hace el proxy. En Server Actions y Route Handlers sí escribe.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Component: lo maneja el proxy.
        }
      },
    },
  })
}
