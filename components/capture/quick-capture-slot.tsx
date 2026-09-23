import { QuickCapture } from "@/components/capture/quick-capture"
import { Skeleton } from "@/components/ui/skeleton"
import { getUser } from "@/lib/auth/require-user"
import { listAreas, listProjectOptions } from "@/lib/db/queries/projects"

/**
 * Carga la lista de proyectos para precargar el selector del alta rápida.
 * Va en su propio componente async para que el shell se pueda prerenderizar.
 */
export async function QuickCaptureSlot() {
  const user = await getUser()

  if (!user) {
    return null
  }

  const [proyectos, areas] = await Promise.all([
    listProjectOptions(user.id),
    listAreas(user.id),
  ])

  return <QuickCapture proyectos={proyectos} areas={areas} />
}

export function QuickCaptureFallback() {
  return <Skeleton className="h-8 w-24" />
}
