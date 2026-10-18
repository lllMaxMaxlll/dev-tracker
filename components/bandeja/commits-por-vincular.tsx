"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRightIcon,
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
          Commits por vincular
          {sugerencias.length > 0 ? (
            <span className="font-mono tracking-normal [font-stretch:100%]">
              {" "}
              · {sugerencias.length}
            </span>
          ) : null}
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={buscar}
          disabled={buscando}
          title="Revisa los commits recientes de los repos vinculados"
        >
          {buscando ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Buscar
        </Button>
      </div>

      {sugerencias.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Nada pendiente. «Buscar» compara los commits recientes de los repos
          vinculados con las órdenes abiertas.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {sugerencias.map((sugerencia) => (
            <li
              key={sugerencia.id}
              className="flex flex-col gap-3 rounded-md border bg-card p-4"
            >
              <div className="flex flex-col gap-1.5 text-sm">
                <a
                  href={sugerencia.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 underline-offset-4 hover:underline"
                >
                  <GitCommitHorizontalIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <code className="font-mono text-xs text-muted-foreground">
                      {sugerencia.sha.slice(0, 7)}
                    </code>{" "}
                    {sugerencia.mensaje}
                  </span>
                </a>
                <Link
                  href={`/ordenes/${sugerencia.numero}`}
                  className="flex items-start gap-2 font-semibold underline-offset-4 hover:underline"
                >
                  <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-muted-foreground">
                      #{sugerencia.numero}
                    </span>{" "}
                    {sugerencia.titulo}
                  </span>
                </Link>
                <p className="pl-6 text-xs text-muted-foreground">
                  <span className="font-mono text-amber-600 dark:text-amber-400">
                    {Math.round(sugerencia.confianza * 100)}%
                  </span>
                  {sugerencia.justificacion
                    ? ` · ${sugerencia.justificacion}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
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
                  <XIcon data-icon="inline-start" />
                  No es
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
