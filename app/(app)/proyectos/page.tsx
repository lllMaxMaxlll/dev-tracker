import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"

export const metadata: Metadata = { title: "Proyectos · DevTracker" }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Agrupá tus problemas y vinculá cada proyecto a un repo."
      />
      <Proximamente
        fase="Fase 2"
        detalle="CRUD de proyectos y vinculación con repositorios de GitHub."
      />
    </>
  )
}
