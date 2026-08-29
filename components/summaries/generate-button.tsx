"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"

/**
 * Genera el resumen mostrando el texto a medida que llega.
 *
 * Sin streaming, el botón dejaba al usuario mirando un spinner entre diez y
 * veinte segundos sin ninguna señal de que algo estuviera pasando.
 */
export function GenerateSummaryButton() {
  const router = useRouter()
  const [generando, setGenerando] = React.useState(false)
  const [texto, setTexto] = React.useState("")

  async function generar() {
    setGenerando(true)
    setTexto("")

    try {
      const respuesta = await fetch("/api/ai/summary/stream", {
        method: "POST",
      })

      if (!respuesta.ok) {
        const cuerpo = (await respuesta.json().catch(() => null)) as {
          motivo?: string
        } | null

        toast.add({
          title: "No se generó el resumen",
          description: cuerpo?.motivo ?? `Error ${respuesta.status}`,
          type: respuesta.status === 409 ? "info" : "error",
        })

        return
      }

      if (!respuesta.body) {
        toast.add({ title: "Respuesta vacía del servidor", type: "error" })

        return
      }

      const lector = respuesta.body.getReader()
      const decodificador = new TextDecoder()

      for (;;) {
        const { done, value } = await lector.read()

        if (done) break

        setTexto(
          (previo) => previo + decodificador.decode(value, { stream: true })
        )
      }

      toast.add({ title: "Resumen generado", type: "success" })

      // El servidor ya lo guardó al terminar el stream; refrescamos para que
      // aparezca en la lista con su fecha y sus stats.
      router.refresh()
    } catch (error) {
      console.error(error)
      toast.add({ title: "Se cortó la generación", type: "error" })
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-3">
      <Button onClick={generar} disabled={generando}>
        {generando ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <SparklesIcon data-icon="inline-start" />
        )}
        {generando ? "Generando…" : "Generar resumen ahora"}
      </Button>

      {texto ? (
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-base">
              {generando ? "Escribiendo…" : "Recién generado"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {texto}
              {generando ? (
                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-foreground/70" />
              ) : null}
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
