"use server"

import { revalidatePath } from "next/cache"
import { and, eq, ne } from "drizzle-orm"

import { conDb, db } from "@/lib/db"
import { issues, projects } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import {
  createProjectSchema,
  slugify,
  updateProjectSchema,
} from "@/lib/schemas/project"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

/**
 * Devuelve un slug libre para este usuario. Si `proyecto-fischer` ya existe,
 * prueba `proyecto-fischer-2`, y así.
 */
async function slugDisponible(
  userId: string,
  nombre: string,
  excluirId?: string
): Promise<string> {
  const base = slugify(nombre) || "proyecto"

  const existentes = await db
    .select({ slug: projects.slug })
    .from(projects)
    .where(
      excluirId
        ? and(eq(projects.userId, userId), ne(projects.id, excluirId))
        : eq(projects.userId, userId)
    )

  const usados = new Set(existentes.map((fila) => fila.slug))

  if (!usados.has(base)) {
    return base
  }

  let sufijo = 2
  while (usados.has(`${base}-${sufijo}`)) {
    sufijo++
  }

  return `${base}-${sufijo}`
}

export async function createProject(
  valores: unknown
): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireUser()
  const parsed = createProjectSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del proyecto",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const datos = parsed.data

  try {
    return await conDb(async () => {
      const [proyecto] = await db
        .insert(projects)
        .values({
          userId: user.id,
          name: datos.name,
          slug: await slugDisponible(user.id, datos.name),
          description: datos.description || null,
          color: datos.color || null,
          githubRepoFullName: datos.githubRepoFullName || null,
        })
        .returning({ id: projects.id, slug: projects.slug })

      revalidatePath("/proyectos")
      revalidatePath("/problemas")

      return actionOk(proyecto)
    })
  } catch (error) {
    console.error("[createProject]", error)

    return actionError("No se pudo crear el proyecto")
  }
}

export async function updateProject(valores: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = updateProjectSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del proyecto",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const { id, ...datos } = parsed.data

  try {
    return await conDb(async () => {
      const actualizados = await db
        .update(projects)
        .set({
          name: datos.name,
          slug: await slugDisponible(user.id, datos.name, id),
          description: datos.description || null,
          color: datos.color || null,
          githubRepoFullName: datos.githubRepoFullName || null,
          isArchived: datos.isArchived ?? false,
        })
        // El filtro por userId es lo que impide editar el proyecto de otro.
        .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
        .returning({ id: projects.id })

      if (actualizados.length === 0) {
        return actionError("No se encontró el proyecto")
      }

      revalidatePath("/proyectos")
      revalidatePath("/problemas")

      return actionOk()
    })
  } catch (error) {
    console.error("[updateProject]", error)

    return actionError("No se pudo guardar el proyecto")
  }
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    return await conDb(async () => {
      // Los problemas del proyecto NO se borran: la FK está en `set null`, así
      // que quedan sin proyecto en vez de desaparecer sin aviso.
      const borrados = await db
        .delete(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, user.id)))
        .returning({ id: projects.id })

      if (borrados.length === 0) {
        return actionError("No se encontró el proyecto")
      }

      revalidatePath("/proyectos")
      revalidatePath("/problemas")

      return actionOk()
    })
  } catch (error) {
    console.error("[deleteProject]", error)

    return actionError("No se pudo borrar el proyecto")
  }
}

/** Cuántos problemas quedarían huérfanos si se borra el proyecto. */
export async function countProjectIssues(id: string): Promise<number> {
  const user = await requireUser()

  return conDb(async () => {
    const filas = await db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.projectId, id), eq(issues.userId, user.id)))

    return filas.length
  })
}
