"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { alertRules } from "@/lib/db/schema"
import { requireUser } from "@/lib/auth/require-user"
import { recolectarTodo } from "@/lib/monitor/collect"
import { evaluarReglas } from "@/lib/monitor/evaluate"
import { setPlanDeVista } from "@/lib/monitor/quotas"
import type { UsageSource } from "@/lib/db/schema"
import { actionError, actionOk, type ActionResult } from "@/actions/types"

/**
 * Acciones del monitor de consumo.
 *
 * A diferencia del resto de las acciones del proyecto, estas no filtran por
 * `user.id`: el monitor describe la infraestructura de la instancia, no datos
 * de una persona (ver el comentario de las tablas en lib/db/schema.ts). Lo que
 * `requireUser()` sigue garantizando es que quien las ejecuta tiene sesión y
 * pasó la whitelist.
 */

/** Recolecta ahora, ignorando la cadencia de cada colector. */
export async function sincronizarAhora(): Promise<
  ActionResult<{ filas: number; fallos: string[] }>
> {
  await requireUser()

  try {
    const fuentes = await recolectarTodo({ forzar: true })

    await evaluarReglas()

    revalidatePath("/consumo")

    return actionOk({
      filas: fuentes.reduce((total, fuente) => total + fuente.filas, 0),
      fallos: fuentes
        .filter((fuente) => !fuente.ok)
        .map((fuente) => `${fuente.fuente}: ${fuente.error ?? "error"}`),
    })
  } catch (error) {
    console.error("[sincronizarAhora]", error)

    return actionError("No se pudo recolectar el consumo")
  }
}

export async function alternarRegla(
  id: string,
  activa: boolean
): Promise<ActionResult> {
  await requireUser()

  try {
    await db
      .update(alertRules)
      .set({ active: activa })
      .where(eq(alertRules.id, id))

    revalidatePath("/consumo")

    return actionOk()
  } catch (error) {
    console.error("[alternarRegla]", error)

    return actionError("No se pudo cambiar la regla")
  }
}

export async function cambiarUmbral(
  id: string,
  umbral: number
): Promise<ActionResult> {
  await requireUser()

  if (!Number.isFinite(umbral) || umbral <= 0) {
    return actionError("El umbral tiene que ser un número mayor que cero")
  }

  try {
    await db
      .update(alertRules)
      .set({ threshold: umbral.toFixed(6) })
      .where(eq(alertRules.id, id))

    revalidatePath("/consumo")

    return actionOk()
  } catch (error) {
    console.error("[cambiarUmbral]", error)

    return actionError("No se pudo guardar el umbral")
  }
}

/**
 * Silencio global. Es la misma operación que hace /silencio en Telegram: una
 * sola forma de callar las alertas, no dos que puedan desincronizarse.
 */
export async function silenciarTodo(
  horas: number | null
): Promise<ActionResult> {
  await requireUser()

  try {
    await db
      .update(alertRules)
      .set({
        silencedUntil:
          horas === null ? null : new Date(Date.now() + horas * 3_600_000),
      })
      .where(sql`true`)

    revalidatePath("/consumo")

    return actionOk()
  } catch (error) {
    console.error("[silenciarTodo]", error)

    return actionError("No se pudo silenciar")
  }
}

/**
 * Con las cuotas de qué plan mirar una fuente.
 *
 * Es una preferencia de vista, no un cambio de plan: sirve para ver cómo se
 * vería el mismo consumo en Pro antes de pagarlo. Las alertas siguen
 * evaluándose contra el plan real, porque una alerta tiene que dispararse
 * contra la cuota que te van a cobrar.
 *
 * `null` vuelve al plan detectado, que es lo que se quiere casi siempre.
 */
export async function cambiarPlanDeVista(
  fuente: UsageSource,
  plan: string | null
): Promise<ActionResult> {
  await requireUser()

  try {
    await setPlanDeVista(fuente, plan)

    revalidatePath("/consumo")

    return actionOk()
  } catch (error) {
    console.error("[cambiarPlanDeVista]", error)

    return actionError("No se pudo cambiar el plan de la vista")
  }
}
