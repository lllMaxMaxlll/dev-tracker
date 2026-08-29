"use server"

import { requireUser } from "@/lib/auth/require-user"
import { capturarProblema } from "@/lib/ai/tasks/capture"
import { listProjectOptions } from "@/lib/db/queries/projects"
import { esErrorIA } from "@/lib/ai/errors"
import { actionError, actionOk, type ActionResult } from "@/actions/types"
import type { IssueFormValues } from "@/lib/schemas/issue"

export type CapturaSugerida = {
  valores: IssueFormValues
  /** Nombre del proyecto que el modelo mencionó y todavía no existe. */
  proyectoNuevo: string | null
  confianza: number
}

/**
 * Manda la nota al modelo y devuelve el problema estructurado.
 *
 * NO guarda nada: el resultado precarga el formulario y el usuario confirma.
 */
export async function capturarDesdeTexto(
  texto: string
): Promise<ActionResult<CapturaSugerida>> {
  const user = await requireUser()
  const limpio = texto.trim()

  if (limpio.length < 5) {
    return actionError("Escribí un poco más para que pueda interpretarlo")
  }

  if (limpio.length > 4000) {
    return actionError("La nota es demasiado larga (máximo 4000 caracteres)")
  }

  try {
    const proyectos = await listProjectOptions(user.id)

    const resultado = await capturarProblema({
      userId: user.id,
      texto: limpio,
      proyectos: proyectos.map((p) => ({ slug: p.slug, name: p.name })),
    })

    const proyecto = resultado.proyectoSlug
      ? proyectos.find((p) => p.slug === resultado.proyectoSlug)
      : undefined

    return actionOk({
      valores: {
        title: resultado.titulo,
        description: resultado.descripcion || "",
        projectId: proyecto?.id ?? "",
        type: resultado.tipo,
        priority: resultado.prioridad,
        status: resultado.estado,
      },
      // Si el modelo dijo un slug que no existe, se trata como proyecto nuevo.
      proyectoNuevo:
        resultado.proyectoNuevo ??
        (resultado.proyectoSlug && !proyecto ? resultado.proyectoSlug : null),
      confianza: resultado.confianza,
    })
  } catch (error) {
    if (esErrorIA(error)) {
      return actionError(
        error.detalle ? `${error.message} ${error.detalle}` : error.message
      )
    }

    console.error("[capturarDesdeTexto]", error)

    return actionError("No se pudo interpretar la nota. Probá de nuevo.")
  }
}
