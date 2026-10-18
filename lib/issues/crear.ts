import "server-only"

import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueStatusHistory, issues, userCounters } from "@/lib/db/schema"
import { areaValidaParaProyecto } from "@/lib/db/queries/projects"
import { guardarEmbedding } from "@/lib/ai/embeddings"
import type { IssueFormValues } from "@/lib/schemas/issue"

/**
 * Alta de una orden, compartida por el formulario y la Bandeja.
 *
 * No valida ni revalida: eso lo hace cada server action. Acá vive sólo lo que
 * tiene que ser igual en las dos: el número correlativo, el historial y el
 * embedding.
 */
export async function crearIssue(
  userId: string,
  datos: IssueFormValues,
  opciones: {
    /** Va a la Bandeja: queda sin `reviewed_at` hasta que la confirmes. */
    sinRevisar?: boolean
    via?: "manual" | "ai_capture"
  } = {}
): Promise<{ id: string; number: number }> {
  const areaId = await areaValidaParaProyecto(
    userId,
    datos.projectId || null,
    datos.areaId || null
  )

  const creado = await db.transaction(async (tx) => {
    // El número correlativo sale de un contador por usuario que se
    // incrementa acá adentro. Un `max(number) + 1` tendría una condición de
    // carrera entre dos altas simultáneas.
    const [contador] = await tx
      .insert(userCounters)
      .values({ userId, nextIssueNumber: 2 })
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
        userId,
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
        createdVia: opciones.via ?? "manual",
        reviewedAt: opciones.sinRevisar ? null : ahora,
      })
      .returning({ id: issues.id, number: issues.number })

    // El alta también queda registrada en el historial: sin esto, el primer
    // estado de un problema no tendría fecha y los tiempos de resolución
    // saldrían mal.
    await tx.insert(issueStatusHistory).values({
      userId,
      issueId: issue.id,
      fromStatus: null,
      toStatus: datos.status,
      source: "manual",
    })

    return issue
  })

  // El embedding se genera después de la transacción: si falla, la orden ya
  // quedó guardada. La detección de duplicados es una ayuda, no un requisito
  // para dar de alta.
  await guardarEmbedding(userId, creado.id, datos.title, datos.description)

  return creado
}
