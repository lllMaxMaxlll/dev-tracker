"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FolderPlusIcon, ListTodoIcon, SparklesIcon } from "lucide-react"

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
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import { NaturalCaptureDialog } from "@/components/capture/natural-capture-dialog"
import type { CapturaSugerida } from "@/actions/ai"
import type { IssueFormValues } from "@/lib/schemas/issue"

/**
 * Alta rápida accesible desde cualquier página.
 *
 * - `A` abre la captura en lenguaje natural (el camino principal).
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

export function QuickCapture({ proyectos }: { proyectos: ProyectoOpcion[] }) {
  const router = useRouter()
  const [paletaAbierta, setPaletaAbierta] = React.useState(false)
  const [formAbierto, setFormAbierto] = React.useState(false)
  const [naturalAbierto, setNaturalAbierto] = React.useState(false)
  const [sugerencia, setSugerencia] = React.useState<{
    valores: Partial<IssueFormValues>
    proyectoNuevo: string | null
  } | null>(null)

  function aplicarSugerencia(datos: CapturaSugerida) {
    setSugerencia({
      valores: datos.valores,
      proyectoNuevo: datos.proyectoNuevo,
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
        setNaturalAbierto(true)
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
      <Button size="sm" onClick={() => setNaturalAbierto(true)}>
        <SparklesIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Anotar</span>
        <Kbd className="ml-1 hidden md:inline-flex">A</Kbd>
      </Button>

      <ClientOnly>
        <CommandDialog open={paletaAbierta} onOpenChange={setPaletaAbierta}>
          <CommandInput placeholder="Buscar una acción o una sección…" />
          <CommandList>
            <CommandEmpty>Nada que coincida.</CommandEmpty>

            <CommandGroup heading="Acciones">
              <CommandItem
                onSelect={() => {
                  setPaletaAbierta(false)
                  setNaturalAbierto(true)
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
        onSugerencia={aplicarSugerencia}
      />

      <IssueFormDialog
        open={formAbierto}
        onOpenChange={setFormAbierto}
        proyectos={proyectos}
        valoresIniciales={sugerencia?.valores}
        proyectoNuevo={sugerencia?.proyectoNuevo}
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
