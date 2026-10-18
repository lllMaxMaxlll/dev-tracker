"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { issues, projects } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { priorizar, type ItemPriorizado } from "@/lib/ai/tasks/prioritize"
import { enriquecer, type Enriquecimiento } from "@/lib/ai/tasks/enrich"
import { generarResumenSemanal } from "@/lib/ai/tasks/summary"
import { getAbiertosParaPriorizar } from "@/lib/db/queries/semana"
import { capturarProblema } from "@/lib/ai/tasks/capture"
import { listAreas, listProjectOptions } from "@/lib/db/queries/projects"
import { esErrorIA } from "@/lib/ai/errors"
import { buscarPosiblesDuplicados } from "@/actions/duplicates"
import type { Similar } from "@/lib/ai/embeddings"
import { crearIssue } from "@/lib/issues/crear"
import { actionError, actionOk, type ActionResult } from "@/actions/types"
import { createIssueSchema, type IssueFormValues } from "@/lib/schemas/issue"

export type CapturaSugerida = {
  valores: IssueFormValues
  /** Nombre del proyecto que el modelo mencionó y todavía no existe. */
  proyectoNuevo: string | null
  confianza: number
  /** Problemas parecidos a la nota, para avisar antes de crear otro igual. */
  similares: Similar[]
}

/**
 * Interpreta la nota con el modelo. Compartida por la captura con formulario y
 * por la que manda directo a la Bandeja; las dos validan antes de llamarla.
 */
async function interpretarNota(
  userId: string,
  nota: string,
  { buscarParecidos }: { buscarParecidos: boolean }
): Promise<CapturaSugerida> {
  const [proyectos, areas] = await Promise.all([
    listProjectOptions(userId),
    listAreas(userId),
  ])

  const slugDeProyecto = new Map(proyectos.map((p) => [p.id, p.slug]))

  // Los parecidos se buscan en paralelo con la interpretación: el modelo ya
  // tarda unos segundos, así que el aviso de duplicado no suma espera. Si la
  // búsqueda falla devuelve lista vacía; nunca bloquea la captura.
  const [resultado, similares] = await Promise.all([
    capturarProblema({
      userId,
      texto: nota,
      proyectos: proyectos.map((p) => ({ slug: p.slug, name: p.name })),
      areas: areas.flatMap((a) => {
        const proyectoSlug = slugDeProyecto.get(a.projectId)

        return proyectoSlug ? [{ slug: a.slug, name: a.name, proyectoSlug }] : []
      }),
    }),
    buscarParecidos ? buscarPosiblesDuplicados(nota) : Promise.resolve([]),
  ])

  const proyecto = resultado.proyectoSlug
    ? proyectos.find((p) => p.slug === resultado.proyectoSlug)
    : undefined

  // Un área sólo vale si es del proyecto elegido: los slugs se repiten.
  const area =
    proyecto && resultado.areaSlug
      ? areas.find(
          (a) => a.projectId === proyecto.id && a.slug === resultado.areaSlug
        )
      : undefined

  return {
    valores: {
      title: resultado.titulo,
      description: resultado.descripcion || "",
      projectId: proyecto?.id ?? "",
      areaId: area?.id ?? "",
      type: resultado.tipo,
      priority: resultado.prioridad,
      status: resultado.estado,
    },
    // Si el modelo dijo un slug que no existe, se trata como proyecto nuevo.
    proyectoNuevo:
      resultado.proyectoNuevo ??
      (resultado.proyectoSlug && !proyecto ? resultado.proyectoSlug : null),
    confianza: resultado.confianza,
    similares,
  }
}

function validarNota(texto: string): { nota: string } | { error: string } {
  const nota = texto.trim()

  if (nota.length < 5) {
    return { error: "Escribí un poco más para que pueda interpretarlo" }
  }

  if (nota.length > 4000) {
    return { error: "La nota es demasiado larga (máximo 4000 caracteres)" }
  }

  return { nota }
}

function errorDeCaptura(error: unknown, donde: string) {
  if (esErrorIA(error)) {
    return actionError(
      error.detalle ? `${error.message} ${error.detalle}` : error.message
    )
  }

  console.error(`[${donde}]`, error)

  return actionError("No se pudo interpretar la nota. Probá de nuevo.")
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
  const validada = validarNota(texto)

  if ("error" in validada) return actionError(validada.error)

  try {
    return actionOk(
      await interpretarNota(user.id, validada.nota, { buscarParecidos: true })
    )
  } catch (error) {
    return errorDeCaptura(error, "capturarDesdeTexto")
  }
}

/**
 * Interpreta la nota y la guarda directo en la Bandeja, sin pasar por el
 * formulario. Es la captura rápida: queda sin revisar hasta que la confirmes
 * allá, así que la regla de "la IA propone, vos aceptás" se sigue cumpliendo.
 *
 * No busca parecidos: el embedding se guarda igual al crearla, y la Bandeja
 * los busca a pedido.
 */
export async function anotarEnBandeja(
  texto: string
): Promise<ActionResult<{ number: number }>> {
  const user = await requireUser()
  const validada = validarNota(texto)

  if ("error" in validada) return actionError(validada.error)

  try {
    const { valores } = await interpretarNota(user.id, validada.nota, {
      buscarParecidos: false,
    })

    // Lo que propone el modelo pasa por la misma validación que el formulario.
    const creado = await crearIssue(user.id, createIssueSchema.parse(valores), {
      sinRevisar: true,
      via: "ai_capture",
    })

    revalidatePath("/bandeja")
    revalidatePath("/ordenes")
    revalidatePath("/")

    return actionOk({ number: creado.number })
  } catch (error) {
    return errorDeCaptura(error, "anotarEnBandeja")
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Priorización, enriquecimiento y resumen manual
// ─────────────────────────────────────────────────────────────────────────────

export type OrdenPriorizable = { id: string; title: string; status: string }

export async function queHagoHoy(): Promise<
  ActionResult<{
    orden: ItemPriorizado[]
    /** Por número: lo que hace falta para mostrar y mover cada sugerida. */
    ordenes: Record<number, OrdenPriorizable>
  }>
> {
  const user = await requireUser()

  try {
    const abiertos = await getAbiertosParaPriorizar(user.id)

    if (abiertos.length === 0) {
      return actionError("No tenés órdenes abiertas")
    }

    const orden = await priorizar({ userId: user.id, problemas: abiertos })

    const ordenes: Record<number, OrdenPriorizable> = {}
    for (const problema of abiertos) {
      ordenes[problema.number] = {
        id: problema.id,
        title: problema.title,
        status: problema.status,
      }
    }

    return actionOk({ orden, ordenes })
  } catch (error) {
    if (esErrorIA(error)) {
      return actionError(error.message)
    }

    console.error("[queHagoHoy]", error)

    return actionError("No se pudo generar la sugerencia")
  }
}

export async function ayudameACompletar(
  issueId: string
): Promise<ActionResult<Enriquecimiento>> {
  const user = await requireUser()

  try {
    const [issue] = await db
      .select({
        title: issues.title,
        description: issues.description,
        type: issues.type,
        projectName: projects.name,
      })
      .from(issues)
      .leftJoin(projects, eq(projects.id, issues.projectId))
      .where(and(eq(issues.id, issueId), eq(issues.userId, user.id)))
      .limit(1)

    if (!issue) {
      return actionError("No se encontró el problema")
    }

    const resultado = await enriquecer({
      userId: user.id,
      titulo: issue.title,
      descripcion: issue.description,
      tipo: issue.type,
      proyecto: issue.projectName,
    })

    return actionOk(resultado)
  } catch (error) {
    if (esErrorIA(error)) {
      return actionError(error.message)
    }

    console.error("[ayudameACompletar]", error)

    return actionError("No se pudieron generar sugerencias")
  }
}

/** Botón "Generar resumen ahora" de la página Resúmenes. */
export async function generarResumenAhora(): Promise<
  ActionResult<{ generado: boolean; motivo?: string }>
> {
  const user = await requireUser()

  try {
    const resultado = await generarResumenSemanal({
      userId: user.id,
      origen: "manual",
      forzar: true,
    })

    revalidatePath("/informes")
    revalidatePath("/")

    return actionOk(resultado)
  } catch (error) {
    if (esErrorIA(error)) {
      return actionError(error.message)
    }

    console.error("[generarResumenAhora]", error)

    return actionError("No se pudo generar el resumen")
  }
}
