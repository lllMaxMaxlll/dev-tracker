"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { KanbanIcon, TableIcon } from "lucide-react"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { conParametros } from "@/lib/utils/search-params"

export function ViewSwitcher({ vista }: { vista: "tabla" | "kanban" }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (
    <ToggleGroup
      value={[vista]}
      onValueChange={(valores) => {
        const nueva = valores[0]

        // ToggleGroup permite deseleccionar; acá siempre tiene que haber una.
        if (!nueva || nueva === vista) return

        router.push(
          `${pathname}${conParametros(searchParams, { vista: nueva })}`
        )
      }}
      aria-label="Cambiar de vista"
    >
      <ToggleGroupItem value="tabla" aria-label="Vista de tabla">
        <TableIcon />
        <span className="hidden sm:inline">Tabla</span>
      </ToggleGroupItem>
      <ToggleGroupItem value="kanban" aria-label="Vista de tablero">
        <KanbanIcon />
        <span className="hidden sm:inline">Kanban</span>
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
