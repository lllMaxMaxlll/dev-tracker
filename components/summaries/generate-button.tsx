"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { SparklesIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { generarResumenAhora } from "@/actions/ai"

export function GenerateSummaryButton() {
  const router = useRouter()
  const [generando, setGenerando] = React.useState(false)

  async function generar() {
    setGenerando(true)
    const resultado = await generarResumenAhora()
    setGenerando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    if (!resultado.data.generado) {
      toast.add({
        title: "No se generó",
        description: resultado.data.motivo,
        type: "info",
      })

      return
    }

    toast.add({ title: "Resumen generado", type: "success" })
    router.refresh()
  }

  return (
    <Button onClick={generar} disabled={generando}>
      {generando ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <SparklesIcon data-icon="inline-start" />
      )}
      {generando ? "Generando…" : "Generar resumen ahora"}
    </Button>
  )
}
