"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpIcon, SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { PrioridadBadge, TipoBadge } from "@/components/issues/issue-badges"
import { changeIssueStatus } from "@/actions/issues"
import { queHagoHoy } from "@/actions/ai"

export type ItemDeCola = {
  id: string
  number: number
  title: string
  type: string
  priority: string
  projectName: string | null
}

type Fila = {
  id: string | null
  number: number
  title: string
  type: string | null
  priority: string | null
  projectName: string | null
  /** Sólo en el orden de la IA: por qué conviene atacarla. */
  motivo: string | null
  /** Las sugeridas que ya están en el banco no se pueden volver a tomar. */
  enBanco: boolean
}

function editandoTexto(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/**
 * La cola del banco.
 *
 * De entrada va por prioridad y antigüedad, sin gastar nada. "Ordenar con IA"
 * pide la priorización: es una sugerencia, no cambia ningún dato. Las teclas
 * 1 a 5 pasan esa fila al banco.
 */
export function Cola({
  items,
  bancoLleno,
}: {
  items: ItemDeCola[]
  bancoLleno: boolean
}) {
  const router = useRouter()
  const [ordenIa, setOrdenIa] = React.useState<Fila[] | null>(null)
  const [pidiendo, setPidiendo] = React.useState(false)
  const [tomando, setTomando] = React.useState<string | null>(null)

  const filas: Fila[] =
    ordenIa ??
    items.map((item) => ({ ...item, motivo: null, enBanco: false }))

  async function ordenarConIa() {
    setPidiendo(true)
    const resultado = await queHagoHoy()
    setPidiendo(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    const { orden, ordenes } = resultado.data
    const porNumero = new Map(items.map((item) => [item.number, item]))

    setOrdenIa(
      orden.flatMap((sugerida) => {
        const datos = ordenes[sugerida.numero]

        if (!datos) return []

        const deLaCola = porNumero.get(sugerida.numero)

        return [
          {
            id: datos.id,
            number: sugerida.numero,
            title: datos.title,
            type: deLaCola?.type ?? null,
            priority: deLaCola?.priority ?? null,
            projectName: deLaCola?.projectName ?? null,
            motivo: sugerida.motivo,
            enBanco: datos.status === "en_progreso",
          },
        ]
      })
    )
  }

  const tomar = React.useCallback(
    async (fila: Fila) => {
      if (!fila.id || fila.enBanco) return

      if (bancoLleno) {
        toast.add({
          title: "El banco está lleno",
          description: "Terminá o soltá una orden antes de tomar otra.",
          type: "warning",
        })

        return
      }

      setTomando(fila.id)
      const resultado = await changeIssueStatus({
        id: fila.id,
        status: "en_progreso",
      })
      setTomando(null)

      if (!resultado.ok) {
        toast.add({ title: resultado.error, type: "error" })

        return
      }

      setOrdenIa((previo) =>
        previo ? previo.filter((otra) => otra.id !== fila.id) : previo
      )
      toast.add({ title: `#${fila.number} al banco`, type: "success" })
      router.refresh()
    },
    [bancoLleno, router]
  )

  // Las filas se leen desde un ref para que el listener no se registre de
  // nuevo con cada cambio de la lista.
  const filasRef = React.useRef(filas)

  React.useEffect(() => {
    filasRef.current = filas
  })

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return
      if (editandoTexto(event.target)) return

      const indice = Number(event.key) - 1

      if (!Number.isInteger(indice) || indice < 0 || indice > 4) return

      const fila = filasRef.current[indice]

      if (fila) {
        event.preventDefault()
        tomar(fila)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [tomar])

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
          Cola · {ordenIa ? "ordenada por la IA" : "por prioridad"}
        </h2>
        <div className="flex gap-1">
          {ordenIa ? (
            <Button size="sm" variant="ghost" onClick={() => setOrdenIa(null)}>
              Volver al orden por prioridad
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={ordenarConIa}
            disabled={pidiendo}
          >
            {pidiendo ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            {ordenIa ? "Volver a ordenar" : "Ordenar con IA"}
          </Button>
        </div>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No hay nada pendiente. La cola está vacía.
        </p>
      ) : (
        <ol className="divide-y border-y">
          {filas.map((fila, i) => (
            <li
              key={fila.number}
              className="flex items-center gap-3 py-2.5 text-sm"
            >
              <Kbd className="shrink-0">{i < 5 ? i + 1 : "·"}</Kbd>
              <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                #{fila.number}
              </span>
              {fila.type ? (
                <span className="hidden shrink-0 sm:inline-flex">
                  <TipoBadge tipo={fila.type} />
                </span>
              ) : null}
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/ordenes/${fila.number}`}
                  className="truncate font-medium underline-offset-4 hover:underline"
                >
                  {fila.title}
                </Link>
                {fila.motivo ? (
                  <span className="text-xs text-muted-foreground">
                    ↳ {fila.motivo}
                  </span>
                ) : null}
              </div>
              {fila.projectName ? (
                <span className="hidden shrink-0 font-mono text-xs text-muted-foreground md:inline">
                  {fila.projectName}
                </span>
              ) : null}
              {fila.priority ? (
                <span className="hidden shrink-0 lg:inline-flex">
                  <PrioridadBadge prioridad={fila.priority} />
                </span>
              ) : null}
              {fila.enBanco ? (
                <span className="shrink-0 font-mono text-xs text-primary">
                  en el banco
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  disabled={tomando === fila.id}
                  onClick={() => tomar(fila)}
                  title="Pasar al banco"
                >
                  {tomando === fila.id ? (
                    <Spinner />
                  ) : (
                    <ArrowUpIcon />
                  )}
                  <span className="sr-only">Pasar al banco</span>
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}

      {ordenIa ? (
        <p className="text-xs text-muted-foreground">
          Es una sugerencia: no cambia nada de tus órdenes.
        </p>
      ) : null}
    </div>
  )
}
