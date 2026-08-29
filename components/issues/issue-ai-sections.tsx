"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import { ListaRelacionados } from "@/components/issues/similar-issues"
import { ayudameACompletar } from "@/actions/ai"
import { buscarRelacionados, vincularProblemas } from "@/actions/duplicates"
import { updateIssue } from "@/actions/issues"
import type { Similar } from "@/lib/ai/embeddings"
import type { Enriquecimiento } from "@/lib/ai/tasks/enrich"
import type { IssueFormValues } from "@/lib/schemas/issue"

export function SeccionRelacionados({
  issueId,
  vinculadosIniciales,
}: {
  issueId: string
  vinculadosIniciales: string[]
}) {
  const router = useRouter()
  const [similares, setSimilares] = React.useState<Similar[] | null>(null)
  const [cargando, setCargando] = React.useState(false)
  const [vinculados, setVinculados] = React.useState(
    () => new Set(vinculadosIniciales)
  )

  async function buscar() {
    setCargando(true)
    setSimilares(await buscarRelacionados(issueId))
    setCargando(false)
  }

  async function vincular(similar: Similar) {
    const resultado = await vincularProblemas({
      issueId,
      relatedIssueId: similar.id,
      similitud: similar.similitud,
    })

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setVinculados((previos) => new Set(previos).add(similar.id))
    toast.add({ title: "Vinculado", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {similares === null ? (
        <Button
          variant="outline"
          size="sm"
          onClick={buscar}
          disabled={cargando}
        >
          {cargando ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <SparklesIcon data-icon="inline-start" />
          )}
          Buscar parecidos
        </Button>
      ) : (
        <ListaRelacionados
          similares={similares}
          vinculados={vinculados}
          onVincular={vincular}
        />
      )}
    </div>
  )
}

/**
 * "Ayudame a completarlo".
 *
 * Las sugerencias se muestran aparte; insertar en la descripción es un clic
 * explícito y va al final de lo que ya escribiste, sin pisar nada.
 */
export function SeccionEnriquecer({
  issueId,
  valoresActuales,
}: {
  issueId: string
  valoresActuales: IssueFormValues
}) {
  const router = useRouter()
  const [cargando, setCargando] = React.useState(false)
  const [insertando, setInsertando] = React.useState(false)
  const [sugerencias, setSugerencias] = React.useState<Enriquecimiento | null>(
    null
  )

  async function pedir() {
    setCargando(true)
    const resultado = await ayudameACompletar(issueId)
    setCargando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setSugerencias(resultado.data)
  }

  async function insertar(texto: string) {
    setInsertando(true)

    const descripcion = [valoresActuales.description?.trim(), texto]
      .filter(Boolean)
      .join("\n\n")

    const resultado = await updateIssue({
      ...valoresActuales,
      description: descripcion,
      id: issueId,
    })

    setInsertando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({ title: "Agregado a la descripción", type: "success" })
    router.refresh()
  }

  if (!sugerencias) {
    return (
      <Button variant="outline" size="sm" onClick={pedir} disabled={cargando}>
        {cargando ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SparklesIcon data-icon="inline-start" />
        )}
        Ayudame a completarlo
      </Button>
    )
  }

  const vacio =
    sugerencias.faltantes.length === 0 &&
    sugerencias.causas.length === 0 &&
    !sugerencias.pasosSugeridos

  if (vacio) {
    return (
      <p className="text-sm text-muted-foreground">
        No se me ocurre nada para agregar: el problema ya está bastante
        completo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {sugerencias.faltantes.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Qué falta</h3>
          <ul className="flex flex-col gap-1.5">
            {sugerencias.faltantes.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                <span className="min-w-0 flex-1">{item}</span>
              </li>
            ))}
          </ul>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            disabled={insertando}
            onClick={() =>
              insertar(
                `## Qué falta averiguar\n\n${sugerencias.faltantes.map((f) => `- ${f}`).join("\n")}`
              )
            }
          >
            <PlusIcon data-icon="inline-start" />
            Agregar a la descripción
          </Button>
        </div>
      ) : null}

      {sugerencias.causas.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Posibles causas</h3>
          <div className="flex flex-wrap gap-1.5">
            {sugerencias.causas.map((causa) => (
              <Badge key={causa} variant="secondary" className="font-normal">
                {causa}
              </Badge>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            disabled={insertando}
            onClick={() =>
              insertar(
                `## Posibles causas\n\n${sugerencias.causas.map((c) => `- ${c}`).join("\n")}`
              )
            }
          >
            <PlusIcon data-icon="inline-start" />
            Agregar a la descripción
          </Button>
        </div>
      ) : null}

      {sugerencias.pasosSugeridos ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Borrador sugerido</h3>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
            {sugerencias.pasosSugeridos}
          </pre>
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            disabled={insertando}
            onClick={() => insertar(sugerencias.pasosSugeridos)}
          >
            <PlusIcon data-icon="inline-start" />
            Agregar a la descripción
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Son sugerencias: nada se agrega a la descripción hasta que lo pidas.
      </p>
    </div>
  )
}
