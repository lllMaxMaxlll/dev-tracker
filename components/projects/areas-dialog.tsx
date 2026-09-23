"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  CheckIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { createArea, deleteArea, updateArea } from "@/actions/areas"
import { COLORES_AREA } from "@/lib/schemas/area"
import type { AreaConConteo } from "@/lib/db/queries/projects"

/** Paleta cerrada: un color por botón, sin selector libre. */
function SelectorColor({
  valor,
  onChange,
}: {
  valor: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {COLORES_AREA.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Color ${color}`}
          aria-pressed={valor === color}
          onClick={() => onChange(color)}
          style={{ backgroundColor: color }}
          className={cn(
            "size-5 rounded-full ring-offset-2 ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            valor === color && "ring-2 ring-foreground"
          )}
        />
      ))}
    </div>
  )
}

function Fila({
  area,
  onCambio,
}: {
  area: AreaConConteo
  onCambio: () => void
}) {
  const [editando, setEditando] = React.useState(false)
  const [nombre, setNombre] = React.useState(area.name)
  const [color, setColor] = React.useState(area.color ?? COLORES_AREA[0])
  const [ocupado, setOcupado] = React.useState(false)

  async function guardar() {
    setOcupado(true)
    const resultado = await updateArea({ id: area.id, name: nombre, color })
    setOcupado(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setEditando(false)
    onCambio()
  }

  async function borrar() {
    setOcupado(true)
    const resultado = await deleteArea(area.id)
    setOcupado(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({ title: `Área «${area.name}» borrada`, type: "success" })
    onCambio()
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border p-2">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-label="Nombre del área"
          autoFocus
        />
        <div className="flex items-center justify-between gap-2">
          <SelectorColor valor={color} onChange={setColor} />
          <div className="flex items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Cancelar"
              onClick={() => {
                setEditando(false)
                setNombre(area.name)
                setColor(area.color ?? COLORES_AREA[0])
              }}
              disabled={ocupado}
            >
              <XIcon />
            </Button>
            <Button
              size="icon-sm"
              aria-label="Guardar área"
              onClick={guardar}
              disabled={ocupado || nombre.trim().length === 0}
            >
              {ocupado ? <Spinner /> : <CheckIcon />}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className="size-3 shrink-0 rounded-full bg-muted-foreground"
          style={area.color ? { backgroundColor: area.color } : undefined}
        />
        <span className="truncate text-sm font-medium">{area.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {area.issues} {area.issues === 1 ? "problema" : "problemas"}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Editar ${area.name}`}
          onClick={() => setEditando(true)}
          disabled={ocupado}
        >
          <PencilIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Borrar ${area.name}`}
          onClick={borrar}
          disabled={ocupado}
          // Borrar un área no borra sus problemas, así que no hace falta una
          // confirmación aparte: el aviso está acá.
          title={
            area.issues > 0
              ? `${area.issues} problema(s) quedan sin área`
              : undefined
          }
        >
          {ocupado ? <Spinner /> : <Trash2Icon />}
        </Button>
      </div>
    </div>
  )
}

/**
 * Administración de las áreas de un proyecto: crear, renombrar, recolorear y
 * borrar. Vive en la tarjeta del proyecto porque un área no existe sola.
 */
export function AreasDialog({
  open,
  onOpenChange,
  proyecto,
  areas,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  proyecto: { id: string; name: string }
  areas: AreaConConteo[]
}) {
  const router = useRouter()
  const [nombre, setNombre] = React.useState("")
  const [color, setColor] = React.useState<string>(COLORES_AREA[0])
  const [creando, setCreando] = React.useState(false)

  async function crear(event: React.FormEvent) {
    event.preventDefault()

    if (nombre.trim().length === 0) return

    setCreando(true)
    const resultado = await createArea({
      projectId: proyecto.id,
      name: nombre,
      color,
    })
    setCreando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setNombre("")
    // El color no se reinicia: al cargar varias seguidas, lo habitual es ir
    // alternando a mano y no volver siempre al primero.
    toast.add({ title: `Área «${nombre}» creada`, type: "success" })
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Áreas de {proyecto.name}</DialogTitle>
          <DialogDescription>
            Los módulos o partes del proyecto: «checkout», «api», «infra». Un
            problema puede tener una.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {areas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este proyecto todavía no tiene áreas.
            </p>
          ) : (
            areas.map((area) => (
              <Fila
                key={area.id}
                area={area}
                onCambio={() => router.refresh()}
              />
            ))
          )}
        </div>

        <form
          onSubmit={crear}
          className="flex flex-col gap-2 rounded-lg border border-dashed p-2"
        >
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre del área"
            aria-label="Nombre del área nueva"
            maxLength={40}
          />
          <div className="flex items-center justify-between gap-2">
            <SelectorColor valor={color} onChange={setColor} />
            <Button
              type="submit"
              size="sm"
              disabled={creando || nombre.trim().length === 0}
            >
              {creando ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              Agregar
            </Button>
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Listo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
