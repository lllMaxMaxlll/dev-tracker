"use client"

import * as React from "react"

import { toast } from "@/components/ui/toast"
import {
  IssueFormDialog,
  type AreaOpcion,
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"
import { getIssueFormValues } from "@/actions/issues"
import type { IssueFormValues } from "@/lib/schemas/issue"

/**
 * Editar un problema desde una lista, sin pasar por su página.
 *
 * Los valores se piden al abrir en vez de venir con la lista: ni el kanban ni
 * la tabla traen la descripción —serían cientos de líneas de texto por fila que
 * nadie mira— y guardar sin ella la borraría.
 *
 * Lo usan el tablero y la tabla; devuelve el diálogo ya armado para que el que
 * llama sólo lo ponga al final de su árbol.
 */
export function useEdicionRapida({
  proyectos,
  areas,
}: {
  proyectos: ProyectoOpcion[]
  areas: AreaOpcion[]
}) {
  const [abriendo, setAbriendo] = React.useState<string | null>(null)
  const [editando, setEditando] = React.useState<{
    id: string
    valores: IssueFormValues
  } | null>(null)

  async function abrir(id: string) {
    setAbriendo(id)
    const resultado = await getIssueFormValues(id)
    setAbriendo(null)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    setEditando({ id, valores: resultado.data })
  }

  const dialogo = editando ? (
    <IssueFormDialog
      open
      onOpenChange={(abierto) => !abierto && setEditando(null)}
      proyectos={proyectos}
      areas={areas}
      issueId={editando.id}
      valoresIniciales={editando.valores}
    />
  ) : null

  return {
    /** Id del problema cuyos datos se están pidiendo, si hay alguno. */
    abriendo,
    abrir,
    dialogo,
  }
}
