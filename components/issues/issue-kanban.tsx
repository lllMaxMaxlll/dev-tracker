"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import { cn } from "@/lib/utils"
import { ClientOnly } from "@/components/ui/client-only"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import {
  PrioridadBadge,
  ProyectoBadge,
  TipoBadge,
} from "@/components/issues/issue-badges"
import { moveIssue } from "@/actions/issues"
import { ESTADOS, ETIQUETAS_ESTADO, type Estado } from "@/lib/schemas/enums"
import type { IssueListItem } from "@/lib/db/queries/issues"

function Tarjeta({
  issue,
  arrastrando,
}: {
  issue: IssueListItem
  arrastrando?: boolean
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs",
        arrastrando && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          #{issue.number}
        </span>
        <PrioridadBadge prioridad={issue.priority} />
      </div>

      <Link
        href={`/problemas/${issue.number}`}
        className="text-sm leading-snug font-medium underline-offset-4 hover:underline"
        // El click no debe iniciar un arrastre.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {issue.title}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <TipoBadge tipo={issue.type} />
        <ProyectoBadge nombre={issue.projectName} color={issue.projectColor} />
      </div>
    </div>
  )
}

function TarjetaArrastrable({ issue }: { issue: IssueListItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: issue.id, data: { issue } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className="touch-none"
      {...listeners}
      {...attributes}
    >
      <Tarjeta issue={issue} arrastrando={isDragging} />
    </div>
  )
}

function Columna({
  estado,
  issues,
}: {
  estado: Estado
  issues: IssueListItem[]
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })

  return (
    <div className="flex min-w-64 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium">{ETIQUETAS_ESTADO[estado]}</h2>
        <Badge variant="secondary">{issues.length}</Badge>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
          isOver && "border-primary bg-primary/5"
        )}
      >
        {issues.map((issue) => (
          <TarjetaArrastrable key={issue.id} issue={issue} />
        ))}

        {issues.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            Nada acá
          </p>
        ) : null}
      </div>
    </div>
  )
}

export function IssueKanban({ issues }: { issues: IssueListItem[] }) {
  const router = useRouter()
  // Copia local para poder mover la tarjeta al instante y revertir si el
  // servidor rechaza el cambio.
  const [items, setItems] = React.useState(issues)
  const [activo, setActivo] = React.useState<IssueListItem | null>(null)

  // Cuando el servidor manda datos nuevos (un refresh, un cambio de filtro),
  // hay que descartar la copia local. Se ajusta durante el render en vez de en
  // un efecto: es el patrón que recomienda React para estado derivado de props
  // y evita el render extra de un setState dentro de useEffect.
  const [issuesPrevios, setIssuesPrevios] = React.useState(issues)

  if (issues !== issuesPrevios) {
    setIssuesPrevios(issues)
    setItems(issues)
  }

  const sensors = useSensors(
    // Un umbral de 6px evita que un click se interprete como arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor)
  )

  function onDragStart(event: DragStartEvent) {
    setActivo(
      (event.active.data.current?.issue as IssueListItem | undefined) ?? null
    )
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActivo(null)

    if (!over) return

    const destino = over.id as Estado

    if (!ESTADOS.includes(destino)) return

    const issue = items.find((i) => i.id === active.id)

    if (!issue || issue.status === destino) return

    const anteriores = items
    // La tarjeta se mueve al tope de la columna destino.
    const orden =
      Math.min(
        0,
        ...items.filter((i) => i.status === destino).map((i) => i.kanbanOrder)
      ) - 1

    setItems((previos) =>
      previos.map((i) =>
        i.id === issue.id ? { ...i, status: destino, kanbanOrder: orden } : i
      )
    )

    const resultado = await moveIssue(issue.id, destino, orden)

    if (!resultado.ok) {
      setItems(anteriores)
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: `#${issue.number} → ${ETIQUETAS_ESTADO[destino]}`,
      type: "success",
    })
    router.refresh()
  }

  return (
    <ClientOnly
      fallback={
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ESTADOS.map((estado) => (
            <div key={estado} className="flex min-w-64 flex-1 flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm font-medium">
                  {ETIQUETAS_ESTADO[estado]}
                </h2>
                <Badge variant="secondary">
                  {items.filter((i) => i.status === estado).length}
                </Badge>
              </div>
              <div className="min-h-32 rounded-xl border border-dashed p-2" />
            </div>
          ))}
        </div>
      }
    >
      <DndContext
        // Sin un id estable, dnd-kit numera sus ids de accesibilidad con un
        // contador que arranca distinto en el servidor y en el cliente, y React
        // reporta un mismatch de hidratación.
        id="kanban"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ESTADOS.map((estado) => (
            <Columna
              key={estado}
              estado={estado}
              issues={items.filter((i) => i.status === estado)}
            />
          ))}
        </div>

        <DragOverlay>
          {activo ? (
            <div className="w-64 rotate-2">
              <Tarjeta issue={activo} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </ClientOnly>
  )
}
