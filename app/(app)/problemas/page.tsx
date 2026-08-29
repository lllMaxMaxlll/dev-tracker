import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"

export const metadata: Metadata = { title: "Problemas · DevTracker" }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Problemas"
        description="Todo lo que anotarías en el cuaderno, en un solo lugar."
      />
      <Proximamente
        fase="Fase 2"
        detalle="Acá van la tabla con filtros y el tablero kanban con drag &amp; drop."
      />
    </>
  )
}
