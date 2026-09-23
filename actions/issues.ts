"use server"

import { revalidatePath } from "next/cache"
import { and, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  issueAttachments,
  issueLinks,
  issueStatusHistory,
  issues,
  profiles,
  userCounters,
  type IssueStatus,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import {
  autoArchivoSchema,
  changeStatusSchema,
  createIssueSchema,
  linkIssueSchema,
  updateIssueSchema,
} from "@/lib/schemas/issue"
import { areaValidaParaProyecto } from "@/lib/db/queries/projects"
import { borrarObjetos } from "@/lib/storage/adjuntos"
import { guardarEmbedding } from "@/lib/ai/embeddings"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

function revalidarVistas(numero?: number) {
  revalidatePath("/problemas")
  revalidatePath("/proyectos")
  revalidatePath("/")

  if (numero !== undefined) {
    revalidatePath(`/problemas/${numero}`)
  }
}

export async function createIssue(
  valores: unknown
): Promise<ActionResult<{ id: string; number: number }>> {
  const user = await requireUser()
  const parsed = createIssueSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del problema",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const datos = parsed.data
  const areaId = await areaValidaParaProyecto(
    user.id,
    datos.projectId || null,
    datos.areaId || null
  )

  try {
    const creado = await db.transaction(async (tx) => {
      // El número correlativo sale de un contador por usuario que se
      // incrementa acá adentro. Un `max(number) + 1` tendría una condición de
      // carrera entre dos altas simultáneas.
      const [contador] = await tx
        .insert(userCounters)
        .values({ userId: user.id, nextIssueNumber: 2 })
        .onConflictDoUpdate({
          target: userCounters.userId,
          set: { nextIssueNumber: sql`${userCounters.nextIssueNumber} + 1` },
        })
        .returning({ siguiente: userCounters.nextIssueNumber })

      const numero = contador.siguiente - 1
      const ahora = new Date()

      const [issue] = await tx
        .insert(issues)
        .values({
          userId: user.id,
          number: numero,
          title: datos.title,
          description: datos.description || null,
          projectId: datos.projectId || null,
          areaId,
          type: datos.type,
          priority: datos.priority,
          status: datos.status,
          // Los nuevos van arriba de su columna en el kanban.
          kanbanOrder: -ahora.getTime(),
          resolvedAt: datos.status === "resuelto" ? ahora : null,
          firstInProgressAt: datos.status === "en_progreso" ? ahora : null,
        })
        .returning({ id: issues.id, number: issues.number })

      // El alta también queda registrada en el historial: sin esto, el primer
      // estado de un problema no tendría fecha y los tiempos de resolución
      // saldrían mal.
      await tx.insert(issueStatusHistory).values({
        userId: user.id,
        issueId: issue.id,
        fromStatus: null,
        toStatus: datos.status,
        source: "manual",
      })

      return issue
    })

    // El embedding se genera después de la transacción y sin await bloqueante
    // del resultado: si Workers AI falla, el problema ya quedó guardado. La
    // detección de duplicados es una ayuda, no un requisito para dar de alta.
    await guardarEmbedding(user.id, creado.id, datos.title, datos.description)

    revalidarVistas(creado.number)

    return actionOk(creado)
  } catch (error) {
    console.error("[createIssue]", error)

    return actionError("No se pudo crear el problema")
  }
}

export async function updateIssue(valores: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = updateIssueSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del problema",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const { id, ...datos } = parsed.data
  const areaId = await areaValidaParaProyecto(
    user.id,
    datos.projectId || null,
    datos.areaId || null
  )

  try {
    const [actual] = await db
      .select({ status: issues.status, number: issues.number })
      .from(issues)
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .limit(1)

    if (!actual) {
      return actionError("No se encontró el problema")
    }

    await db.transaction(async (tx) => {
      await tx
        .update(issues)
        .set({
          title: datos.title,
          description: datos.description || null,
          projectId: datos.projectId || null,
          areaId,
          type: datos.type,
          priority: datos.priority,
        })
        .where(and(eq(issues.id, id), eq(issues.userId, user.id)))

      // El estado se mueve por su propio camino para que el historial sea
      // siempre consistente, incluso cuando el form manda todo junto.
      if (datos.status !== actual.status) {
        await aplicarCambioDeEstado(tx, {
          userId: user.id,
          issueId: id,
          desde: actual.status,
          hacia: datos.status,
          source: "manual",
        })
      }
    })

    // `guardarEmbedding` compara el hash del contenido: si sólo cambió la
    // prioridad o el proyecto, no gasta una llamada.
    await guardarEmbedding(user.id, id, datos.title, datos.description)

    revalidarVistas(actual.number)

    return actionOk()
  } catch (error) {
    console.error("[updateIssue]", error)

    return actionError("No se pudo guardar el problema")
  }
}

/**
 * Único camino por el que cambia el estado de un problema.
 *
 * Escribe la fila de historial en la MISMA transacción que el update: si se
 * hicieran por separado, un fallo entre medio dejaría el historial mintiendo,
 * y de ahí salen los tiempos de resolución del dashboard.
 */
async function aplicarCambioDeEstado(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    userId: string
    issueId: string
    desde: IssueStatus
    hacia: IssueStatus
    source: "manual" | "ai_suggestion_accepted" | "system"
    note?: string
  }
) {
  const ahora = new Date()
  // Cambiar de estado es volver a trabajar en la tarjeta: si estaba
  // archivada, reaparece en el tablero.
  const cambios: Record<string, unknown> = {
    status: params.hacia,
    archivedAt: null,
  }

  if (params.hacia === "resuelto") {
    cambios.resolvedAt = ahora
  } else {
    // Reabrir un problema tiene que limpiar la fecha de resolución, si no el
    // tiempo promedio del dashboard queda contaminado.
    cambios.resolvedAt = null
  }

  if (params.hacia === "en_progreso") {
    cambios.firstInProgressAt = sql`coalesce(${issues.firstInProgressAt}, ${ahora})`
  }

  await tx
    .update(issues)
    .set(cambios)
    .where(and(eq(issues.id, params.issueId), eq(issues.userId, params.userId)))

  await tx.insert(issueStatusHistory).values({
    userId: params.userId,
    issueId: params.issueId,
    fromStatus: params.desde,
    toStatus: params.hacia,
    source: params.source,
    note: params.note ?? null,
  })
}

export async function changeIssueStatus(
  valores: unknown
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = changeStatusSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError("Estado inválido")
  }

  const { id, status, note } = parsed.data

  try {
    const [actual] = await db
      .select({ status: issues.status, number: issues.number })
      .from(issues)
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .limit(1)

    if (!actual) {
      return actionError("No se encontró el problema")
    }

    if (actual.status === status) {
      return actionOk()
    }

    await db.transaction(async (tx) => {
      await aplicarCambioDeEstado(tx, {
        userId: user.id,
        issueId: id,
        desde: actual.status,
        hacia: status,
        source: "manual",
        note,
      })
    })

    revalidarVistas(actual.number)

    return actionOk()
  } catch (error) {
    console.error("[changeIssueStatus]", error)

    return actionError("No se pudo cambiar el estado")
  }
}

/**
 * Cambio de estado y posición desde el kanban.
 * `orden` es la posición dentro de la columna destino.
 */
export async function moveIssue(
  id: string,
  status: IssueStatus,
  orden: number
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = changeStatusSchema.safeParse({ id, status })

  if (!parsed.success) {
    return actionError("Movimiento inválido")
  }

  try {
    const [actual] = await db
      .select({ status: issues.status })
      .from(issues)
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .limit(1)

    if (!actual) {
      return actionError("No se encontró el problema")
    }

    await db.transaction(async (tx) => {
      await tx
        .update(issues)
        .set({ kanbanOrder: orden })
        .where(and(eq(issues.id, id), eq(issues.userId, user.id)))

      if (actual.status !== status) {
        await aplicarCambioDeEstado(tx, {
          userId: user.id,
          issueId: id,
          desde: actual.status,
          hacia: status,
          source: "manual",
        })
      }
    })

    revalidarVistas()

    return actionOk()
  } catch (error) {
    console.error("[moveIssue]", error)

    return actionError("No se pudo mover el problema")
  }
}

/**
 * Archiva o desarchiva una tarjeta del kanban. Desarchivar también saca del
 * archivo a las que se archivaron solas: el update dispara el trigger de
 * `updated_at` y eso les reinicia el reloj del auto-archivado.
 */
export async function archiveIssue(
  id: string,
  archivar: boolean
): Promise<ActionResult> {
  const user = await requireUser()

  try {
    const actualizados = await db
      .update(issues)
      .set({ archivedAt: archivar ? new Date() : null })
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .returning({ number: issues.number })

    if (actualizados.length === 0) {
      return actionError("No se encontró el problema")
    }

    revalidarVistas(actualizados[0].number)

    return actionOk()
  } catch (error) {
    console.error("[archiveIssue]", error)

    return actionError(
      archivar ? "No se pudo archivar" : "No se pudo desarchivar"
    )
  }
}

/** Días sin actividad tras los que se archivan las tarjetas cerradas. */
export async function setAutoArchivoKanban(
  dias: unknown
): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = autoArchivoSchema.safeParse(dias)

  if (!parsed.success) {
    return actionError("Opción inválida")
  }

  try {
    await db
      .update(profiles)
      .set({ kanbanAutoArchiveDays: parsed.data })
      .where(eq(profiles.id, user.id))

    revalidatePath("/problemas")

    return actionOk()
  } catch (error) {
    console.error("[setAutoArchivoKanban]", error)

    return actionError("No se pudo guardar la preferencia")
  }
}

export async function deleteIssue(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    // Las filas de los adjuntos se van con el problema por la FK, pero los
    // archivos del bucket no: hay que sacarlos antes de perder sus rutas.
    const adjuntos = await db
      .select({ path: issueAttachments.path })
      .from(issueAttachments)
      .where(
        and(
          eq(issueAttachments.issueId, id),
          eq(issueAttachments.userId, user.id)
        )
      )

    const borrados = await db
      .delete(issues)
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .returning({ id: issues.id })

    if (borrados.length === 0) {
      return actionError("No se encontró el problema")
    }

    await borrarObjetos(adjuntos.map((a) => a.path))

    revalidarVistas()

    return actionOk()
  } catch (error) {
    console.error("[deleteIssue]", error)

    return actionError("No se pudo borrar el problema")
  }
}

/** Vincula un commit o PR al problema. */
export async function linkIssue(valores: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = linkIssueSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá la URL",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const { id, kind, url } = parsed.data

  try {
    const [issue] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))
      .limit(1)

    if (!issue) {
      return actionError("No se encontró el problema")
    }

    // De la URL de GitHub sacamos owner/repo y el sha, para poder mostrarlo
    // lindo sin pegarle a la API.
    const match = url.match(
      /github\.com\/([\w.-]+\/[\w.-]+)\/(?:commit|pull)\/([\w-]+)/
    )

    await db.transaction(async (tx) => {
      await tx.insert(issueLinks).values({
        userId: user.id,
        issueId: id,
        kind,
        url,
        repoFullName: match?.[1] ?? null,
        sha: kind === "commit" ? (match?.[2] ?? null) : null,
      })

      // El primero que se vincula queda como la resolución del problema.
      await tx
        .update(issues)
        .set({ resolutionUrl: url, resolutionKind: kind })
        .where(
          and(
            eq(issues.id, id),
            eq(issues.userId, user.id),
            sql`${issues.resolutionUrl} is null`
          )
        )
    })

    revalidarVistas(issue.number)

    return actionOk()
  } catch (error) {
    console.error("[linkIssue]", error)

    return actionError("No se pudo vincular")
  }
}

export async function unlinkIssue(linkId: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    await db
      .delete(issueLinks)
      .where(and(eq(issueLinks.id, linkId), eq(issueLinks.userId, user.id)))

    revalidarVistas()

    return actionOk()
  } catch (error) {
    console.error("[unlinkIssue]", error)

    return actionError("No se pudo desvincular")
  }
}
