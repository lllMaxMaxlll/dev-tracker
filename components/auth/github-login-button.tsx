"use client"

import * as React from "react"
import { GithubIcon } from "@/components/icons/github"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/components/ui/toast"

export function GithubLoginButton({ redirectTo }: { redirectTo?: string }) {
  const [cargando, setCargando] = React.useState(false)

  async function iniciarSesion() {
    setCargando(true)

    const supabase = createClient()
    const callback = new URL("/auth/callback", window.location.origin)

    if (redirectTo) {
      callback.searchParams.set("redirectTo", redirectTo)
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        // Necesarios para leer repos, commits, PRs e issues con Octokit.
        scopes: "read:user repo",
        redirectTo: callback.toString(),
      },
    })

    if (error) {
      setCargando(false)
      toast.add({
        title: "No se pudo iniciar sesión",
        description: error.message,
        type: "error",
      })
    }
  }

  return (
    <Button
      className="w-full"
      size="lg"
      onClick={iniciarSesion}
      disabled={cargando}
    >
      {cargando ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <GithubIcon data-icon="inline-start" />
      )}
      Continuar con GitHub
    </Button>
  )
}
