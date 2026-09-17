import "server-only"

import { eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  monitorSettings,
  planQuotas,
  usageSourceEnum,
  type UsageSource,
} from "@/lib/db/schema"

/**
 * Cuotas de los planes y costo de los excedentes.
 *
 * Ninguna de las APIs devuelve el tope del plan: sólo el consumo. Los valores
 * viven en `plan_quotas` y se editan desde /consumo, no en el código, porque
 * los proveedores cambian precios y un número codificado envejece en silencio
 * mientras la barra se sigue mostrando igual de convincente.
 *
 * Hay un segundo origen, mejor cuando existe: algunas métricas traen su propio
 * tope en la misma respuesta de la API —Supabase devuelve `fs_size_bytes` junto
 * con `fs_used_bytes`—. Esos topes son un dato y no una declaración, así que
 * ganan: no se desactualizan nunca.
 */

/** Topes que informa el propio proveedor, como otra métrica del mismo recurso. */
const DERIVADAS: Record<string, string> = {
  "supabase.disk_used_bytes": "supabase.disk_size_bytes",
  "openrouter.free_requests_used": "openrouter.free_requests_limit",
}

export function metricaDelTope(metrica: string): string | undefined {
  return DERIVADAS[metrica]
}

/** Métricas que sólo existen para ser el tope de otra. */
export function esMetricaDeTope(metrica: string): boolean {
  return Object.values(DERIVADAS).includes(metrica)
}

export type CuotaDePlan = {
  fuente: UsageSource
  plan: string
  metrica: string
  incluido: number
  /** USD por cada `bloque` unidades. Nulo si el plan corta en vez de facturar. */
  precioExcedenteUsd: number | null
  bloque: number
}

export async function getCuotasDePlan(): Promise<CuotaDePlan[]> {
  const filas = await db
    .select({
      fuente: planQuotas.source,
      plan: planQuotas.plan,
      metrica: planQuotas.metric,
      incluido: planQuotas.included,
      precio: planQuotas.overagePriceUsd,
      bloque: planQuotas.overageBlock,
    })
    .from(planQuotas)

  return filas.map((fila) => ({
    fuente: fila.fuente,
    plan: fila.plan,
    metrica: fila.metrica,
    // numeric vuelve como string del driver, para no perder precisión.
    incluido: Number(fila.incluido),
    precioExcedenteUsd: fila.precio === null ? null : Number(fila.precio),
    bloque: Number(fila.bloque) || 1,
  }))
}

export type Excedente = {
  cantidad: number
  costoUsd: number
}

/**
 * Buscador de cuotas ya cargadas.
 *
 * Se arma una vez por consulta y se usa muchas: hacer un SELECT por métrica y
 * por recurso sería una tormenta de queries para leer una tabla de diez filas.
 */
export class Cuotas {
  private porClave: Map<string, CuotaDePlan>

  constructor(cuotas: CuotaDePlan[]) {
    this.porClave = new Map(
      cuotas.map((cuota) => [
        `${cuota.fuente}:${cuota.plan}:${cuota.metrica}`,
        cuota,
      ])
    )
  }

  static async cargar(): Promise<Cuotas> {
    return new Cuotas(await getCuotasDePlan())
  }

  /** Planes que tienen cuotas cargadas para una fuente, para armar el toggle. */
  planesDisponibles(fuente: UsageSource): string[] {
    const planes = new Set<string>()

    for (const cuota of this.porClave.values()) {
      if (cuota.fuente === fuente) planes.add(cuota.plan)
    }

    return [...planes].sort()
  }

  buscar(
    fuente: UsageSource,
    plan: string | null,
    metrica: string
  ): CuotaDePlan | undefined {
    if (!plan) return undefined

    return this.porClave.get(`${fuente}:${plan}:${metrica}`)
  }

  /**
   * Tope efectivo de una métrica para un recurso.
   *
   * `valorDeMetrica` la provee quien llama porque los topes derivados dependen
   * del recurso concreto: el disco de un proyecto no es el de otro.
   */
  tope(
    fuente: UsageSource,
    plan: string | null,
    metrica: string,
    valorDeMetrica: (clave: string) => number | undefined
  ): number | undefined {
    const derivada = DERIVADAS[metrica]

    if (derivada) {
      const valor = valorDeMetrica(derivada)

      // Un tope de cero no es un tope: sería una división por cero disfrazada
      // de "estás al infinito por ciento".
      if (valor && valor > 0) return valor
    }

    const cuota = this.buscar(fuente, plan, metrica)

    return cuota && cuota.incluido > 0 ? cuota.incluido : undefined
  }

  /**
   * Cuánto te pasaste y cuánto cuesta.
   *
   * Devuelve null cuando no hay excedente que cobrar, que NO es lo mismo que un
   * excedente de cero: en el plan Free de Supabase pasarse del tamaño de base
   * bloquea la escritura en vez de facturar, y mostrar "USD 0,00 de excedente"
   * ahí haría parecer que pasarse sale gratis.
   */
  excedente(
    fuente: UsageSource,
    plan: string | null,
    metrica: string,
    valor: number
  ): Excedente | null {
    const cuota = this.buscar(fuente, plan, metrica)

    if (!cuota || cuota.precioExcedenteUsd === null) return null

    const cantidad = valor - cuota.incluido

    if (cantidad <= 0) return null

    return {
      cantidad,
      costoUsd: (cantidad / cuota.bloque) * cuota.precioExcedenteUsd,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan con el que se mira cada fuente
// ─────────────────────────────────────────────────────────────────────────────
/**
 * El panel puede mostrarse con las cuotas de un plan distinto del real, para
 * responder "¿cómo se vería mi consumo si estuviera en Pro?" sin cambiar de
 * plan. Lo elige un toggle en /consumo y por defecto vale el plan detectado.
 *
 * Es una preferencia de VISTA, no una declaración: el plan real sigue siendo el
 * que detectó el colector, y la UI lo dice cuando no coinciden. Si no, sería
 * facilísimo quedarse mirando las barras de un plan que no se tiene.
 */
const PREFIJO = "plan_vista:"

export async function getPlanesDeVista(): Promise<
  Partial<Record<UsageSource, string>>
> {
  const claves = usageSourceEnum.enumValues.map(
    (fuente) => `${PREFIJO}${fuente}`
  )

  const filas = await db
    .select({ key: monitorSettings.key, value: monitorSettings.value })
    .from(monitorSettings)
    .where(inArray(monitorSettings.key, claves))

  const vistas: Partial<Record<UsageSource, string>> = {}

  for (const fila of filas) {
    vistas[fila.key.slice(PREFIJO.length) as UsageSource] = fila.value
  }

  return vistas
}

export async function setPlanDeVista(
  fuente: UsageSource,
  plan: string | null
): Promise<void> {
  const key = `${PREFIJO}${fuente}`

  // Borrar y no guardar "auto": así el default vuelve a ser el plan detectado y
  // sigue al día solo si alguna vez cambiás de plan de verdad.
  if (plan === null) {
    await db.delete(monitorSettings).where(eq(monitorSettings.key, key))

    return
  }

  await db
    .insert(monitorSettings)
    .values({ key, value: plan })
    .onConflictDoUpdate({
      target: monitorSettings.key,
      set: { value: plan, updatedAt: new Date() },
    })
}
