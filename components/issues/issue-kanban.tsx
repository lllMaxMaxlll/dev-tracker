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
  type DragOverEvent,
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

/**
 * Distancia desde el borde de la ventana a la que se pinean los encabezados
 * mientras se arrastra. El header de la app mide 56px (`h-14`) y queda fijo
 * arriba de todo, así que la barra entra justo debajo con un poco de aire.
 */
const TOP_PINEADO = 64

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
    <div className="flex w-64 shrink-0 flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-medium">{ETIQUETAS_ESTADO[estado]}</h2>
        <Badge variant="secondary">{issues.length}</Badge>
      </div>

      {/* `flex-1` es lo que iguala el alto de todas las columnas: la fila las
          estira hasta la más larga y la zona soltable llega hasta abajo. Sin
          esto, una columna con dos tarjetas termina cientos de píxeles arriba y
          deja de ser un destino posible para una tarjeta que está al fondo. */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-32 flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors",
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

/** Geometría del tablero, para alinear la barra pineada con las columnas. */
type Geometria = {
  left: number
  width: number
  scrollLeft: number
  /** Los encabezados reales ya se fueron de pantalla. */
  tapados: boolean
}

/**
 * Copia de los encabezados fija a la ventana. Aparece solo mientras se arrastra
 * y solo si los encabezados de verdad quedaron fuera de pantalla, así el
 * usuario sabe a qué estado corresponde cada columna sin tener que volver
 * arriba. Es puramente visual (`pointer-events-none`): quien recibe el drop
 * sigue siendo la columna, que ahora llega hasta el fondo del tablero.
 */
function EncabezadosPineados({
  geometria,
  sobre,
  conteos,
}: {
  geometria: Geometria
  sobre: Estado | null
  conteos: Record<Estado, number>
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-30 animate-in overflow-hidden duration-100 fade-in-0 slide-in-from-top-1"
      style={{
        top: TOP_PINEADO,
        left: geometria.left,
        width: geometria.width,
      }}
    >
      <div
        className="flex gap-4"
        // Acompaña el scroll horizontal del tablero para que cada chip quede
        // sobre su columna.
        style={{ transform: `translateX(${-geometria.scrollLeft}px)` }}
      >
        {ESTADOS.map((estado) => (
          <div
            key={estado}
            className={cn(
              "flex w-64 shrink-0 items-center justify-between rounded-lg border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur transition-colors",
              sobre === estado && "border-primary bg-primary/10"
            )}
          >
            <span className="text-sm font-medium">
              {ETIQUETAS_ESTADO[estado]}
            </span>
            <Badge variant={sobre === estado ? "default" : "secondary"}>
              {conteos[estado]}
            </Badge>
          </div>
        ))}
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
  const [sobre, setSobre] = React.useState<Estado | null>(null)
  const [geometria, setGeometria] = React.useState<Geometria | null>(null)
  const tableroRef = React.useRef<HTMLDivElement>(null)

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

  const medir = React.useCallback(() => {
    const nodo = tableroRef.current

    if (!nodo) return

    const rect = nodo.getBoundingClientRect()

    setGeometria({
      left: rect.left,
      width: rect.width,
      scrollLeft: nodo.scrollLeft,
      tapados: rect.top < TOP_PINEADO,
    })
  }, [])

  // La barra sigue al tablero mientras dura el arrastre: la página puede
  // scrollear sola (dnd-kit auto-scrollea al llegar a los bordes) y el tablero
  // puede moverse en horizontal.
  React.useEffect(() => {
    if (!activo) return

    medir()

    // En captura para enterarse también del scroll del tablero, que no burbujea.
    window.addEventListener("scroll", medir, true)
    window.addEventListener("resize", medir)

    return () => {
      window.removeEventListener("scroll", medir, true)
      window.removeEventListener("resize", medir)
    }
  }, [activo, medir])

  const conteos = React.useMemo(
    () =>
      Object.fromEntries(
        ESTADOS.map((estado) => [
          estado,
          items.filter((i) => i.status === estado).length,
        ])
      ) as Record<Estado, number>,
    [items]
  )

  function onDragStart(event: DragStartEvent) {
    setActivo(
      (event.active.data.current?.issue as IssueListItem | undefined) ?? null
    )
  }

  function onDragOver(event: DragOverEvent) {
    const destino = event.over?.id as Estado | undefined

    setSobre(destino && ESTADOS.includes(destino) ? destino : null)
  }

  function onDragCancel() {
    setActivo(null)
    setSobre(null)
  }

  async function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActivo(null)
    setSobre(null)

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
        <div className="flex w-full min-w-0 gap-4 overflow-x-auto pb-4">
          {ESTADOS.map((estado) => (
            <div key={estado} className="flex w-64 shrink-0 flex-col gap-2">
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
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* `items-stretch` iguala el alto de las columnas; junto con el `flex-1`
            de la zona soltable, cualquier altura del tablero es un destino
            válido para las cinco. */}
        <div
          ref={tableroRef}
          className="flex w-full min-w-0 items-stretch gap-4 overflow-x-auto pb-4"
        >
          {ESTADOS.map((estado) => (
            <Columna
              key={estado}
              estado={estado}
              issues={items.filter((i) => i.status === estado)}
            />
          ))}
        </div>

        {activo && geometria?.tapados ? (
          <EncabezadosPineados
            geometria={geometria}
            sobre={sobre}
            conteos={conteos}
          />
        ) : null}

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
