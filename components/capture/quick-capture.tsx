"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { FolderPlusIcon, ListTodoIcon, PlusIcon } from "lucide-react"

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

/**
 * Alta rápida accesible desde cualquier página.
 *
 * - `C` abre el formulario de alta directamente.
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

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) return

      const esK = event.key.toLowerCase() === "k"
      const esC = event.key.toLowerCase() === "c"

      if (esK && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setPaletaAbierta((abierta) => !abierta)

        return
      }

      if (esC && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (editandoTexto(event.target)) return

        event.preventDefault()
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
      <Button size="sm" onClick={() => setFormAbierto(true)}>
        <PlusIcon data-icon="inline-start" />
        <span className="hidden sm:inline">Nuevo</span>
        <Kbd className="ml-1 hidden md:inline-flex">C</Kbd>
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
                  setFormAbierto(true)
                }}
              >
                <ListTodoIcon />
                Nuevo problema
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

      <IssueFormDialog
        open={formAbierto}
        onOpenChange={setFormAbierto}
        proyectos={proyectos}
        onGuardado={(creado) => {
          if (creado) {
            router.push(`/problemas/${creado.number}`)
          }
        }}
      />
    </>
  )
}
