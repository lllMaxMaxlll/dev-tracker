"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import {
  IssueFormDialog,
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"

/**
 * Alta manual, sin pasar por la IA.
 *
 * El botón del encabezado global («Anotar», tecla A) abre la captura en
 * lenguaje natural, que es el camino pensado para el celular y para cuando
 * tenés la idea suelta. Pero desde la lista de problemas el camino natural es
 * el otro: ya estás sentado, sabés qué querés cargar y llenar cuatro campos es
 * más rápido y más barato que esperar al modelo.
 */
export function NewIssueButton({ proyectos }: { proyectos: ProyectoOpcion[] }) {
  const router = useRouter()
  const [abierto, setAbierto] = React.useState(false)

  return (
    <>
      <Button variant="outline" onClick={() => setAbierto(true)}>
        <PlusIcon data-icon="inline-start" />
        Nuevo problema
        <Kbd className="ml-1 hidden md:inline-flex">C</Kbd>
      </Button>

      <IssueFormDialog
        open={abierto}
        onOpenChange={setAbierto}
        proyectos={proyectos}
        onGuardado={(creado) => {
          if (creado) {
            router.refresh()
          }
        }}
      />
    </>
  )
}
