import "server-only"

import { and, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { alertRules } from "@/lib/db/schema"
import {
  getEstadoDeFuentes,
  getRecursosConConsumo,
  getReglasConEstado,
} from "@/lib/db/queries/consumo"
import { definicionDe, formatearValor } from "@/lib/monitor/metrics"
import { escaparHtml, negrita } from "@/lib/telegram/format"

/**
 * Comandos del bot.
 *
 * Leen exactamente las mismas consultas que la página, así que el bot y
 * /consumo no pueden contradecirse. Cada función devuelve el texto y el
 * handler decide cómo mandarlo.
 */
export async function responder(texto: string): Promise<string> {
  const [comando, ...argumentos] = texto.trim().split(/\s+/)

  switch (comando?.toLowerCase().replace(/@.*$/, "")) {
    case "/start":
    case "/ayuda":
    case "/help":
      return ayuda()
    case "/consumo":
      return await consumo()
    case "/limites":
      return await limites()
    case "/silencio":
      return await silenciar(argumentos[0])
    default:
      return `No conozco ese comando.\n\n${ayuda()}`
  }
}

function ayuda(): string {
  return [
    negrita("DevTracker · monitor de consumo"),
    "",
    "/consumo — qué se está gastando ahora",
    "/limites — umbrales configurados y su estado",
    "/silencio 24h — callar las alertas un rato (24h, 7d, off)",
  ].join("\n")
}

async function consumo(): Promise<string> {
  const [recursos, estados] = await Promise.all([
    getRecursosConConsumo(),
    getEstadoDeFuentes(),
  ])

  const lineas = [negrita("Consumo")]

  for (const fuente of ["vercel", "supabase", "openrouter"] as const) {
    const delaFuente = recursos.filter((r) => r.fuente === fuente)
    const estado = estados.find((e) => e.fuente === fuente)

    lineas.push("", negrita(nombreDeFuente(fuente)))

    if (estado?.fallando) {
      lineas.push(
        `⚠️ la última recolección falló: ${escaparHtml(estado.ultimoError ?? "sin detalle")}`
      )
    }

    if (delaFuente.length === 0) {
      lineas.push("sin recursos registrados")

      continue
    }

    for (const recurso of delaFuente) {
      const detalle = resumirRecurso(recurso)

      // Los proyectos sin ninguna métrica no se listan: con nueve proyectos de
      // Vercel y despliegues en tres, el resto sería relleno.
      if (!detalle) continue

      lineas.push(`· ${escaparHtml(recurso.nombre)}: ${detalle}`)
    }
  }

  const ultima = estados
    .map((e) => e.ultimaOk)
    .filter((f): f is Date => Boolean(f))
    .sort((a, b) => b.getTime() - a.getTime())[0]

  lineas.push(
    "",
    ultima
      ? `Última recolección: ${escaparHtml(ultima.toISOString().replace("T", " ").slice(0, 16))} UTC`
      : "Todavía no se recolectó nada."
  )

  return lineas.join("\n")
}

const DESTACADAS = [
  "supabase.db_size_bytes",
  "supabase.disk_used_bytes",
  // Sólo aparece cuando el plan la factura: en Free es apenas el denominador
  // del disco usado, en Pro es la métrica por la que te cobran.
  "supabase.disk_size_bytes",
  "supabase.rest_requests",
  "supabase.auth_requests",
  "vercel.cost_usd",
  "vercel.deployments",
  "openrouter.usage_monthly_usd",
  "openrouter.credits_remaining_usd",
]

/** Una línea por recurso: las métricas que importan, no las trece. */
function resumirRecurso(
  recurso: Awaited<ReturnType<typeof getRecursosConConsumo>>[number]
): string | null {
  const partes: string[] = []

  for (const clave of DESTACADAS) {
    const metrica = recurso.metricas.find((m) => m.metrica === clave)

    if (!metrica || metrica.mes === 0 || metrica.soloTope) continue

    const definicion = definicionDe(clave)

    const porcentaje =
      metrica.tope && metrica.tope > 0
        ? ` (${Math.round((metrica.mes / metrica.tope) * 100)} %)`
        : ""

    const excedente = metrica.excedente
      ? ` ⚠️ +${formatearValor(metrica.excedente.costoUsd, "usd")}`
      : ""

    partes.push(
      `${definicion.etiqueta} ${formatearValor(metrica.mes, definicion.unidad)}${porcentaje}${excedente}`
    )
  }

  if (
    recurso.estado &&
    recurso.estado !== "ACTIVE_HEALTHY" &&
    recurso.fuente === "supabase"
  ) {
    partes.unshift(`⚠️ ${recurso.estado}`)
  }

  return partes.length ? escaparHtml(partes.join(" · ")) : null
}

async function limites(): Promise<string> {
  const reglas = await getReglasConEstado()

  if (reglas.length === 0) return "No hay reglas configuradas."

  const lineas = [negrita("Umbrales")]

  for (const regla of reglas) {
    const definicion = definicionDe(regla.metrica)

    const umbral =
      regla.tipoUmbral === "porcentaje_cuota"
        ? `${regla.umbral} % de la cuota`
        : formatearValor(regla.umbral, definicion.unidad)

    const marca = !regla.activa ? "⏸" : regla.silenciada ? "🔕" : "✅"

    lineas.push(
      `${marca} ${escaparHtml(regla.etiqueta)} — ${escaparHtml(umbral)} por ${regla.ventana === "dia" ? "día" : "mes"}`
    )

    if (regla.ultimoDisparo) {
      lineas.push(
        `   último aviso: ${escaparHtml(regla.ultimoDisparo.toISOString().slice(0, 10))} (${regla.ultimoEstado})`
      )
    }
  }

  return lineas.join("\n")
}

/**
 * Silencio global, resuelto sobre las reglas que ya existen en vez de con una
 * tabla de estado aparte: menos superficie, y /limites ya muestra cuáles están
 * calladas.
 */
async function silenciar(argumento?: string): Promise<string> {
  if (argumento === "off") {
    await db
      .update(alertRules)
      .set({ silencedUntil: null })
      .where(eq(alertRules.active, true))

    return "Alertas reactivadas."
  }

  const horas = parsearDuracion(argumento)

  if (horas === null) {
    return "Usá /silencio 24h, /silencio 7d o /silencio off."
  }

  const hasta = new Date(Date.now() + horas * 3_600_000)

  await db
    .update(alertRules)
    .set({ silencedUntil: hasta })
    .where(and(eq(alertRules.active, true), sql`true`))

  return `Alertas calladas hasta ${escaparHtml(hasta.toISOString().replace("T", " ").slice(0, 16))} UTC.`
}

function parsearDuracion(texto?: string): number | null {
  if (!texto) return 24

  const coincidencia = /^(\d+)\s*([hd])$/i.exec(texto.trim())

  if (!coincidencia) return null

  const cantidad = Number(coincidencia[1])

  if (!Number.isFinite(cantidad) || cantidad <= 0) return null

  return coincidencia[2]?.toLowerCase() === "d" ? cantidad * 24 : cantidad
}

function nombreDeFuente(fuente: "vercel" | "supabase" | "openrouter"): string {
  return { vercel: "Vercel", supabase: "Supabase", openrouter: "OpenRouter" }[
    fuente
  ]
}
