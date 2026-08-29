"use client"

import * as React from "react"
import { MicIcon, SparklesIcon, SquareIcon } from "lucide-react"

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
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "@/components/ui/toast"
import { useDictado } from "@/hooks/use-dictado"
import { capturarDesdeTexto, type CapturaSugerida } from "@/actions/ai"

const EJEMPLO =
  "el login se rompe cuando el mail tiene mayúsculas, es urgente, es del proyecto fischer"

/**
 * Captura en lenguaje natural: escribís la nota como en el cuaderno y el modelo
 * la estructura.
 *
 * Nunca guarda directo: al terminar abre el formulario precargado para que
 * revises y confirmes.
 */
export function NaturalCaptureDialog({
  open,
  onOpenChange,
  onSugerencia,
}: {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  onSugerencia: (sugerencia: CapturaSugerida) => void
}) {
  const [texto, setTexto] = React.useState("")
  const [procesando, setProcesando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [abiertoPrevio, setAbiertoPrevio] = React.useState(open)

  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open)

    if (open) {
      setTexto("")
      setError(null)
    }
  }

  const { soportado, escuchando, alternar } = useDictado((dictado) =>
    setTexto((previo) => (previo ? `${previo} ${dictado}` : dictado))
  )

  async function interpretar() {
    setProcesando(true)
    setError(null)

    const resultado = await capturarDesdeTexto(texto)

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Anotar en lenguaje natural</DialogTitle>
          <DialogDescription>
            Escribilo como lo anotarías en el cuaderno. Después vas a poder
            revisar y corregir todo antes de guardar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={EJEMPLO}
            rows={5}
            autoFocus
            disabled={procesando}
            onKeyDown={(e) => {
              // Cmd/Ctrl + Enter para no tener que ir al botón.
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                texto.trim()
              ) {
                e.preventDefault()
                interpretar()
              }
            }}
          />

          {soportado ? (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={escuchando ? "default" : "outline"}
                size="sm"
                onClick={alternar}
                disabled={procesando}
              >
                {escuchando ? (
                  <SquareIcon data-icon="inline-start" />
                ) : (
                  <MicIcon data-icon="inline-start" />
                )}
                {escuchando ? "Detener" : "Dictar"}
              </Button>
              {escuchando ? (
                <span className={cn("text-xs text-muted-foreground")}>
                  Escuchando… hablá normal, se transcribe al soltar.
                </span>
              ) : null}
            </div>
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
          <Button onClick={interpretar} disabled={procesando || !texto.trim()}>
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
