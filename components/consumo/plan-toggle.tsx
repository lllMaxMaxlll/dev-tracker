"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { cambiarPlanDeVista } from "@/actions/monitor"
import type { UsageSource } from "@/lib/db/schema"

const TITULOS: Record<string, string> = {
  vercel: "Vercel",
  supabase: "Supabase",
  openrouter: "OpenRouter",
}

export type PlanDeFuente = {
  fuente: UsageSource
  detectado: string | null
  enVista: string | null
  disponibles: string[]
}

/**
 * Con qué plan mirar cada fuente.
 *
 * No cambia de plan ni pretende hacerlo: cambia el denominador de las barras,
 * para poder ver el mismo consumo contra las cuotas de Pro antes de pagarlo. El
 * plan real se detecta solo en cada recolección y es el que se marca como tal.
 */
export function PlanToggle({ planes }: { planes: PlanDeFuente[] }) {
  if (planes.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {planes.map((fuente) => (
        <FilaDeFuente key={fuente.fuente} fuente={fuente} />
      ))}

      <p className="text-xs text-muted-foreground">
        Cambiar el plan acá sólo cambia contra qué cuotas se comparan los
        números. Las alertas se evalúan siempre contra el plan real.
      </p>
    </div>
  )
}

function FilaDeFuente({ fuente }: { fuente: PlanDeFuente }) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState(false)

  async function elegir(plan: string) {
    setOcupado(true)

    // Volver al plan detectado se guarda como "sin preferencia", no como el
    // nombre del plan: así sigue al día solo si alguna vez cambia de verdad.
    const resultado = await cambiarPlanDeVista(
      fuente.fuente,
      plan === fuente.detectado ? null : plan
    )

    setOcupado(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 text-sm font-medium">
        {TITULOS[fuente.fuente] ?? fuente.fuente}
      </span>

      <div className="flex gap-1">
        {fuente.disponibles.map((plan) => (
          <Button
            key={plan}
            size="sm"
            variant={fuente.enVista === plan ? "default" : "outline"}
            onClick={() => elegir(plan)}
            disabled={ocupado}
          >
            {plan}
          </Button>
        ))}
      </div>

      {fuente.detectado ? (
        <span className="text-xs text-muted-foreground">
          plan real: {fuente.detectado}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">
          no se pudo detectar el plan
        </span>
      )}
    </div>
  )
}
