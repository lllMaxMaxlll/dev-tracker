"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  GitCommitHorizontalIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  aceptarSugerencia,
  buscarVinculosDeCommits,
  rechazarSugerencia,
} from "@/actions/commit-suggestions"

export type SugerenciaCommit = {
  id: string
  numero: number
  titulo: string
  repo: string
  sha: string
  url: string
  mensaje: string | null
  confianza: number
  justificacion: string | null
}

/**
 * Commits que la IA cree que resuelven una orden.
 *
 * Vincular guarda el commit en la orden. Cerrarla es una acción aparte y
 * explícita: la IA no cambia estados sola.
 */
export function CommitsPorVincular({
  sugerencias,
}: {
  sugerencias: SugerenciaCommit[]
}) {
  const router = useRouter()
  const [buscando, setBuscando] = React.useState(false)
  const [procesando, setProcesando] = React.useState<string | null>(null)

  async function buscar() {
    setBuscando(true)
    const resultado = await buscarVinculosDeCommits()
    setBuscando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    if (resultado.data.sinRepos) {
      toast.add({
        title: "Ningún proyecto tiene repo vinculado",
        description: "Vinculá un repositorio desde Planta → Proyectos.",
        type: "info",
      })

      return
    }

    toast.add({
      title:
        resultado.data.nuevas > 0
          ? `${resultado.data.nuevas} sugerencia${resultado.data.nuevas === 1 ? "" : "s"} nueva${resultado.data.nuevas === 1 ? "" : "s"}`
          : "No encontré vínculos nuevos",
      type: resultado.data.nuevas > 0 ? "success" : "info",
    })
    router.refresh()
  }

  async function aceptar(id: string, cerrar: boolean) {
    setProcesando(id)
    const resultado = await aceptarSugerencia(id, cerrar)
    setProcesando(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: cerrar ? "Commit vinculado y orden cerrada" : "Commit vinculado",
      type: "success",
    })
    router.refresh()
  }

  async function rechazar(id: string) {
    setProcesando(id)
    const resultado = await rechazarSugerencia(id)
    setProcesando(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    router.refresh()
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
          Commits por vincular · {sugerencias.length}
        </h2>
        <Button size="sm" variant="outline" onClick={buscar} disabled={buscando}>
          {buscando ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Buscar en los commits recientes
        </Button>
      </div>

      {sugerencias.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nada pendiente. «Buscar» revisa los commits recientes de los repos
          vinculados contra las órdenes abiertas.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {sugerencias.map((sugerencia) => (
            <li
              key={sugerencia.id}
              className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:gap-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a
                  href={sugerencia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-start gap-1.5 text-sm underline-offset-4 hover:underline"
                >
                  <GitCommitHorizontalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <code className="font-mono text-xs">
                      {sugerencia.sha.slice(0, 7)}
                    </code>{" "}
                    {sugerencia.mensaje}
                  </span>
                </a>
                <span className="text-xs text-muted-foreground">
                  →{" "}
                  <Link
                    href={`/ordenes/${sugerencia.numero}`}
                    className="font-semibold text-foreground underline-offset-4 hover:underline"
                  >
                    #{sugerencia.numero} {sugerencia.titulo}
                  </Link>{" "}
                  ·{" "}
                  <span className="font-mono">
                    {Math.round(sugerencia.confianza * 100)} %
                  </span>
                  {sugerencia.justificacion
                    ? ` · ${sugerencia.justificacion}`
                    : ""}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <Button
                  size="sm"
                  onClick={() => aceptar(sugerencia.id, false)}
                  disabled={procesando === sugerencia.id}
                >
                  <CheckIcon data-icon="inline-start" />
                  Vincular
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => aceptar(sugerencia.id, true)}
                  disabled={procesando === sugerencia.id}
                >
                  Vincular y cerrar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rechazar(sugerencia.id)}
                  disabled={procesando === sugerencia.id}
                >
                  <XIcon />
                  <span className="sr-only">No es</span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
