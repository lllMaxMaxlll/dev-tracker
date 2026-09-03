"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  commitLinkSuggestions,
  issueLinks,
  issues,
  projects,
} from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { sugerirVinculos } from "@/lib/ai/tasks/commit-link"
import { listarCommits } from "@/lib/github/queries"
import { cargarSeguro } from "@/lib/github/cargar-seguro"
import { getConfigTarea } from "@/lib/ai/settings"
import { esErrorIA } from "@/lib/ai/errors"
import { changeIssueStatus } from "@/actions/issues"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

/**
 * Busca commits que puedan resolver problemas abiertos y guarda las
 * sugerencias. NO cambia el estado de nada: son propuestas para aceptar.
 */
export async function buscarVinculosDeCommits(): Promise<
  ActionResult<{ nuevas: number; sinRepos: boolean }>
> {
  const user = await requireUser()

  try {
    const conRepo = await db
      .select({ repo: projects.githubRepoFullName })
      .from(projects)
      .where(
        and(
          eq(projects.userId, user.id),
          eq(projects.isArchived, false),
          isNotNull(projects.githubRepoFullName)
        )
      )

    if (conRepo.length === 0) {
      return actionOk({ nuevas: 0, sinRepos: true })
    }

    const abiertos = await db
      .select({
        number: issues.number,
        id: issues.id,
        title: issues.title,
        description: issues.description,
      })
      .from(issues)
      .where(
        and(
          eq(issues.userId, user.id),
          sql`${issues.status} in ('pendiente','en_progreso')`
        )
      )
      .limit(40)

    if (abiertos.length === 0) {
      return actionOk({ nuevas: 0, sinRepos: false })
    }

    const commits: {
      sha: string
      mensaje: string
      repo: string
      url: string
    }[] = []

    for (const { repo } of conRepo.slice(0, 3)) {
      const [owner, nombre] = (repo ?? "").split("/")

      if (!owner || !nombre) continue

      const resultado = await cargarSeguro(() =>
        listarCommits(user.id, owner, nombre, 30)
      )

      if (!resultado.ok) continue

      commits.push(
        ...resultado.datos.datos.map((c) => ({
          sha: c.sha,
          mensaje: c.mensaje,
          repo: repo!,
          url: c.url,
        }))
      )
    }

    if (commits.length === 0) {
      return actionError("No se pudieron leer commits de tus repos vinculados")
    }

    const pares = await sugerirVinculos({
      userId: user.id,
      problemas: abiertos,
      commits,
    })

    const { modelo } = await getConfigTarea(user.id, "fast")
    const porNumero = new Map(abiertos.map((i) => [i.number, i]))
    let nuevas = 0

    for (const par of pares) {
      const issue = porNumero.get(par.numeroProblema)
      const commit = commits.find((c) => c.sha === par.sha)

      if (!issue || !commit) continue

      const insertadas = await db
        .insert(commitLinkSuggestions)
        .values({
          userId: user.id,
          issueId: issue.id,
          repoFullName: commit.repo,
          commitSha: commit.sha,
          commitUrl: commit.url,
          commitMessage: commit.mensaje,
          confidence: par.confianza,
          rationale: par.justificacion,
          model: modelo,
        })
        // Si ya se sugirió ese par antes, no se vuelve a proponer: evita que
        // rechazar una sugerencia la traiga de vuelta en la próxima corrida.
        .onConflictDoNothing()
        .returning({ id: commitLinkSuggestions.id })

      nuevas += insertadas.length
    }

    revalidatePath("/problemas")

    return actionOk({ nuevas, sinRepos: false })
  } catch (error) {
    if (esErrorIA(error)) {
      return actionError(error.message)
    }

    console.error("[buscarVinculosDeCommits]", error)

    return actionError("No se pudieron buscar vínculos")
  }
}

export async function listarSugerenciasPendientes() {
  const user = await requireUser()

  return db
    .select({
      id: commitLinkSuggestions.id,
      issueId: commitLinkSuggestions.issueId,
      numero: issues.number,
      titulo: issues.title,
      repo: commitLinkSuggestions.repoFullName,
      sha: commitLinkSuggestions.commitSha,
      url: commitLinkSuggestions.commitUrl,
      mensaje: commitLinkSuggestions.commitMessage,
      confianza: commitLinkSuggestions.confidence,
      justificacion: commitLinkSuggestions.rationale,
    })
    .from(commitLinkSuggestions)
    .innerJoin(issues, eq(issues.id, commitLinkSuggestions.issueId))
    .where(
      and(
        eq(commitLinkSuggestions.userId, user.id),
        eq(commitLinkSuggestions.status, "pendiente")
      )
    )
    .orderBy(desc(commitLinkSuggestions.confidence))
}

/**
 * Acepta una sugerencia: guarda el commit en el problema.
 * El paso a "resuelto" es aparte y explícito — la IA no cambia estados sola.
 */
export async function aceptarSugerencia(
  sugerenciaId: string,
  marcarResuelto: boolean
): Promise<ActionResult> {
  const user = await requireUser()

  try {
    const [sugerencia] = await db
      .select()
      .from(commitLinkSuggestions)
      .where(
        and(
          eq(commitLinkSuggestions.id, sugerenciaId),
          eq(commitLinkSuggestions.userId, user.id)
        )
      )
      .limit(1)

    if (!sugerencia) {
      return actionError("No se encontró la sugerencia")
    }

    await db.transaction(async (tx) => {
      await tx.insert(issueLinks).values({
        userId: user.id,
        issueId: sugerencia.issueId,
        kind: "commit",
        url: sugerencia.commitUrl,
        repoFullName: sugerencia.repoFullName,
        sha: sugerencia.commitSha,
        title: sugerencia.commitMessage,
      })

      await tx
        .update(issues)
        .set({
          resolutionUrl: sugerencia.commitUrl,
          resolutionKind: "commit",
        })
        .where(
          and(
            eq(issues.id, sugerencia.issueId),
            eq(issues.userId, user.id),
            sql`${issues.resolutionUrl} is null`
          )
        )

      await tx
        .update(commitLinkSuggestions)
        .set({ status: "aceptada", resolvedAt: new Date() })
        .where(eq(commitLinkSuggestions.id, sugerenciaId))
    })

    if (marcarResuelto) {
      await changeIssueStatus({
        id: sugerencia.issueId,
        status: "resuelto",
        note: `Resuelto por el commit ${sugerencia.commitSha.slice(0, 7)}`,
      })
    }

    revalidatePath("/problemas")

    return actionOk()
  } catch (error) {
    console.error("[aceptarSugerencia]", error)

    return actionError("No se pudo aceptar la sugerencia")
  }
}

export async function rechazarSugerencia(
  sugerenciaId: string
): Promise<ActionResult> {
  const user = await requireUser()

  try {
    await db
      .update(commitLinkSuggestions)
      .set({ status: "rechazada", resolvedAt: new Date() })
      .where(
        and(
          eq(commitLinkSuggestions.id, sugerenciaId),
          eq(commitLinkSuggestions.userId, user.id)
        )
      )

    revalidatePath("/problemas")

    return actionOk()
  } catch (error) {
    console.error("[rechazarSugerencia]", error)

    return actionError("No se pudo rechazar la sugerencia")
  }
}
