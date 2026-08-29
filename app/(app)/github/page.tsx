import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Proximamente } from "@/components/layout/proximamente"

export const metadata: Metadata = { title: "GitHub · DevTracker" }

export default function Page() {
  return (
    <>
      <PageHeader
        title="GitHub"
        description="Commits, ramas, PRs e issues de tus repositorios."
      />
      <Proximamente
        fase="Fase 4"
        detalle="Listado de repos, heatmap de commits, PRs, issues y ramas activas."
      />
    </>
  )
}
