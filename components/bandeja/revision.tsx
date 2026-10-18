"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, CopyIcon, PencilIcon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  AreaBadge,
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import {
  IssueFormDialog,
  type AreaOpcion,
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"
import { marcarRevisada } from "@/actions/bandeja"
import { changeIssueStatus } from "@/actions/issues"
import { buscarRelacionados, vincularProblemas } from "@/actions/duplicates"
import { haceCuanto } from "@/lib/utils/fechas"
import type { Similar } from "@/lib/ai/embeddings"
import type { IssueFormValues } from "@/lib/schemas/issue"

export type OrdenParaRevisar = {
  id: string
  number: number
  title: string
  description: string | null
  type: string
  priority: string
  status: string
  projectId: string | null
  areaId: string | null
  projectName: string | null
  projectColor: string | null
  areaName: string | null
  areaColor: string | null
  createdVia: string
  createdAt: Date
}

function editandoTexto(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/**
 * Revisión de la Bandeja, de a una orden.
 *
 * Aceptar confirma lo que eligió la IA; editar abre el formulario y, al
 * guardar, la da por revisada; descartar la cierra como descartada. Las teclas
 * actúan siempre sobre la primera: es una pila que se vacía de arriba.
 *
 * X y no D para descartar: D ya cambia el tema en toda la app.
 */
export function Revision({
  ordenes,
  proyectos,
  areas,
}: {
  ordenes: OrdenParaRevisar[]
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
}) {
  const router = useRouter()
  const [ocupada, setOcupada] = React.useState(false)
  const [editando, setEditando] = React.useState<OrdenParaRevisar | null>(null)
  const [parecidos, setParecidos] = React.useState<Similar[] | null>(null)
  const [buscando, setBuscando] = React.useState(false)

  const actual = ordenes[0]
  const siguientes = ordenes.slice(1)

  // Al pasar a la siguiente orden, los parecidos de la anterior ya no valen.
  const [actualPrevia, setActualPrevia] = React.useState(actual?.id)

  if (actual?.id !== actualPrevia) {
    setActualPrevia(actual?.id)
    setParecidos(null)
  }

  const aceptar = React.useCallback(
    async (orden: OrdenParaRevisar) => {
      setOcupada(true)
      const resultado = await marcarRevisada(orden.id)
      setOcupada(false)

      if (!resultado.ok) {
        toast.add({ title: resultado.error, type: "error" })

        return
      }

      toast.add({ title: `#${orden.number} aceptada`, type: "success" })
      router.refresh()
    },
    [router]
  )

  const descartar = React.useCallback(
    async (orden: OrdenParaRevisar, duplicadaDe?: Similar) => {
      setOcupada(true)

      if (duplicadaDe) {
        const vinculo = await vincularProblemas({
          issueId: orden.id,
          relatedIssueId: duplicadaDe.id,
          kind: "duplicado",
          similitud: duplicadaDe.similitud,
        })

        if (!vinculo.ok) {
          setOcupada(false)
          toast.add({ title: vinculo.error, type: "error" })

          return
        }
      }

      const cambio = await changeIssueStatus({
        id: orden.id,
        status: "descartado",
        note: duplicadaDe ? `Duplicada de #${duplicadaDe.number}` : undefined,
      })
      const revision = cambio.ok ? await marcarRevisada(orden.id) : cambio
      setOcupada(false)

      if (!revision.ok) {
        toast.add({ title: revision.error, type: "error" })

        return
      }

      toast.add({
        title: duplicadaDe
          ? `#${orden.number} descartada: duplicada de #${duplicadaDe.number}`
          : `#${orden.number} descartada`,
        type: "success",
      })
      router.refresh()
    },
    [router]
  )

  const buscarParecidos = React.useCallback(async (orden: OrdenParaRevisar) => {
    setBuscando(true)
    setParecidos(await buscarRelacionados(orden.id))
    setBuscando(false)
  }, [])

  React.useEffect(() => {
    if (!actual || editando) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (event.defaultPrevented || editandoTexto(event.target)) return
      // Con un diálogo abierto, las teclas son del diálogo.
      if (document.querySelector("[role=dialog]")) return

      const tecla = event.key.toLowerCase()

      if (tecla === "enter") {
        event.preventDefault()
        aceptar(actual)
      } else if (tecla === "e") {
        event.preventDefault()
        setEditando(actual)
      } else if (tecla === "x") {
        event.preventDefault()
        descartar(actual)
      } else if (tecla === "p") {
        event.preventDefault()
        buscarParecidos(actual)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [actual, editando, aceptar, descartar, buscarParecidos])

  if (!actual) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
        <span className="font-bold tracking-wide uppercase [font-stretch:125%]">
          Bandeja vacía
        </span>
        <p className="max-w-md text-sm text-muted-foreground">
          Lo que anotes con «A la bandeja», o dictando con la tecla V, aparece
          acá para que confirmes cómo lo clasificó la IA.
        </p>
      </div>
    )
  }

  const valoresDe = (orden: OrdenParaRevisar): Partial<IssueFormValues> => ({
    title: orden.title,
    description: orden.description ?? "",
    projectId: orden.projectId ?? "",
    areaId: orden.areaId ?? "",
    type: orden.type as IssueFormValues["type"],
    priority: orden.priority as IssueFormValues["priority"],
    status: orden.status as IssueFormValues["status"],
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Una barra por orden: la naranja es la que estás revisando. */}
      <div className="flex gap-1" aria-hidden="true">
        {ordenes.slice(0, 12).map((orden, i) => (
          <span
            key={orden.id}
            className={i === 0 ? "h-1 flex-1 bg-primary" : "h-1 flex-1 bg-border"}
          />
        ))}
      </div>

      <article className="overflow-hidden rounded-md border bg-card">
        <div className="flex flex-col gap-3 p-5">
          <span className="font-mono text-xs text-muted-foreground">
            #{actual.number} ·{" "}
            {actual.createdVia === "ai_capture" ? "captura rápida" : "a mano"} ·{" "}
            {haceCuanto(actual.createdAt)}
          </span>
          <h2 className="text-xl font-bold leading-snug">
            <Link
              href={`/ordenes/${actual.number}`}
              className="underline-offset-4 hover:underline"
            >
              {actual.title}
            </Link>
          </h2>
          {actual.description ? (
            <p className="line-clamp-4 text-sm whitespace-pre-line text-muted-foreground">
              {actual.description}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 pt-1 sm:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[0.7rem] text-muted-foreground uppercase">
                Tipo
              </dt>
              <dd>
                <TipoBadge tipo={actual.type} />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[0.7rem] text-muted-foreground uppercase">
                Prioridad
              </dt>
              <dd>
                <PrioridadBadge prioridad={actual.priority} />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[0.7rem] text-muted-foreground uppercase">
                Proyecto
              </dt>
              <dd>
                <ProyectoBadge
                  nombre={actual.projectName}
                  color={actual.projectColor}
                />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="font-mono text-[0.7rem] text-muted-foreground uppercase">
                Área
              </dt>
              <dd>
                {actual.areaName ? (
                  <AreaBadge nombre={actual.areaName} color={actual.areaColor} />
                ) : (
                  <span className="text-sm text-muted-foreground">Sin área</span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {parecidos !== null ? (
          <div className="border-t bg-muted/40 px-5 py-3">
            {parecidos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No encontré órdenes parecidas.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {parecidos.slice(0, 4).map((similar) => (
                  <li
                    key={similar.id}
                    className="flex flex-wrap items-center gap-2 text-sm"
                  >
                    <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                      ≈ {Math.round(similar.similitud * 100)} %
                    </span>
                    <Link
                      href={`/ordenes/${similar.number}`}
                      className="min-w-0 flex-1 truncate underline-offset-4 hover:underline"
                    >
                      #{similar.number} {similar.title}
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ocupada}
                      onClick={() => descartar(actual, similar)}
                    >
                      <CopyIcon data-icon="inline-start" />
                      Es duplicada
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-2 border-t sm:grid-cols-4">
          <BotonDeTecla
            tecla="↵"
            onClick={() => aceptar(actual)}
            disabled={ocupada}
            destacado
          >
            {ocupada ? <Spinner /> : <CheckIcon />}
            Aceptar
          </BotonDeTecla>
          <BotonDeTecla
            tecla="E"
            onClick={() => setEditando(actual)}
            disabled={ocupada}
          >
            <PencilIcon />
            Editar
          </BotonDeTecla>
          <BotonDeTecla
            tecla="P"
            onClick={() => buscarParecidos(actual)}
            disabled={ocupada || buscando}
          >
            {buscando ? <Spinner /> : <SearchIcon />}
            Parecidas
          </BotonDeTecla>
          <BotonDeTecla
            tecla="X"
            onClick={() => descartar(actual)}
            disabled={ocupada}
          >
            <XIcon />
            Descartar
          </BotonDeTecla>
        </div>
      </article>

      {siguientes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
            Después · {siguientes.length}
          </h3>
          <ul className="divide-y border-y">
            {siguientes.map((orden) => (
              <li
                key={orden.id}
                className="flex items-center gap-3 py-2 text-sm"
              >
                <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                  #{orden.number}
                </span>
                <TipoBadge tipo={orden.type} />
                <span className="min-w-0 flex-1 truncate">{orden.title}</span>
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
                  {orden.projectName ?? "sin proyecto"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <IssueFormDialog
        open={editando !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setEditando(null)
        }}
        proyectos={proyectos}
        areas={areas}
        issueId={editando?.id}
        valoresIniciales={editando ? valoresDe(editando) : undefined}
        encabezado={
          <p className="text-sm text-muted-foreground">
            Al guardar, la orden sale de la Bandeja.
          </p>
        }
        onGuardado={() => {
          if (editando) aceptar(editando)
        }}
      />
    </div>
  )
}

function BotonDeTecla({
  tecla,
  destacado,
  children,
  ...props
}: React.ComponentProps<"button"> & { tecla: string; destacado?: boolean }) {
  return (
    <button
      type="button"
      className={
        destacado
          ? "flex items-center justify-center gap-2 border-r py-3 text-sm font-semibold text-emerald-700 transition-colors last:border-r-0 hover:bg-muted disabled:opacity-50 dark:text-emerald-400 [&_svg]:size-4"
          : "flex items-center justify-center gap-2 border-r py-3 text-sm font-semibold transition-colors last:border-r-0 hover:bg-muted disabled:opacity-50 [&_svg]:size-4"
      }
      {...props}
    >
      {children}
      <Kbd>{tecla}</Kbd>
    </button>
  )
}
