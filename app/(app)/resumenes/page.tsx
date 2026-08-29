import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"

export const metadata: Metadata = { title: "Resúmenes · DevTracker" }

export default function Page() {
  return (
    <>
      <PageHeader
        title="Resúmenes"
        description="Qué avanzaste, qué quedó trabado y qué conviene atacar."
      />
      <Proximamente
        fase="Fase 6"
        detalle="Resúmenes semanales generados automáticamente los viernes."
      />
    </>
  )
}
