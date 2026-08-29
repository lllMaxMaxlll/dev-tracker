"use client"

import { createBrowserClient } from "@supabase/ssr"

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * Cliente de Supabase para el navegador.
 * Se usa ÚNICAMENTE para autenticación (iniciar el flujo OAuth y leer la
 * sesión). Los datos de dominio nunca se consultan desde el cliente: van por
 * server actions con Drizzle.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
