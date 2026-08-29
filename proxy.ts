import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/config"

/**
 * Proxy (en Next 15 y anteriores se llamaba `middleware`).
 *
 * Hace dos cosas:
 *   1. Refresca la sesión de Supabase y reescribe las cookies.
 *   2. Protege todas las rutas: sin sesión, redirige a /login.
 *
 * ⚠️ El proxy NO es la barrera de seguridad. Un cambio en el matcher o un
 * refactor pueden dejar una ruta afuera sin que se note. Cada server action y
 * cada consulta valida la sesión por su cuenta con `requireUser()`.
 */

// Rutas accesibles sin sesión. Todo lo demás requiere estar logueado.
const PUBLIC_PATHS = ["/login", "/auth"]

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  )
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        response = NextResponse.next({ request })

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // getUser() revalida el token contra Supabase. No usar getSession() acá:
  // lee la cookie sin verificarla, y la cookie la controla el cliente.
  //
  // Si Supabase no responde (red caída, variables mal configuradas), tratamos
  // la request como no autenticada en vez de devolver un 500: el usuario ve la
  // pantalla de login, no una pantalla de error.
  let user = null

  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (error) {
    console.error("[proxy] no se pudo verificar la sesión", error)
  }

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url)

    // Para volver a donde estaba después de loguearse.
    if (pathname !== "/") {
      loginUrl.searchParams.set("redirectTo", pathname + request.nextUrl.search)
    }

    return NextResponse.redirect(loginUrl)
  }

  // Ya logueado: /login no tiene sentido.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Todas las rutas menos:
     * - _next/static, _next/image  (assets del build)
     * - favicon.ico, archivos con extensión (imágenes, fuentes, etc.)
     * - /api/health, /api/cron     (los valida su propio secreto, no la sesión)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf)$).*)",
  ],
}
