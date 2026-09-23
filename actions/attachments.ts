"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { issueAttachments, issues } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import {
  EXTENSIONES_ADJUNTO,
  MAX_ADJUNTOS_POR_ISSUE,
  MAX_BYTES_ADJUNTO,
  TIPOS_ADJUNTO,
  borrarObjetos,
  esRutaPropia,
  rutaAdjunto,
} from "@/lib/storage/adjuntos"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

const registrarSchema = z.object({
  issueId: z.uuid(),
  path: z.string().min(1).max(300),
  fileName: z.string().trim().max(120).optional(),
  mimeType: z.enum(TIPOS_ADJUNTO),
  sizeBytes: z.number().int().positive().max(MAX_BYTES_ADJUNTO),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
})

/**
 * Reserva la ruta donde el navegador va a subir una foto.
 *
 * La arma el servidor y no el cliente porque incluye el id del usuario, que es
 * lo que separa los archivos de una cuenta de los de otra. De paso se verifica
 * acá —antes de gastar la subida— que el problema sea tuyo y que todavía entre
 * una foto más.
 */
export async function prepararSubida(
  issueId: unknown,
  tipo: unknown
): Promise<ActionResult<{ path: string }>> {
  const user = await requireUser()
  const parsed = z
    .object({ issueId: z.uuid(), tipo: z.enum(TIPOS_ADJUNTO) })
    .safeParse({ issueId, tipo })

  if (!parsed.success) {
    return actionError("No se pudo preparar la subida")
  }

  try {
    const [issue] = await db
      .select({ id: issues.id })
      .from(issues)
      .where(
        and(eq(issues.id, parsed.data.issueId), eq(issues.userId, user.id))
      )
      .limit(1)

    if (!issue) {
      return actionError("No se encontró el problema")
    }

    const existentes = await db
      .select({ id: issueAttachments.id })
      .from(issueAttachments)
      .where(eq(issueAttachments.issueId, parsed.data.issueId))

    if (existentes.length >= MAX_ADJUNTOS_POR_ISSUE) {
      return actionError(
        `Un problema admite hasta ${MAX_ADJUNTOS_POR_ISSUE} fotos`
      )
    }

    const extension = EXTENSIONES_ADJUNTO[parsed.data.tipo]

    return actionOk({
      path: rutaAdjunto(
        user.id,
        parsed.data.issueId,
        `${crypto.randomUUID()}.${extension}`
      ),
    })
  } catch (error) {
    console.error("[prepararSubida]", error)

    return actionError("No se pudo preparar la subida")
  }
}

/**
 * Deja constancia en la base de una foto que el navegador ya subió al bucket.
 *
 * El archivo viaja del navegador a Supabase Storage directamente —no pasa por
 * el servidor de Next, que en Vercel tiene un límite de tamaño de request y
 * cobra por el tránsito—. Acá sólo se valida que la ruta caiga dentro de la
 * carpeta del usuario y de este problema, que es lo mismo que exigen las
 * políticas del bucket.
 */
export async function registrarAdjunto(
  valores: unknown
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = registrarSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError("No se pudo registrar la foto")
  }

  const datos = parsed.data

  if (!esRutaPropia(datos.path, user.id, datos.issueId)) {
    return actionError("La ruta del archivo no corresponde a este problema")
  }

  try {
    const [issue] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(and(eq(issues.id, datos.issueId), eq(issues.userId, user.id)))
      .limit(1)

    if (!issue) {
      return actionError("No se encontró el problema")
    }

    const existentes = await db
      .select({ id: issueAttachments.id })
      .from(issueAttachments)
      .where(eq(issueAttachments.issueId, datos.issueId))

    if (existentes.length >= MAX_ADJUNTOS_POR_ISSUE) {
      return actionError(
        `Un problema admite hasta ${MAX_ADJUNTOS_POR_ISSUE} fotos`
      )
    }

    const [adjunto] = await db
      .insert(issueAttachments)
      .values({
        userId: user.id,
        issueId: datos.issueId,
        path: datos.path,
        fileName: datos.fileName || null,
        mimeType: datos.mimeType,
        sizeBytes: datos.sizeBytes,
        width: datos.width ?? null,
        height: datos.height ?? null,
      })
      .returning({ id: issueAttachments.id })

    revalidatePath(`/problemas/${issue.number}`)

    return actionOk(adjunto)
  } catch (error) {
    console.error("[registrarAdjunto]", error)

    return actionError("No se pudo registrar la foto")
  }
}

/** Borra la fila y el archivo. Si el archivo ya no está, la fila se va igual. */
export async function borrarAdjunto(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    const [adjunto] = await db
      .select({
        path: issueAttachments.path,
        issueId: issueAttachments.issueId,
      })
      .from(issueAttachments)
      .where(
        and(eq(issueAttachments.id, id), eq(issueAttachments.userId, user.id))
      )
      .limit(1)

    if (!adjunto) {
      return actionError("No se encontró la foto")
    }

    await borrarObjetos([adjunto.path])

    await db
      .delete(issueAttachments)
      .where(
        and(eq(issueAttachments.id, id), eq(issueAttachments.userId, user.id))
      )

    const [issue] = await db
      .select({ number: issues.number })
      .from(issues)
      .where(eq(issues.id, adjunto.issueId))
      .limit(1)

    if (issue) {
      revalidatePath(`/problemas/${issue.number}`)
    }

    return actionOk()
  } catch (error) {
    console.error("[borrarAdjunto]", error)

    return actionError("No se pudo borrar la foto")
  }
}
