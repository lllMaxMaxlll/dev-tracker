import { Suspense } from "react"
import type { Metadata } from "next"
import { NotebookPenIcon } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { GithubLoginButton } from "@/components/auth/github-login-button"

export const metadata: Metadata = {
  title: "Entrar · DevTracker",
}

const ERRORES: Record<string, string> = {
  no_habilitado:
    "Tu cuenta no está habilitada en esta instancia. Pedile acceso a quien la administra.",
  sin_codigo: "GitHub no devolvió el código de autorización. Probá de nuevo.",
  sesion_invalida: "No se pudo validar la sesión. Probá de nuevo.",
  error_base_de_datos:
    "Entraste, pero no se pudo guardar tu perfil. Revisá la conexión con la base.",
}

async function LoginCard({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>
}) {
  const { error, redirectTo } = await searchParams
  const mensaje = error ? (ERRORES[error] ?? error) : null

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <NotebookPenIcon className="size-5" />
        </div>
        <CardTitle className="text-xl">DevTracker</CardTitle>
        <CardDescription>
          Tu cuaderno de problemas, bugs e ideas — conectado a tus repos.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {mensaje ? (
          <Alert variant="destructive">
            <AlertTitle>No se pudo entrar</AlertTitle>
            <AlertDescription>{mensaje}</AlertDescription>
          </Alert>
        ) : null}

        <GithubLoginButton redirectTo={redirectTo} />
      </CardContent>

      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Pedimos permiso de lectura sobre tus repositorios para mostrar
          commits, ramas, PRs e issues. No escribimos nada en GitHub.
        </p>
      </CardFooter>
    </Card>
  )
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirectTo?: string }>
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <Suspense
        fallback={<Skeleton className="h-80 w-full max-w-sm rounded-xl" />}
      >
        <LoginCard searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
