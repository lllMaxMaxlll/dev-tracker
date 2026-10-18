"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { issues } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

/**
 * Saca una orden de la Bandeja: confirma que el tipo, la prioridad y el
 * proyecto que eligió la IA están bien (o que ya los corregiste).
 */
export async function marcarRevisada(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    await db
      .update(issues)
      .set({ reviewedAt: new Date() })
      .where(and(eq(issues.id, id), eq(issues.userId, user.id)))

    revalidatePath("/bandeja")
    revalidatePath("/")

    return actionOk()
  } catch (error) {
    console.error("[marcarRevisada]", error)

    return actionError("No se pudo marcar como revisada")
  }
}
