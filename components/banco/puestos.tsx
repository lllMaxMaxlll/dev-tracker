"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CheckIcon, UndoIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { toast } from "@/components/ui/toast"
import { PrioridadBadge, TipoBadge } from "@/components/issues/issue-badges"
import { changeIssueStatus } from "@/actions/issues"
import type { Estado } from "@/lib/schemas/enums"

export type Puesto = {
  id: string
  number: number
  title: string
  type: string
  priority: string
  projectName: string | null
  areaName: string | null
  /** Horas de trabajo desde que entró al banco, ya formateadas. */
  lleva: string | null
}

/**
 * Los puestos del banco: lo que está en progreso, con un hueco por cada
 * puesto libre. Terminar la cierra; soltar la devuelve a la cola.
 */
export function Puestos({
  puestos,
  capacidad,
}: {
  puestos: Puesto[]
  capacidad: number
}) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState<string | null>(null)

  async function mover(puesto: Puesto, hacia: Estado) {
    setOcupado(puesto.id)
    const resultado = await changeIssueStatus({ id: puesto.id, status: hacia })
    setOcupado(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title:
        hacia === "resuelto"
          ? `#${puesto.number} terminada`
          : `#${puesto.number} volvió a la cola`,
      type: "success",
    })
    router.refresh()
  }

  const libres = Math.max(0, capacidad - puestos.length)
  const exceso = puestos.length - capacidad

  return (
    <div className="flex flex-col gap-3">
      {exceso > 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Hay {puestos.length} órdenes en progreso y el banco tiene{" "}
          {capacidad} puestos. Terminá o soltá {exceso === 1 ? "una" : exceso}{" "}
          antes de tomar otra.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {puestos.map((puesto, i) => (
          <article
            key={puesto.id}
            className="relative flex min-h-44 flex-col gap-2 rounded-md border bg-card p-4"
          >
            {/* Franja de "zona de trabajo" sólo en el primero: es el que lleva
                más tiempo en el banco. */}
            {i === 0 ? (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 rounded-t-md bg-[repeating-linear-gradient(-45deg,var(--primary)_0_8px,transparent_8px_16px)]"
              />
            ) : null}
            <span className="font-mono text-xs text-muted-foreground uppercase">
              #{puesto.number}
              {puesto.projectName ? ` · ${puesto.projectName}` : ""}
              {puesto.areaName ? `/${puesto.areaName}` : ""}
            </span>
            <Link
              href={`/ordenes/${puesto.number}`}
              className="font-semibold leading-snug underline-offset-4 hover:underline"
            >
              {puesto.title}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <TipoBadge tipo={puesto.type} />
              <PrioridadBadge prioridad={puesto.priority} />
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-2">
              <span className="font-mono text-xs font-bold text-primary">
                {puesto.lleva ?? "recién"}
              </span>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={ocupado === puesto.id}
                  onClick={() => mover(puesto, "pendiente")}
                  title="Devolver a la cola"
                >
                  <UndoIcon data-icon="inline-start" />
                  Soltar
                </Button>
                <Button
                  size="sm"
                  disabled={ocupado === puesto.id}
                  onClick={() => mover(puesto, "resuelto")}
                >
                  <CheckIcon data-icon="inline-start" />
                  Terminar
                </Button>
              </div>
            </div>
          </article>
        ))}

        {Array.from({ length: libres }, (_, i) => (
          <div
            key={`libre-${i}`}
            className={cn(
              "flex min-h-44 flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground"
            )}
          >
            <span className="font-semibold">Puesto libre</span>
            <span className="text-xs">
              Tomá algo de la cola con <Kbd>1</Kbd>–<Kbd>5</Kbd>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
