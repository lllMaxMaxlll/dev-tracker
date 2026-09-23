"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
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
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowLeftIcon,
  PencilIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { ClientOnly } from "@/components/ui/client-only"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { EnumSelect } from "@/components/ui/enum-select"
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
import {
  archiveIssue,
  getIssueFormValues,
  moveIssue,
  setAutoArchivoKanban,
} from "@/actions/issues"
import { ESTADOS, ETIQUETAS_ESTADO, type Estado } from "@/lib/schemas/enums"
import { DIAS_AUTO_ARCHIVO } from "@/lib/schemas/issue"
import { conParametros } from "@/lib/utils/search-params"
import type { IssueListItem } from "@/lib/db/queries/issues"
import type { IssueFormValues } from "@/lib/schemas/issue"

/**
 * Distancia desde el borde de la ventana a la que se pinean los encabezados
 * mientras se arrastra. El header de la app mide 56px (`h-14`) y queda fijo
 * arriba de todo, así que la barra entra justo debajo con un poco de aire.
 */
const TOP_PINEADO = 64

/**
 * Ancho de una columna del tablero.
 *
 * `flex-1 basis-0` reparte el ancho disponible en partes iguales, así el
 * tablero ocupa toda la vista en lugar de dejar un hueco a la derecha.
 * `min-w-56` es el piso: por debajo de eso el contenedor scrollea en
 * horizontal en vez de aplastar las tarjetas.
 *
 * Lo usan la columna real, el esqueleto y los chips del encabezado fijo. Los
 * chips se posicionan calcando el ancho de las columnas, así que si los tres
 * no comparten estas clases dejan de estar alineados.
 */
const CLASES_COLUMNA = "min-w-56 flex-1 basis-0"

/**
 * Qué hace el botón de la tarjeta: archivar en el tablero, desarchivar en la
 * vista de archivadas.
 */
type AccionArchivo = {
  archivada: boolean
  onClick: (issue: IssueListItem) => void
}

/** Abrir el formulario de edición desde la tarjeta. */
type AccionEditar = {
  /** Id de la tarjeta cuyos datos se están pidiendo, si hay alguna. */
  abriendo: string | null
  onClick: (issue: IssueListItem) => void
}

/**
 * Los botones de la tarjeta aparecen al pasar el mouse, para no ensuciar el
 * tablero. En pantallas táctiles no hay hover: se ven siempre.
 */
const CLASES_BOTON_TARJETA =
  "text-muted-foreground opacity-0 group-hover/tarjeta:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"

function Tarjeta({
  issue,
  arrastrando,
  archivo,
  editar,
}: {
  issue: IssueListItem
  arrastrando?: boolean
  archivo?: AccionArchivo
  editar?: AccionEditar
}) {
  return (
    <div
      className={cn(
        "group/tarjeta flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-xs",
        arrastrando && "opacity-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          #{issue.number}
        </span>
        <div className="flex items-center gap-1">
          {editar ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className={CLASES_BOTON_TARJETA}
              aria-label={`Editar #${issue.number}`}
              title="Editar"
              // El click no debe iniciar un arrastre.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => editar.onClick(issue)}
              disabled={editar.abriendo !== null}
            >
              {editar.abriendo === issue.id ? <Spinner /> : <PencilIcon />}
            </Button>
          ) : null}

          {archivo ? (
            <Button
              variant="ghost"
              size="icon-xs"
              className={CLASES_BOTON_TARJETA}
              aria-label={archivo.archivada ? "Desarchivar" : "Archivar"}
              title={archivo.archivada ? "Desarchivar" : "Archivar"}
              // El click no debe iniciar un arrastre.
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => archivo.onClick(issue)}
            >
              {archivo.archivada ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            </Button>
          ) : null}
          <PrioridadBadge prioridad={issue.priority} />
        </div>
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
        <AreaBadge nombre={issue.areaName} color={issue.areaColor} />
      </div>
    </div>
  )
}

function TarjetaArrastrable({
  issue,
  archivo,
  editar,
}: {
  issue: IssueListItem
  archivo: AccionArchivo
  editar: AccionEditar
}) {
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
      <Tarjeta
        issue={issue}
        arrastrando={isDragging}
        archivo={archivo}
        editar={editar}
      />
    </div>
  )
}

function Columna({
  estado,
  issues,
  archivo,
  editar,
}: {
  estado: Estado
  issues: IssueListItem[]
  archivo: AccionArchivo
  editar: AccionEditar
}) {
  const { setNodeRef, isOver } = useDroppable({ id: estado })

  return (
    <div className={cn("flex flex-col gap-2", CLASES_COLUMNA)}>
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
          <TarjetaArrastrable
            key={issue.id}
            issue={issue}
            archivo={archivo}
            editar={editar}
          />
        ))}

        {issues.length === 0 ? (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            {archivo.archivada ? "Nada archivado" : "Nada acá"}
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
              "flex items-center justify-between rounded-lg border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur transition-colors",
              CLASES_COLUMNA,
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

const OPCIONES_AUTO_ARCHIVO = DIAS_AUTO_ARCHIVO.map((dias) => ({
  label: `A los ${dias} días`,
  value: String(dias),
}))

/**
 * Encima del tablero: el acceso a las archivadas y la preferencia de
 * auto-archivado. El auto-archivado sólo toca tarjetas cerradas: una pendiente
 * vieja es justamente la que no conviene perder de vista.
 */
function BarraArchivo({
  archivadas,
  verArchivadas,
  diasAuto,
}: {
  archivadas: number
  verArchivadas: boolean
  diasAuto: number | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [guardando, startTransition] = React.useTransition()

  const href = `${pathname}${conParametros(searchParams, {
    archivadas: verArchivadas ? null : "1",
  })}`

  function cambiarAutoArchivo(valor: string | null) {
    startTransition(async () => {
      const resultado = await setAutoArchivoKanban(
        valor === null ? null : Number(valor)
      )

      if (!resultado.ok) {
        toast.add({ title: resultado.error, type: "error" })

        return
      }

      toast.add({
        title:
          valor === null
            ? "Las tarjetas cerradas ya no se archivan solas"
            : `Las cerradas se archivan a los ${valor} días sin actividad`,
        type: "success",
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {verArchivadas ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            render={<Link href={href} />}
            nativeButton={false}
          >
            <ArrowLeftIcon />
            Volver al tablero
          </Button>
          <p className="text-sm text-muted-foreground">
            Moverla de columna o desarchivarla la devuelve al tablero.
          </p>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={href} />}
          nativeButton={false}
        >
          <ArchiveIcon />
          Archivadas
          <Badge variant="secondary">{archivadas}</Badge>
        </Button>
      )}

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <label htmlFor="auto-archivo">Archivar cerradas</label>
        <EnumSelect
          id="auto-archivo"
          value={diasAuto === null ? null : String(diasAuto)}
          onValueChange={cambiarAutoArchivo}
          opciones={OPCIONES_AUTO_ARCHIVO}
          placeholder="Nunca"
          className={cn("w-36", guardando && "opacity-60")}
        />
      </div>
    </div>
  )
}

export function IssueKanban({
  issues,
  archivadas,
  verArchivadas,
  diasAuto,
  proyectos,
  areas,
}: {
  issues: IssueListItem[]
  /** Cuántas hay archivadas con los filtros actuales. */
  archivadas: number
  verArchivadas: boolean
  diasAuto: number | null
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
}) {
  const router = useRouter()
  // Copia local para poder mover la tarjeta al instante y revertir si el
  // servidor rechaza el cambio.
  const [items, setItems] = React.useState(issues)
  const [activo, setActivo] = React.useState<IssueListItem | null>(null)
  const [sobre, setSobre] = React.useState<Estado | null>(null)
  const [geometria, setGeometria] = React.useState<Geometria | null>(null)
  const [abriendo, setAbriendo] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<{
    id: string
    valores: IssueFormValues
  } | null>(null)
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

  async function alternarArchivo(issue: IssueListItem) {
    const anteriores = items
    const archivar = !verArchivadas

    // Sale de la vista actual al instante, sea cual sea la dirección.
    setItems((previos) => previos.filter((i) => i.id !== issue.id))

    const resultado = await archiveIssue(issue.id, archivar)

    if (!resultado.ok) {
      setItems(anteriores)
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: `#${issue.number} ${archivar ? "archivado" : "vuelve al tablero"}`,
      type: "success",
    })
    router.refresh()
  }

  const archivo: AccionArchivo = {
    archivada: verArchivadas,
    onClick: alternarArchivo,
  }

  /**
   * El formulario necesita la descripción, y la tarjeta no la trae: se pide al
   * abrir. Guardar sin ella la borraría.
   */
  async function abrirEdicion(issue: IssueListItem) {
    setAbriendo(issue.id)
    const resultado = await getIssueFormValues(issue.id)
    setAbriendo(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setEditando({ id: issue.id, valores: resultado.data })
  }

  const editar: AccionEditar = { abriendo, onClick: abrirEdicion }

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
    <div className="flex flex-col gap-3">
      <BarraArchivo
        archivadas={archivadas}
        verArchivadas={verArchivadas}
        diasAuto={diasAuto}
      />
      <ClientOnly
        fallback={
          <div className="flex w-full min-w-0 gap-4 overflow-x-auto pb-4">
            {ESTADOS.map((estado) => (
              <div
                key={estado}
                className={cn("flex flex-col gap-2", CLASES_COLUMNA)}
              >
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
                archivo={archivo}
                editar={editar}
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

      {editando ? (
        <IssueFormDialog
          open
          onOpenChange={(abierto) => !abierto && setEditando(null)}
          proyectos={proyectos}
          areas={areas}
          issueId={editando.id}
          valoresIniciales={editando.valores}
        />
      ) : null}
    </div>
  )
}
