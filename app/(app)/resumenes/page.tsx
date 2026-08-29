import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { SummaryList } from "@/components/summaries/summary-list"
import { GenerateSummaryButton } from "@/components/summaries/generate-button"
import { requireUser } from "@/lib/auth/require-user"
import { listarResumenes } from "@/lib/db/queries/summaries"

export const metadata: Metadata = { title: "Resúmenes · DevTracker" }

async function Resumenes() {
  const user = await requireUser()
  const resumenes = await listarResumenes(user.id)

  return <SummaryList resumenes={resumenes} />
}

export default function ResumenesPage() {
  return (
    <>
      <PageHeader
        title="Resúmenes"
        description="Qué avanzaste, qué quedó trabado y qué conviene atacar. Se generan solos los viernes."
      />

      <GenerateSummaryButton />

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        }
      >
        <Resumenes />
      </Suspense>
    </>
  )
}
