import Link from "next/link"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * Banner de reconexión. Aparece cuando el token de GitHub caducó, fue revocado
 * o nunca existió. El resto de la app no depende de GitHub, así que esto NO
 * rompe la página: sólo reemplaza la sección que necesitaba la API.
 */
export function GithubReconectar({ mensaje }: { mensaje: string }) {
  return (
    <Alert variant="destructive">
      <AlertTitle>Se perdió el acceso a GitHub</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{mensaje}</span>
        <Button
          variant="outline"
          size="sm"
          // Base UI avisa si un componente con semántica de botón no renderiza
          // un <button> nativo. Acá es un enlace a propósito.
          nativeButton={false}
          render={<Link href="/login" />}
        >
          Volver a autorizar
        </Button>
      </AlertDescription>
    </Alert>
  )
}
