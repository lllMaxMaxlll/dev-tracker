"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import {
  FolderPlusIcon,
  ListTodoIcon,
  MicIcon,
  SparklesIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { ClientOnly } from "@/components/ui/client-only"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  IssueFormDialog,
  type AreaOpcion,
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import {
  NaturalCaptureDialog,
  type ModoCaptura,
} from "@/components/capture/natural-capture-dialog"
import type { CapturaSugerida } from "@/actions/ai"
import type { IssueFormValues } from "@/lib/schemas/issue"
import type { Similar } from "@/lib/ai/embeddings"

/**
 * Alta rápida accesible desde cualquier página.
 *
 * - `A` abre la captura en lenguaje natural (el camino principal).
 * - `V` mantenida dicta la nota y, al soltarla, la interpreta.
 * - `C` abre el formulario de alta manual.
 * - `Cmd/Ctrl + K` abre la paleta de comandos.
 *
 * Los atajos se ignoran mientras se está escribiendo en un campo: si no, no se
 * podría tipear la letra C en ningún lado.
 */
function editandoTexto(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

export function QuickCapture({
  proyectos,
  areas,
}: {
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
}) {
  const router = useRouter()
  const [paletaAbierta, setPaletaAbierta] = React.useState(false)
  const [formAbierto, setFormAbierto] = React.useState(false)
  const [naturalAbierto, setNaturalAbierto] = React.useState(false)
  const [modoCaptura, setModoCaptura] = React.useState<ModoCaptura>("texto")
  const [sugerencia, setSugerencia] = React.useState<{
    valores: Partial<IssueFormValues>
    proyectoNuevo: string | null
    similares: Similar[]
  } | null>(null)

  function abrirCaptura(modo: ModoCaptura) {
    setModoCaptura(modo)
    setNaturalAbierto(true)
  }

  function aplicarSugerencia(datos: CapturaSugerida) {
    setSugerencia({
      valores: datos.valores,
      proyectoNuevo: datos.proyectoNuevo,
      similares: datos.similares,
    })
    setFormAbierto(true)
  }

  function abrirFormularioVacio() {
    setSugerencia(null)
    setFormAbierto(true)
  }

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return

      const tecla = event.key.toLowerCase()

      if (tecla === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletaAbierta((abierta) => !abierta)

        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (editandoTexto(event.target)) return

      if (tecla === "a") {
        event.preventDefault()
        abrirCaptura("texto")
      }

      if (tecla === "v") {
        event.preventDefault()
        abrirCaptura("voz")
      }

      if (tecla === "c") {
        event.preventDefault()
        setSugerencia(null)
        setFormAbierto(true)
      }
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function irA(href: string) {
    setPaletaAbierta(false)
    router.push(href)
  }

  return (
    <>
      <ClientOnly>
        {/* Portal: el header tiene backdrop-blur, que convierte a `fixed` en
            relativo al header en vez de a la ventana. */}
        <BotonAnotar
          onEscribir={() => abrirCaptura("texto")}
          onDictar={() => abrirCaptura("voz")}
        />

        <CommandDialog open={paletaAbierta} onOpenChange={setPaletaAbierta}>
          <CommandInput placeholder="Buscar una acción o una sección…" />
          <CommandList>
            <CommandEmpty>Nada que coincida.</CommandEmpty>

            <CommandGroup heading="Acciones">
              <CommandItem
                onSelect={() => {
                  setPaletaAbierta(false)
                  abrirCaptura("texto")
                }}
              >
                <SparklesIcon />
                Anotar en lenguaje natural
              </CommandItem>
              <CommandItem
                onSelect={() => {
                  setPaletaAbierta(false)
                  abrirFormularioVacio()
                }}
              >
                <ListTodoIcon />
                Nuevo problema (formulario)
              </CommandItem>
              <CommandItem onSelect={() => irA("/proyectos")}>
                <FolderPlusIcon />
                Nuevo proyecto
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Ir a">
              {NAV_ITEMS.map((item) => (
                <CommandItem
                  key={item.href}
                  onSelect={() => irA(item.href)}
                  value={item.label}
                >
                  <item.icon />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </ClientOnly>

      <NaturalCaptureDialog
        open={naturalAbierto}
        onOpenChange={setNaturalAbierto}
        modo={modoCaptura}
        onSugerencia={aplicarSugerencia}
      />

      <IssueFormDialog
        open={formAbierto}
        onOpenChange={setFormAbierto}
        proyectos={proyectos}
        areas={areas}
        valoresIniciales={sugerencia?.valores}
        proyectoNuevo={sugerencia?.proyectoNuevo}
        duplicadosIniciales={sugerencia?.similares}
        encabezado={
          sugerencia ? (
            <p className="text-sm text-muted-foreground">
              Precargado a partir de tu nota. Revisá y corregí lo que haga
              falta: nada se guarda hasta que confirmes.
            </p>
          ) : undefined
        }
        onGuardado={(creado) => {
          if (creado) {
            router.push(`/problemas/${creado.number}`)
          }
        }}
      />
    </>
  )
}

/**
 * Botón flotante: un toque abre la captura para escribir; mantenerlo apretado
 * dicta, igual que la tecla V. El diálogo escucha cuándo se suelta.
 */
function BotonAnotar({
  onEscribir,
  onDictar,
}: {
  onEscribir: () => void
  onDictar: () => void
}) {
  const temporizador = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  // Después de una pulsación larga llega igual un click: hay que ignorarlo.
  const fuePulsacionLarga = React.useRef(false)

  function cancelar() {
    clearTimeout(temporizador.current)
  }

  // `document` sólo existe en el cliente: el portal se arma acá adentro y no
  // en el padre, para que el ClientOnly que lo envuelve lo proteja del render
  // del servidor.
  return createPortal(
    <Button
      size="lg"
      className="fixed right-6 bottom-6 z-40 touch-none rounded-full shadow-lg select-none"
      title="Anotar (A) · mantené apretado o la tecla V para dictar"
      onPointerDown={() => {
        fuePulsacionLarga.current = false
        temporizador.current = setTimeout(() => {
          fuePulsacionLarga.current = true
          onDictar()
        }, 350)
      }}
      onPointerUp={cancelar}
      onPointerLeave={cancelar}
      onContextMenu={(event) => event.preventDefault()}
      onClick={() => {
        if (fuePulsacionLarga.current) {
          fuePulsacionLarga.current = false

          return
        }

        onEscribir()
      }}
    >
      <SparklesIcon data-icon="inline-start" />
      Anotar
      <span className="ml-1 hidden items-center gap-1 md:inline-flex">
        <Kbd>A</Kbd>
        <MicIcon className="size-3.5 opacity-70" />
        <Kbd>V</Kbd>
      </span>
    </Button>,
    document.body
  )
}
