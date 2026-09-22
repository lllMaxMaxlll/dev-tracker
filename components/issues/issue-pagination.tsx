"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { conParametros } from "@/lib/utils/search-params"
import { TAMANO_PAGINA } from "@/lib/schemas/issue"

/**
 * Paginación de la tabla. La página vive en la URL como el resto de los
 * filtros; la primera no se escribe, así la URL por defecto queda limpia.
 */
export function IssuePagination({
  pagina,
  total,
}: {
  pagina: number
  total: number
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const paginas = Math.max(1, Math.ceil(total / TAMANO_PAGINA))

  if (total === 0) return null

  const desde = (pagina - 1) * TAMANO_PAGINA + 1
  const hasta = Math.min(pagina * TAMANO_PAGINA, total)

  function href(destino: number) {
    return `${pathname}${conParametros(searchParams, {
      pagina: destino > 1 ? String(destino) : null,
    })}`
  }

  return (
    <nav
      aria-label="Paginación"
      className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
    >
      <span className="tabular-nums">
        {desde}–{hasta} de {total}
      </span>

      {paginas > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            render={pagina > 1 ? <Link href={href(pagina - 1)} /> : undefined}
            nativeButton={pagina <= 1}
          >
            <ChevronLeftIcon />
            Anterior
          </Button>
          <span className="tabular-nums">
            Página {pagina} de {paginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= paginas}
            render={
              pagina < paginas ? <Link href={href(pagina + 1)} /> : undefined
            }
            nativeButton={pagina >= paginas}
          >
            Siguiente
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </nav>
  )
}
