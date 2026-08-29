"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  GitCommitHorizontalIcon,
  ListOrderedIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/toast"
import { queHagoHoy } from "@/actions/ai"
import {
  aceptarSugerencia,
  buscarVinculosDeCommits,
  rechazarSugerencia,
} from "@/actions/commit-suggestions"
import type { ItemPriorizado } from "@/lib/ai/tasks/prioritize"

/**
 * "¿Qué hago hoy?": sugerencia visual. No modifica ningún dato, sólo propone
 * un orden.
 */
export function PanelPriorizacion() {
  const [cargando, setCargando] = React.useState(false)
  const [orden, setOrden] = React.useState<ItemPriorizado[] | null>(null)
  const [titulos, setTitulos] = React.useState<Record<number, string>>({})

  async function pedir() {
    setCargando(true)
    const resultado = await queHagoHoy()
    setCargando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setOrden(resultado.data.orden)
    setTitulos(resultado.data.titulos)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          ¿Qué hago hoy?
          <Button
            size="sm"
            variant="outline"
            onClick={pedir}
            disabled={cargando}
          >
            {cargando ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ListOrderedIcon data-icon="inline-start" />
            )}
            {orden ? "Volver a sugerir" : "Sugerir"}
          </Button>
        </CardTitle>
      </CardHeader>

      {orden ? (
        <CardContent>
          {orden.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay nada que priorizar.
            </p>
          ) : (
            <>
              <ol className="flex flex-col gap-3">
                {orden.map((item, indice) => (
                  <li key={item.numero} className="flex gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                      {indice + 1}
                    </span>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Link
                        href={`/problemas/${item.numero}`}
                        className="text-sm font-medium underline-offset-4 hover:underline"
                      >
                        #{item.numero} {titulos[item.numero] ?? ""}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {item.motivo}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted-foreground">
                Es una sugerencia: no cambia nada de tus problemas.
              </p>
            </>
          )}
        </CardContent>
      ) : null}
    </Card>
  )
}

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
 * Sugerencias de vinculación de commits.
 *
 * Aceptar guarda el commit en el problema. Pasarlo a "resuelto" es una acción
 * aparte y explícita: la IA no cambia estados sola.
 */
export function PanelSugerenciasCommits({
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
        description:
          "Vinculá un repositorio desde Proyectos para poder buscar.",
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

  async function aceptar(id: string, marcarResuelto: boolean) {
    setProcesando(id)
    const resultado = await aceptarSugerencia(id, marcarResuelto)
    setProcesando(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({ title: "Commit vinculado", type: "success" })
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
          Commits que podrían resolver problemas
          <Button
            size="sm"
            variant="outline"
            onClick={buscar}
            disabled={buscando}
          >
            {buscando ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            Buscar
          </Button>
        </CardTitle>
      </CardHeader>

      {sugerencias.length > 0 ? (
        <CardContent className="flex flex-col gap-3">
          {sugerencias.map((sugerencia) => (
            <div
              key={sugerencia.id}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/problemas/${sugerencia.numero}`}
                  className="text-sm font-medium underline-offset-4 hover:underline"
                >
                  #{sugerencia.numero} {sugerencia.titulo}
                </Link>
                <Badge variant="outline" className="tabular-nums">
                  {Math.round(sugerencia.confianza * 100)}% de confianza
                </Badge>
              </div>

              <a
                href={sugerencia.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-start gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                <GitCommitHorizontalIcon className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0">
                  <code className="font-mono">
                    {sugerencia.sha.slice(0, 7)}
                  </code>{" "}
                  {sugerencia.mensaje}
                </span>
              </a>

              {sugerencia.justificacion ? (
                <p className="text-xs text-muted-foreground italic">
                  {sugerencia.justificacion}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => aceptar(sugerencia.id, true)}
                  disabled={procesando === sugerencia.id}
                >
                  <CheckIcon data-icon="inline-start" />
                  Vincular y resolver
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => aceptar(sugerencia.id, false)}
                  disabled={procesando === sugerencia.id}
                >
                  Sólo vincular
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => rechazar(sugerencia.id)}
                  disabled={procesando === sugerencia.id}
                >
                  <XIcon data-icon="inline-start" />
                  Descartar
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      ) : (
        <CardContent>
          <Alert>
            <AlertDescription>
              Sin sugerencias pendientes. Buscá para que revise los commits
              recientes de tus repos vinculados contra los problemas abiertos.
            </AlertDescription>
          </Alert>
        </CardContent>
      )}
    </Card>
  )
}
