import "server-only"

import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueAttachments } from "@/lib/db/schema"
import { firmarAdjuntos } from "@/lib/storage/adjuntos"

export type Adjunto = {
  id: string
  path: string
  fileName: string | null
  sizeBytes: number
  width: number | null
  height: number | null
  createdAt: Date
  /** URL firmada, o `null` si el bucket no la devolvió. */
  url: string | null
}

/**
 * Fotos de un problema, ya con su URL firmada lista para el `<img>`.
 *
 * La firma se pide una sola vez para todas: `createSignedUrls` acepta la lista
 * entera y evita una ida y vuelta por imagen.
 */
export async function listAttachments(
  userId: string,
  issueId: string
): Promise<Adjunto[]> {
  const filas = await db
    .select({
      id: issueAttachments.id,
      path: issueAttachments.path,
      fileName: issueAttachments.fileName,
      sizeBytes: issueAttachments.sizeBytes,
      width: issueAttachments.width,
      height: issueAttachments.height,
      createdAt: issueAttachments.createdAt,
    })
    .from(issueAttachments)
    .where(
      and(
        eq(issueAttachments.userId, userId),
        eq(issueAttachments.issueId, issueId)
      )
    )
    .orderBy(asc(issueAttachments.createdAt))

  const firmadas = await firmarAdjuntos(filas.map((f) => f.path))

  return filas.map((fila) => ({
    ...fila,
    url: firmadas.get(fila.path) ?? null,
  }))
}
