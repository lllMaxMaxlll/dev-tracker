"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ChevronRightIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { NAV_ITEMS } from "@/components/layout/nav-items"
import { anotarEnBandeja } from "@/actions/ai"
import type { ProyectoOpcion } from "@/components/issues/issue-form-dialog"

type Comando = {
  id: string
  nombre: string
  detalle: string
  /** Palabras con las que se lo encuentra después de la barra. */
  claves: string
  ejecutar: () => void
}

/** Minúsculas y sin tildes: "órdenes" tiene que encontrarse con "ordenes". */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function editandoTexto(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

/**
 * Línea de comandos fija abajo de la pantalla.
 *
 * - Texto suelto + ↵: la IA lo clasifica y queda en la Bandeja. Es la forma
 *   más rápida de anotar sin cortar lo que estás haciendo.
 * - Texto suelto + ⇧↵: abre la captura con ese texto, para revisar antes.
 * - Empezando con "/": busca un comando (ir a un módulo, abrir el formulario,
 *   dictar).
 *
 * `/` desde cualquier lado la enfoca y Esc la limpia.
 *
 * El proyecto se detecta acá mismo, sin IA, sólo para mostrarlo mientras
 * escribís: la clasificación de verdad la hace el modelo al apretar ↵.
 */
export function LineaDeComandos({
  proyectos,
  onRevisar,
  onFormulario,
  onDictar,
}: {
  proyectos: ProyectoOpcion[]
  onRevisar: (texto: string) => void
  onFormulario: () => void
  onDictar: () => void
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [texto, setTexto] = React.useState("")
  const [enfocada, setEnfocada] = React.useState(false)
  const [elegido, setElegido] = React.useState(0)
  const [enviando, setEnviando] = React.useState(false)

  const limpiar = React.useCallback(() => {
    setTexto("")
    setElegido(0)
  }, [])

  const comandos: Comando[] = React.useMemo(
    () => [
      ...NAV_ITEMS.map((item) => ({
        id: item.href,
        nombre: `Ir a ${item.label}`,
        detalle: `G ${item.tecla.toUpperCase()}`,
        claves: `ir ${item.label}`,
        ejecutar: () => router.push(item.href),
      })),
      {
        id: "nueva",
        nombre: "Nueva orden con formulario",
        detalle: "C",
        claves: "nueva orden formulario crear",
        ejecutar: onFormulario,
      },
      {
        id: "dictar",
        nombre: "Dictar una nota",
        detalle: "mantené V",
        claves: "dictar voz microfono hablar",
        ejecutar: onDictar,
      },
    ],
    [router, onFormulario, onDictar]
  )

  const enModoComando = texto.startsWith("/")
  const consulta = normalizar(texto.slice(1).trim())
  const filtrados = enModoComando
    ? comandos.filter((comando) =>
        consulta
          .split(/\s+/)
          .every((palabra) => normalizar(comando.claves).includes(palabra))
      )
    : []

  const proyectoDetectado = React.useMemo(() => {
    if (enModoComando || texto.trim().length < 3) return null

    const normal = normalizar(texto)

    return (
      proyectos.find((proyecto) => {
        const nombre = normalizar(proyecto.name)
        const patron = new RegExp(
          `\\b(${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${proyecto.slug})\\b`
        )

        return patron.test(normal)
      }) ?? null
    )
  }, [enModoComando, texto, proyectos])

  // `/` enfoca la línea desde cualquier pantalla.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return
      if (event.defaultPrevented || editandoTexto(event.target)) return
      if (document.querySelector("[role=dialog]")) return

      event.preventDefault()
      inputRef.current?.focus()
    }

    window.addEventListener("keydown", onKeyDown)

    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  async function anotar() {
    const nota = texto.trim()

    if (nota.length < 5) {
      toast.add({
        title: "Escribí un poco más para que pueda clasificarlo",
        type: "info",
      })

      return
    }

    setEnviando(true)
    const resultado = await anotarEnBandeja(nota)
    setEnviando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    limpiar()
    toast.add({
      title: `#${resultado.data.number} en la bandeja`,
      description: "La IA ya la clasificó. Revisala cuando puedas.",
      type: "success",
    })
    router.refresh()
  }

  function ejecutar(comando: Comando | undefined) {
    if (!comando) return

    limpiar()
    inputRef.current?.blur()
    comando.ejecutar()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault()
      limpiar()
      inputRef.current?.blur()

      return
    }

    if (enModoComando) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const paso = event.key === "ArrowDown" ? 1 : -1
        setElegido((actual) =>
          filtrados.length === 0
            ? 0
            : (actual + paso + filtrados.length) % filtrados.length
        )
      } else if (event.key === "Enter") {
        event.preventDefault()
        ejecutar(filtrados[Math.min(elegido, filtrados.length - 1)])
      }

      return
    }

    if (event.key === "Enter" && texto.trim()) {
      event.preventDefault()

      if (event.shiftKey) {
        const nota = texto
        limpiar()
        inputRef.current?.blur()
        onRevisar(nota)
      } else if (!enviando) {
        anotar()
      }
    }
  }

  const mostrarPanel = enfocada && texto.trim() !== ""

  return (
    <div className="sticky bottom-0 z-20 hidden border-t bg-card md:block">
      {mostrarPanel ? (
        <div className="absolute right-4 bottom-full left-4 mb-2 max-w-3xl overflow-hidden rounded-md border bg-popover shadow-xl">
          {enModoComando ? (
            filtrados.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">
                Ningún comando coincide.
              </p>
            ) : (
              <ul role="listbox" aria-label="Comandos">
                {filtrados.map((comando, i) => (
                  <li
                    key={comando.id}
                    role="option"
                    aria-selected={i === elegido}
                    // onMouseDown y no onClick: el click llega después del
                    // blur del input, que ya habría cerrado el panel.
                    onMouseDown={(event) => {
                      event.preventDefault()
                      ejecutar(comando)
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-4 px-4 py-2 text-sm",
                      i === elegido &&
                        "bg-muted shadow-[inset_2px_0_0_var(--primary)]"
                    )}
                  >
                    <span className="font-medium">{comando.nombre}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {comando.detalle}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <div className="flex flex-col gap-2 px-4 py-3">
              <span className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
                Nueva orden
              </span>
              <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                <span className="rounded-sm border px-2 py-1">
                  <span className="text-muted-foreground">proyecto </span>
                  {proyectoDetectado ? (
                    proyectoDetectado.name
                  ) : (
                    <span className="text-muted-foreground">lo deduce la IA</span>
                  )}
                </span>
                <span className="rounded-sm border px-2 py-1 text-muted-foreground">
                  tipo, prioridad y área: los elige la IA al crear
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                <Kbd>↵</Kbd> a la bandeja · <Kbd>⇧↵</Kbd> revisar antes de
                crear · <Kbd>Esc</Kbd> limpiar
              </span>
            </div>
          )}
        </div>
      ) : null}

      <label className="flex h-12 items-center gap-3 px-4">
        {enviando ? (
          <Spinner className="text-primary" />
        ) : (
          <ChevronRightIcon className="size-4 shrink-0 text-primary" />
        )}
        <input
          ref={inputRef}
          value={texto}
          onChange={(event) => {
            setTexto(event.target.value)
            setElegido(0)
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setEnfocada(true)}
          onBlur={() => setEnfocada(false)}
          disabled={enviando}
          placeholder="Anotá una orden y ↵, o escribí / para buscar un comando"
          aria-label="Línea de comandos"
          className="h-full min-w-0 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="hidden shrink-0 items-center gap-3 font-mono text-xs text-muted-foreground lg:flex">
          <span>
            <Kbd>/</Kbd> enfocar
          </span>
          <span>
            <Kbd>A</Kbd> anotar
          </span>
          <span>
            mantené <Kbd>V</Kbd> dictar
          </span>
        </span>
      </label>
    </div>
  )
}
