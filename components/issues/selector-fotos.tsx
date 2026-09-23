"use client"

import * as React from "react"
import { ImagePlusIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { comprimirImagen } from "@/lib/utils/comprimir-imagen"
import type { ImagenComprimida } from "@/lib/utils/comprimir-imagen"

export type FotoPendiente = {
  /** Sólo para la lista de React; el id real lo asigna la base al subirla. */
  id: string
  nombre: string
  imagen: ImagenComprimida
  /** `URL.createObjectURL` de la imagen ya comprimida, para la miniatura. */
  preview: string
}

/**
 * Elige y comprime fotos antes de que el problema exista.
 *
 * En el alta no hay dónde subirlas todavía: la ruta del archivo lleva el id del
 * problema. Así que se comprimen al elegirlas —que es lo que tarda— y quedan en
 * memoria; el formulario las sube apenas el problema tiene id. Comprimir acá
 * también hace que la miniatura muestre exactamente lo que se va a guardar.
 */
export function SelectorFotos({
  fotos,
  onChange,
  disponibles,
  disabled,
}: {
  fotos: FotoPendiente[]
  onChange: (fotos: FotoPendiente[]) => void
  /** Cuántas más entran, contando las que el problema ya tenga. */
  disponibles: number
  disabled?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [comprimiendo, setComprimiendo] = React.useState(0)

  const lugarLibre = disponibles - fotos.length

  async function onArchivos(event: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(event.target.files ?? [])

    event.target.value = ""

    if (elegidos.length === 0) return

    if (elegidos.length > lugarLibre) {
      toast.add({
        title:
          lugarLibre > 0
            ? `Sólo entran ${lugarLibre} foto(s) más`
            : "Llegaste al máximo de fotos",
        type: "error",
      })

      return
    }

    setComprimiendo((n) => n + elegidos.length)

    const nuevas: FotoPendiente[] = []

    for (const archivo of elegidos) {
      try {
        const imagen = await comprimirImagen(archivo)

        nuevas.push({
          id: crypto.randomUUID(),
          nombre: archivo.name,
          imagen,
          preview: URL.createObjectURL(imagen.blob),
        })
      } catch (error) {
        toast.add({
          title: `${archivo.name}: ${
            error instanceof Error ? error.message : "no se pudo procesar"
          }`,
          type: "error",
        })
      } finally {
        setComprimiendo((n) => n - 1)
      }
    }

    if (nuevas.length > 0) {
      onChange([...fotos, ...nuevas])
    }
  }

  function quitar(foto: FotoPendiente) {
    URL.revokeObjectURL(foto.preview)
    onChange(fotos.filter((f) => f.id !== foto.id))
  }

  return (
    <div className="flex flex-col gap-2">
      {fotos.length > 0 || comprimiendo > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {fotos.map((foto) => (
            <li key={foto.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.preview}
                alt={foto.nombre}
                className="aspect-4/3 w-full rounded-lg border bg-muted object-cover"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                aria-label={`Quitar ${foto.nombre}`}
                onClick={() => quitar(foto)}
                disabled={disabled}
                className="absolute top-1 right-1"
              >
                <XIcon />
              </Button>
            </li>
          ))}

          {Array.from({ length: comprimiendo }).map((_, i) => (
            <li
              key={`comprimiendo-${i}`}
              className="flex aspect-4/3 items-center justify-center rounded-lg border border-dashed"
            >
              <Spinner />
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={onArchivos}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || lugarLibre <= 0 || comprimiendo > 0}
        >
          <ImagePlusIcon data-icon="inline-start" />
          Adjuntar fotos
        </Button>
        <span className="text-xs text-muted-foreground">
          {lugarLibre > 0
            ? "Se comprimen en tu navegador antes de subirse."
            : "Llegaste al máximo de fotos."}
        </span>
      </div>
    </div>
  )
}
