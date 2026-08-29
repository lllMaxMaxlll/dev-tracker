import { ConstructionIcon } from "lucide-react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * Placeholder de las secciones que llegan en fases posteriores. Existe para que
 * la navegación esté completa desde la Fase 1 y se pueda probar el shell.
 */
export function Proximamente({
  fase,
  detalle,
}: {
  fase: string
  detalle: string
}) {
  return (
    <Empty className="border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ConstructionIcon />
        </EmptyMedia>
        <EmptyTitle>En construcción</EmptyTitle>
        <EmptyDescription>{detalle}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <p className="text-xs text-muted-foreground">Llega en la {fase}.</p>
      </EmptyContent>
    </Empty>
  )
}
