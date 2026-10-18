"use client"

import * as React from "react"
import { InboxIcon, MicIcon, SparklesIcon, SquareIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Kbd } from "@/components/ui/kbd"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/toast"
import { useDictado } from "@/hooks/use-dictado"
import {
  anotarEnBandeja,
  capturarDesdeTexto,
  type CapturaSugerida,
} from "@/actions/ai"

const EJEMPLO =
  "el login se rompe cuando el mail tiene mayúsculas, es urgente, es del proyecto fischer"

/**
 * Cómo se abrió la captura.
 *
 * - `texto`: para escribir.
 * - `voz`: con la tecla V o el botón flotante apretados. Escucha mientras se
 *   mantienen y, al soltarlos, interpreta sola lo que se dijo.
 */
export type ModoCaptura = "texto" | "voz"

/**
 * Captura en lenguaje natural: escribís o dictás la nota como en el cuaderno y
 * el modelo la estructura.
 *
 * Nunca guarda directo: al terminar abre el formulario precargado para que
 * revises y confirmes.
 */
export function NaturalCaptureDialog({
  open,
  onOpenChange,
  modo = "texto",
  onSugerencia,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  modo?: ModoCaptura
  onSugerencia: (sugerencia: CapturaSugerida) => void
}) {
  const [texto, setTexto] = React.useState("")
  const [procesando, setProcesando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // El dictado entrega el texto en callbacks que corren fuera del render, y al
  // terminar hay que interpretar lo último que llegó: el estado todavía puede
  // no estar actualizado en ese momento, el ref sí.
  const textoRef = React.useRef("")
  // Se soltó la tecla o el botón: cuando el reconocimiento termine de
  // entregar el texto, se interpreta solo.
  const interpretarAlTerminarRef = React.useRef(false)

  function escribir(nuevo: string) {
    textoRef.current = nuevo
    setTexto(nuevo)
  }

  const [abiertoPrevio, setAbiertoPrevio] = React.useState(open)

  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open)

    if (open) {
      setTexto("")
      setError(null)
    }
  }

  async function interpretar(nota: string) {
    setProcesando(true)
    setError(null)

    const resultado = await capturarDesdeTexto(nota)

    setProcesando(false)

    if (!resultado.ok) {
      setError(resultado.error)

      return
    }

    if (resultado.data.confianza < 0.4) {
      toast.add({
        title: "Interpretación dudosa",
        description: "Revisá bien los campos antes de guardar.",
        type: "warning",
      })
    }

    onOpenChange(false)
    onSugerencia(resultado.data)
  }

  /**
   * Guarda la nota sin pasar por el formulario: la IA la clasifica y queda en
   * la Bandeja hasta que la revises. Para anotar al paso sin cortar lo que
   * estás haciendo.
   */
  async function mandarABandeja(nota: string) {
    setProcesando(true)
    setError(null)

    const resultado = await anotarEnBandeja(nota)

    setProcesando(false)

    if (!resultado.ok) {
      setError(resultado.error)

      return
    }

    toast.add({
      title: `#${resultado.data.number} en la bandeja`,
      description: "Revisala cuando puedas, desde Bandeja.",
      type: "success",
    })
    onOpenChange(false)
  }

  const dictado = useDictado({
    onTexto: (frase) =>
      escribir(textoRef.current ? `${textoRef.current} ${frase}` : frase),
    onFin: () => {
      if (!interpretarAlTerminarRef.current) return

      interpretarAlTerminarRef.current = false

      if (textoRef.current.trim().length >= 5) {
        interpretar(textoRef.current)
      }
    },
  })

  const { iniciar, detener } = dictado

  // Pulsar para hablar. Los listeners van en `window` porque al abrirse el
  // diálogo el foco y el puntero quedan en otro lado: el botón flotante o la
  // tecla V siguen apretados, pero sus eventos ya no llegan a quien los
  // empezó.
  React.useEffect(() => {
    if (!open) return

    textoRef.current = ""
    interpretarAlTerminarRef.current = false

    if (modo !== "voz") return

    let manteniendo = true

    function soltar() {
      if (!manteniendo) return

      manteniendo = false
      interpretarAlTerminarRef.current = true
      detener()
    }

    // Mientras V sigue apretada, el autorrepetir del teclado escribiría
    // "vvvv" en el textarea.
    function onKeyDown(event: KeyboardEvent) {
      if (manteniendo && event.key.toLowerCase() === "v") {
        event.preventDefault()
      }
    }

    function onKeyUp(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "v") soltar()
    }

    window.addEventListener("keydown", onKeyDown, true)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("pointerup", soltar)
    window.addEventListener("pointercancel", soltar)
    iniciar()

    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("pointerup", soltar)
      window.removeEventListener("pointercancel", soltar)
      // Si se cerró a mitad del dictado, lo que llegue después no se usa.
      interpretarAlTerminarRef.current = false
      detener()
    }
  }, [open, modo, iniciar, detener])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Anotar en lenguaje natural</DialogTitle>
          <DialogDescription>
            Escribilo o dictalo como lo anotarías en el cuaderno: el modelo
            elige tipo, prioridad, proyecto y área. Después vas a poder revisar
            y corregir todo antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Textarea
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            placeholder={EJEMPLO}
            rows={5}
            autoFocus={modo === "texto" || !dictado.soportado}
            disabled={procesando}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Enter para no tener que ir al botón.
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                texto.trim()
              ) {
                e.preventDefault()
                interpretar(texto)
              }
            }}
          />

          {dictado.parcial ? (
            <p className="text-sm text-muted-foreground italic">
              {dictado.parcial}…
            </p>
          ) : null}

          {dictado.soportado ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant={dictado.escuchando ? "default" : "outline"}
                size="sm"
                onClick={dictado.alternar}
                disabled={procesando}
              >
                {dictado.escuchando ? (
                  <SquareIcon data-icon="inline-start" />
                ) : (
                  <MicIcon data-icon="inline-start" />
                )}
                {dictado.escuchando ? "Detener" : "Dictar"}
              </Button>
              <span className="text-xs text-muted-foreground">
                {dictado.escuchando ? (
                  modo === "voz" ? (
                    "Escuchando… soltá para interpretar."
                  ) : (
                    "Escuchando… hablá normal."
                  )
                ) : (
                  <>
                    O mantené <Kbd>V</Kbd> desde cualquier pantalla.
                  </>
                )}
              </span>
            </div>
          ) : null}

          {dictado.error ? (
            <Alert variant="destructive">
              <AlertDescription>{dictado.error}</AlertDescription>
            </Alert>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {procesando ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Interpretando la nota… puede tardar unos segundos.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={procesando}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => mandarABandeja(texto)}
            disabled={procesando || !texto.trim()}
            title="Guardar sin revisar: queda en la Bandeja"
          >
            <InboxIcon data-icon="inline-start" />A la bandeja
          </Button>
          <Button
            onClick={() => interpretar(texto)}
            disabled={procesando || !texto.trim()}
          >
            {procesando ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SparklesIcon data-icon="inline-start" />
            )}
            Interpretar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
