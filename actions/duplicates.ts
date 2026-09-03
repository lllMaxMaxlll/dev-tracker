"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueRelations, issues } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import {
  buscarSimilares,
  generarEmbeddings,
  guardarEmbedding,
  textoDelProblema,
  type Similar,
} from "@/lib/ai/embeddings"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

/**
 * Busca problemas parecidos ANTES de crear uno nuevo.
 *
 * Se llama desde el formulario, con lo que el usuario ya escribió. Si algo
 * falla, devuelve lista vacía: es un aviso, no puede bloquear el alta.
 */
export async function buscarPosiblesDuplicados(
  titulo: string,
  descripcion?: string
): Promise<Similar[]> {
  const user = await requireUser()

  if (titulo.trim().length < 8) {
    return []
  }

  try {
    const texto = textoDelProblema(titulo, descripcion)
    const [vector] = await generarEmbeddings(user.id, [texto])

    if (!vector) {
      return []
    }

    // Umbral medido contra datos reales: una paráfrasis del mismo problema dio
    // 0,80; un problema distinto pero del mismo tema, 0,69; problemas sin
    // relación quedaron en 0,40. 0,65 separa bien las dos poblaciones.
    return await buscarSimilares({ userId: user.id, vector, umbral: 0.65 })
  } catch (error) {
    console.error("[buscarPosiblesDuplicados]", error)

    return []
  }
}

/** Problemas relacionados con uno existente, para la sección del detalle. */
export async function buscarRelacionados(issueId: string): Promise<Similar[]> {
  const user = await requireUser()

  try {
    const [issue] = await db
      .select({ title: issues.title, description: issues.description })
      .from(issues)
      .where(and(eq(issues.id, issueId), eq(issues.userId, user.id)))
      .limit(1)

    if (!issue) {
      return []
    }

    const texto = textoDelProblema(issue.title, issue.description)
    const [vector] = await generarEmbeddings(user.id, [texto])

    if (!vector) {
      return []
    }

    return await buscarSimilares({
      userId: user.id,
      vector,
      excluirIssueId: issueId,
      // Más permisivo que la detección de duplicados: acá mostrar algo de más
      // molesta menos que en un aviso al dar de alta.
      umbral: 0.55,
    })
  } catch (error) {
    console.error("[buscarRelacionados]", error)

    return []
  }
}

/** Vincula dos problemas como relacionados o duplicados. */
export async function vincularProblemas(params: {
  issueId: string
  relatedIssueId: string
  kind?: "duplicado" | "relacionado"
  similitud?: number
}): Promise<ActionResult> {
  const user = await requireUser()

  if (params.issueId === params.relatedIssueId) {
    return actionError("Un problema no se puede relacionar consigo mismo")
  }

  try {
    // Ambos ids se validan contra el user_id: no alcanza con que existan.
    const propios = await db
      .select({ id: issues.id })
      .from(issues)
      .where(eq(issues.userId, user.id))

    const ids = new Set(propios.map((i) => i.id))

    if (!ids.has(params.issueId) || !ids.has(params.relatedIssueId)) {
      return actionError("No se encontró alguno de los problemas")
    }

    await db
      .insert(issueRelations)
      .values({
        userId: user.id,
        issueId: params.issueId,
        relatedIssueId: params.relatedIssueId,
        kind: params.kind ?? "relacionado",
        similarity: params.similitud ?? null,
      })
      .onConflictDoNothing()

    revalidatePath("/problemas")

    return actionOk()
  } catch (error) {
    console.error("[vincularProblemas]", error)

    return actionError("No se pudo vincular")
  }
}

export async function desvincularProblemas(
  relacionId: string
): Promise<ActionResult> {
  const user = await requireUser()

  try {
    await db
      .delete(issueRelations)
      .where(
        and(
          eq(issueRelations.id, relacionId),
          eq(issueRelations.userId, user.id)
        )
      )

    revalidatePath("/problemas")

    return actionOk()
  } catch (error) {
    console.error("[desvincularProblemas]", error)

    return actionError("No se pudo desvincular")
  }
}

/**
 * Regenera los embeddings de todos los problemas del usuario.
 * Se ofrece desde Ajustes cuando cambia la dimensión del modelo.
 */
export async function regenerarEmbeddings(): Promise<
  ActionResult<{ procesados: number; fallidos: number }>
> {
  const user = await requireUser()

  try {
    const todos = await db
      .select({
        id: issues.id,
        title: issues.title,
        description: issues.description,
      })
      .from(issues)
      .where(eq(issues.userId, user.id))

    let fallidos = 0

    // De a uno para no pasarse del límite de CPU del Worker con muchos
    // problemas; cada llamada de embeddings es corta.
    for (const issue of todos) {
      const ok = await guardarEmbedding(
        user.id,
        issue.id,
        issue.title,
        issue.description
      )

      if (!ok) fallidos++
    }

    revalidatePath("/ajustes")

    return actionOk({ procesados: todos.length, fallidos })
  } catch (error) {
    console.error("[regenerarEmbeddings]", error)

    return actionError("No se pudieron regenerar los embeddings")
  }
}
