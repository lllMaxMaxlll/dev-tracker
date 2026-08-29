import { NextResponse, type NextRequest } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { conDb } from "@/lib/db"
import {
  githubCredentials,
  profiles,
  userAiSettings,
  userCounters,
} from "@/lib/db/schema"
import { encrypt } from "@/lib/crypto"
import { isAllowed } from "@/lib/auth/whitelist"

/**
 * Callback del OAuth de GitHub.
 *
 * Además de intercambiar el código por una sesión, acá guardamos el
 * `provider_token` de GitHub: Supabase lo devuelve UNA sola vez, en la
 * respuesta del intercambio, y no lo persiste. Si no lo capturamos ahora, no
 * hay forma de recuperarlo sin volver a pasar por el flujo de autorización.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const redirectTo = searchParams.get("redirectTo") ?? "/"
  const oauthError = searchParams.get("error_description")

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=sin_codigo`)
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error || !data.session || !data.user) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error?.message ?? "sesion_invalida")}`
    )
  }

  const { user, session } = data
  const metadata = user.user_metadata ?? {}
  const githubLogin =
    (metadata.user_name as string | undefined) ??
    (metadata.preferred_username as string | undefined) ??
    null

  // Lista blanca: si la instancia es restringida y este usuario no está, se
  // cierra la sesión antes de crear ninguna fila.
  if (!isAllowed({ email: user.email, githubLogin })) {
    await supabase.auth.signOut()

    return NextResponse.redirect(`${origin}/login?error=no_habilitado`)
  }

  try {
    // `conDb` y no el proxy `db`: en un route handler el `cache()` de React no
    // memoiza y cada acceso abriría una conexión nueva.
    await conDb((db) =>
      db.transaction(async (tx) => {
        await tx
          .insert(profiles)
          .values({
            id: user.id,
            email: user.email ?? "",
            githubLogin,
            githubAvatarUrl:
              (metadata.avatar_url as string | undefined) ?? null,
            displayName:
              (metadata.full_name as string | undefined) ??
              (metadata.name as string | undefined) ??
              githubLogin ??
              user.email ??
              "Usuario",
          })
          .onConflictDoUpdate({
            target: profiles.id,
            set: {
              email: user.email ?? "",
              githubLogin,
              githubAvatarUrl:
                (metadata.avatar_url as string | undefined) ?? null,
              updatedAt: new Date(),
            },
          })

        // Filas de arranque, idempotentes.
        await tx
          .insert(userCounters)
          .values({ userId: user.id })
          .onConflictDoNothing()

        await tx
          .insert(userAiSettings)
          .values({ userId: user.id })
          .onConflictDoNothing()

        if (session.provider_token) {
          // Los tokens de OAuth App clásicos no expiran; los de GitHub App sí,
          // pero Supabase no expone su vencimiento acá. En vez de inventar una
          // fecha, dejamos `expiresAt` en null y detectamos la expiración cuando
          // Octokit devuelve 401 (ver lib/github/client.ts, Fase 4).
          const credenciales = {
            accessTokenEncrypted: await encrypt(session.provider_token),
            refreshTokenEncrypted: session.provider_refresh_token
              ? await encrypt(session.provider_refresh_token)
              : null,
            scopes: ["read:user", "repo"],
            isValid: true,
            lastCheckedAt: new Date(),
          }

          await tx
            .insert(githubCredentials)
            .values({ userId: user.id, ...credenciales })
            .onConflictDoUpdate({
              target: githubCredentials.userId,
              set: { ...credenciales, updatedAt: new Date() },
            })
        }
      })
    )
  } catch (dbError) {
    console.error("[auth/callback] no se pudo persistir el perfil", dbError)

    return NextResponse.redirect(`${origin}/login?error=error_base_de_datos`)
  }

  // Sólo rutas internas: evita un open redirect vía ?redirectTo=https://…
  const destino = redirectTo.startsWith("/") ? redirectTo : "/"

  return NextResponse.redirect(`${origin}${destino}`)
}
