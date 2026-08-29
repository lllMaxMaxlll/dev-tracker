import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

export type SessionUser = {
  id: string
  email: string
  githubLogin: string | null
  avatarUrl: string | null
  displayName: string
}

function toSessionUser(user: User): SessionUser {
  const metadata = user.user_metadata ?? {}

  return {
    id: user.id,
    email: user.email ?? "",
    githubLogin:
      (metadata.user_name as string | undefined) ??
      (metadata.preferred_username as string | undefined) ??
      null,
    avatarUrl: (metadata.avatar_url as string | undefined) ?? null,
    displayName:
      (metadata.full_name as string | undefined) ??
      (metadata.name as string | undefined) ??
      (metadata.user_name as string | undefined) ??
      user.email ??
      "Usuario",
  }
}

/**
 * Usuario de la sesión actual, o `null`.
 *
 * `cache()` la memoiza por request: el layout, la página y varias server
 * actions pueden llamarla sin pegarle N veces a Supabase.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user ? toSessionUser(user) : null
})

/**
 * Igual que getUser() pero redirige a /login si no hay sesión.
 *
 * TODA consulta de dominio arranca por acá y filtra por el `id` devuelto.
 * El proxy protege las rutas, pero no alcanza: una server action se puede
 * invocar directamente, así que la autorización se verifica también acá.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()

  if (!user) {
    redirect("/login")
  }

  return user
}
