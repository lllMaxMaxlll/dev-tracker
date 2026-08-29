"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EnumSelect } from "@/components/ui/enum-select"
import {
  ESTADOS,
  ETIQUETAS_ESTADO,
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_TIPO,
  PRIORIDADES,
  TIPOS,
} from "@/lib/schemas/enums"
import { conParametros } from "@/lib/utils/search-params"
import type { ProyectoOpcion } from "@/components/issues/issue-form-dialog"

/**
 * Los filtros viven en la URL, no en estado local: así la vista es
 * compartible, sobrevive al refresh y el servidor puede filtrar en SQL.
 */
export function IssueFilters({ proyectos }: { proyectos: ProyectoOpcion[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [busqueda, setBusqueda] = React.useState(searchParams.get("q") ?? "")

  function aplicar(cambios: Record<string, string | null>) {
    router.push(`${pathname}${conParametros(searchParams, cambios)}`)
  }

  // El buscador espera a que dejes de tipear para no navegar en cada tecla.
  React.useEffect(() => {
    const actual = searchParams.get("q") ?? ""

    if (busqueda === actual) {
      return
    }

    const id = setTimeout(() => aplicar({ q: busqueda || null }), 350)

    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda])

  const hayFiltros = ["proyecto", "tipo", "estado", "prioridad", "q"].some(
    (clave) => searchParams.get(clave)
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 sm:max-w-xs">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar en título y descripción"
          aria-label="Buscar problemas"
          className="pl-8"
        />
      </div>

      <EnumSelect
        placeholder="Proyecto"
        value={searchParams.get("proyecto")}
        onValueChange={(valor) => aplicar({ proyecto: valor })}
        opciones={proyectos.map((p) => ({ label: p.name, value: p.slug }))}
      />

      <EnumSelect
        placeholder="Tipo"
        value={searchParams.get("tipo")}
        onValueChange={(valor) => aplicar({ tipo: valor })}
        opciones={TIPOS.map((t) => ({ label: ETIQUETAS_TIPO[t], value: t }))}
      />

      <EnumSelect
        placeholder="Estado"
        value={searchParams.get("estado")}
        onValueChange={(valor) => aplicar({ estado: valor })}
        opciones={ESTADOS.map((e) => ({
          label: ETIQUETAS_ESTADO[e],
          value: e,
        }))}
      />

      <EnumSelect
        placeholder="Prioridad"
        value={searchParams.get("prioridad")}
        onValueChange={(valor) => aplicar({ prioridad: valor })}
        opciones={PRIORIDADES.map((p) => ({
          label: ETIQUETAS_PRIORIDAD[p],
          value: p,
        }))}
      />

      {hayFiltros ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setBusqueda("")
            aplicar({
              proyecto: null,
              tipo: null,
              estado: null,
              prioridad: null,
              q: null,
            })
          }}
        >
          <XIcon data-icon="inline-start" />
          Limpiar
        </Button>
      ) : null}
    </div>
  )
}
