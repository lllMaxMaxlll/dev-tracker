import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"

export const metadata: Metadata = { title: "Ajustes · DevTracker" }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Ajustes"
        description="Modelos de IA, API keys y consumo del mes."
      />
      <Proximamente
        fase="Fase 5"
        detalle="Selección de modelo por tarea, API key propia y panel de consumo."
      />
    </>
  )
}
