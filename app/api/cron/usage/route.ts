import { NextResponse, type NextRequest } from "next/server"

import { env } from "@/lib/env"
import { recolectarTodo } from "@/lib/monitor/collect"
import { evaluarReglas } from "@/lib/monitor/evaluate"

/**
 * Recolección del consumo y evaluación de las alertas.
 *
 * La dispara dos relojes distintos, a propósito:
 *
 *   • GitHub Actions cada hora (.github/workflows/usage.yml). Es el reloj real:
 *     una alerta de "estás tocando el límite" que llega al día siguiente no
 *     sirve de nada.
 *   • El cron de vercel.json, una vez por día. Hobby no permite más frecuencia,
 *     pero es el piso que no se apaga: los workflows programados de GitHub se
 *     deshabilitan solos tras 60 días sin commits, y cuando eso pasa esta
 *     corrida diaria es la que dispara la alerta de "hace rato que no se
 *     recolecta".
 *
 * Es idempotente: los snapshots se upsertean por (recurso, métrica, día) y las
 * alertas tienen un UNIQUE por (regla, período). Correrla de más no duplica
 * nada ni reenvía mensajes.
 */
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secreto = env().CRON_SECRET

  if (!secreto) {
    return NextResponse.json(
      { error: "CRON_SECRET no está configurado" },
      { status: 500 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  // `?forzar=1` ignora la cadencia de cada colector. Lo usa el botón
  // "sincronizar ahora" de /consumo y sirve para depurar sin esperar una hora.
  const forzar = request.nextUrl.searchParams.get("forzar") === "1"

  const fuentes = await recolectarTodo({ forzar })

  // La evaluación va aparte del try de cada colector: aunque una fuente haya
  // fallado, las reglas de las otras tienen que evaluarse igual — y la de
  // antigüedad de la recolección, más que ninguna.
  let alertas
  let errorAlertas: string | undefined

  try {
    alertas = await evaluarReglas()
  } catch (error) {
    console.error("[cron/usage] evaluación de alertas", error)
    errorAlertas = error instanceof Error ? error.message : "error desconocido"
  }

  return NextResponse.json({ forzar, fuentes, alertas, errorAlertas })
}
