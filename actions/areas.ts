"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { projectAreas, projects } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { createAreaSchema, updateAreaSchema } from "@/lib/schemas/area"
import { slugify } from "@/lib/schemas/project"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

function revalidarVistas() {
  revalidatePath("/proyectos")
  revalidatePath("/problemas")
}

/** Postgres avisa el choque con el índice único (project_id, slug). */
function esNombreRepetido(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  )
}

export async function createArea(
  valores: unknown
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser()
  const parsed = createAreaSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del área",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const { projectId, name, color } = parsed.data

  try {
    // El proyecto tiene que ser del usuario: sin esta comprobación se podrían
    // colgar áreas del proyecto de otra cuenta.
    const [proyecto] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.userId, user.id)))
      .limit(1)

    if (!proyecto) {
      return actionError("No se encontró el proyecto")
    }

    const slug = slugify(name)

    if (!slug) {
      return actionError("Revisá los datos del área", {
        name: ["Poné un nombre con letras o números"],
      })
    }

    const [area] = await db
      .insert(projectAreas)
      .values({
        userId: user.id,
        projectId,
        name,
        slug,
        color: color || null,
      })
      .returning({ id: projectAreas.id })

    revalidarVistas()

    return actionOk(area)
  } catch (error) {
    if (esNombreRepetido(error)) {
      return actionError("Ese proyecto ya tiene un área con ese nombre", {
        name: ["Ya existe"],
      })
    }

    console.error("[createArea]", error)

    return actionError("No se pudo crear el área")
  }
}

export async function updateArea(valores: unknown): Promise<ActionResult> {
  const user = await requireUser()
  const parsed = updateAreaSchema.safeParse(valores)

  if (!parsed.success) {
    return actionError(
      "Revisá los datos del área",
      parsed.error.flatten().fieldErrors as Record<string, string[]>
    )
  }

  const { id, name, color } = parsed.data
  const slug = slugify(name)

  if (!slug) {
    return actionError("Revisá los datos del área", {
      name: ["Poné un nombre con letras o números"],
    })
  }

  try {
    const actualizadas = await db
      .update(projectAreas)
      .set({ name, slug, color: color || null })
      .where(and(eq(projectAreas.id, id), eq(projectAreas.userId, user.id)))
      .returning({ id: projectAreas.id })

    if (actualizadas.length === 0) {
      return actionError("No se encontró el área")
    }

    revalidarVistas()

    return actionOk()
  } catch (error) {
    if (esNombreRepetido(error)) {
      return actionError("Ese proyecto ya tiene un área con ese nombre", {
        name: ["Ya existe"],
      })
    }

    console.error("[updateArea]", error)

    return actionError("No se pudo guardar el área")
  }
}

/**
 * Borrar un área no borra sus problemas: la FK los deja sin área (`set null`),
 * que es lo mismo que tenían antes de clasificarlos.
 */
export async function deleteArea(id: string): Promise<ActionResult> {
  const user = await requireUser()

  try {
    const borradas = await db
      .delete(projectAreas)
      .where(and(eq(projectAreas.id, id), eq(projectAreas.userId, user.id)))
      .returning({ id: projectAreas.id })

    if (borradas.length === 0) {
      return actionError("No se encontró el área")
    }

    revalidarVistas()

    return actionOk()
  } catch (error) {
    console.error("[deleteArea]", error)

    return actionError("No se pudo borrar el área")
  }
}
