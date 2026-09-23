"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ImagePlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { comprimirImagen } from "@/lib/utils/comprimir-imagen"
import { mensajeDeError, subirFoto } from "@/lib/adjuntos/cliente"
import { borrarAdjunto } from "@/actions/attachments"
import type { Adjunto } from "@/lib/db/queries/attachments"

/** Tiene que coincidir con lo que valida la server action. */
const MAX_ADJUNTOS = 10

function pesoLegible(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

/**
 * Fotos de un problema: capturas de pantalla, la pizarra, el error en la
 * consola del celular.
 *
 * El archivo va del navegador al bucket de Supabase sin pasar por el servidor
 * de Next, y antes se comprime acá mismo (ver lib/utils/comprimir-imagen.ts):
 * una foto de 8 MB termina pesando unos cientos de KB. Recién cuando la subida
 * terminó se registra la fila, así la base nunca apunta a un archivo que no
 * existe.
 */
export function IssueAttachments({
  issueId,
  adjuntos,
}: {
  issueId: string
  adjuntos: Adjunto[]
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [subiendo, setSubiendo] = React.useState<string[]>([])
  const [borrando, setBorrando] = React.useState<string | null>(null)
  const [mirando, setMirando] = React.useState<Adjunto | null>(null)

  const lugarLibre = MAX_ADJUNTOS - adjuntos.length

  async function onArchivos(event: React.ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(event.target.files ?? [])

    // El input se limpia enseguida: si no, elegir la misma foto otra vez no
    // dispararía el evento.
    event.target.value = ""

    if (elegidos.length === 0) return

    if (elegidos.length > lugarLibre) {
      toast.add({
        title: `Sólo entran ${lugarLibre} foto(s) más en este problema`,
        type: "error",
      })

      return
    }

    setSubiendo(elegidos.map((a) => a.name))

    let subidas = 0

    for (const archivo of elegidos) {
      try {
        await subirFoto(issueId, await comprimirImagen(archivo), archivo.name)
        subidas++
      } catch (error) {
        toast.add({
          title: `${archivo.name}: ${mensajeDeError(error)}`,
          type: "error",
        })
      } finally {
        setSubiendo((previos) => previos.filter((n) => n !== archivo.name))
      }
    }

    if (subidas > 0) {
      toast.add({
        title: subidas === 1 ? "Foto agregada" : `${subidas} fotos agregadas`,
        type: "success",
      })
      router.refresh()
    }
  }

  async function borrar(adjunto: Adjunto) {
    setBorrando(adjunto.id)
    const resultado = await borrarAdjunto(adjunto.id)
    setBorrando(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setMirando(null)
    toast.add({ title: "Foto borrada", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {adjuntos.length === 0 && subiendo.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay fotos. Se comprimen en tu navegador antes de subirse.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {adjuntos.map((adjunto) => (
            <li key={adjunto.id} className="group/foto relative">
              <button
                type="button"
                onClick={() => setMirando(adjunto)}
                className="block w-full overflow-hidden rounded-lg border focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {adjunto.url ? (
                  // Sin next/image a propósito: la URL viene firmada y caduca,
                  // así que el optimizador la cachearía por más tiempo del que
                  // vale y volvería a pedirla cuando ya no sirve.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={adjunto.url}
                    alt={adjunto.fileName ?? "Foto del problema"}
                    loading="lazy"
                    className="aspect-4/3 w-full bg-muted object-cover"
                  />
                ) : (
                  <span className="flex aspect-4/3 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                    No se pudo cargar
                  </span>
                )}
              </button>

              <Button
                variant="outline"
                size="icon-xs"
                aria-label="Borrar foto"
                onClick={() => borrar(adjunto)}
                disabled={borrando === adjunto.id}
                className="absolute top-1.5 right-1.5 opacity-0 group-hover/foto:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
              >
                {borrando === adjunto.id ? <Spinner /> : <Trash2Icon />}
              </Button>
            </li>
          ))}

          {subiendo.map((nombre) => (
            <li
              key={nombre}
              className="flex aspect-4/3 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-2 text-center"
            >
              <Spinner />
              <span className="line-clamp-2 text-xs text-muted-foreground">
                {nombre}
              </span>
            </li>
          ))}
        </ul>
      )}

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
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={lugarLibre <= 0 || subiendo.length > 0}
        >
          <ImagePlusIcon data-icon="inline-start" />
          Agregar fotos
        </Button>
        <span className="text-xs text-muted-foreground">
          {lugarLibre > 0
            ? `Quedan ${lugarLibre} de ${MAX_ADJUNTOS}`
            : `Llegaste al máximo de ${MAX_ADJUNTOS}`}
        </span>
      </div>

      <Dialog
        open={mirando !== null}
        onOpenChange={(abierto) => !abierto && setMirando(null)}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              {mirando?.fileName ?? "Foto"}
            </DialogTitle>
          </DialogHeader>

          {mirando?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mirando.url}
              alt={mirando.fileName ?? "Foto del problema"}
              className="max-h-[70svh] w-full rounded-lg object-contain"
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {mirando?.width && mirando?.height
                ? `${mirando.width}×${mirando.height} · `
                : null}
              {mirando ? pesoLegible(mirando.sizeBytes) : null}
            </span>
            {mirando?.url ? (
              <a
                href={mirando.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                Abrir en tamaño original
              </a>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
