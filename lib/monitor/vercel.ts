import "server-only"

import { env } from "@/lib/env"
import { ErrorMonitor, esErrorMonitor } from "@/lib/monitor/errors"
import { diaUtc, pedirJson, pedirTexto } from "@/lib/monitor/http"
import type {
  Colector,
  Medicion,
  MedicionesDeRecurso,
  ResultadoColector,
} from "@/lib/monitor/types"

/**
 * Colector de Vercel.
 *
 * El plan Hobby no expone uso en tiempo real: /v2/observability/query, que es
 * lo que alimenta los gráficos del panel web, requiere Observability Plus. Lo
 * único documentado que da desglose por proyecto es /v1/billing/charges, en
 * formato FOCUS y granularidad diaria.
 *
 * Como no está confirmado que ese endpoint responda en una cuenta personal
 * Hobby, el colector tiene dos patas: si los cargos contestan, se usan; si
 * contestan 403 o 404, se cae al recuento de despliegues, que mide actividad y
 * no costo pero al menos es cierto. Lo que nunca hace es devolver ceros.
 */
const BASE = "https://api.vercel.com"

function credencial(): string {
  const token = env().VERCEL_TOKEN

  if (!token) {
    throw new ErrorMonitor(
      "SIN_CREDENCIAL",
      "Falta el token de Vercel.",
      "Cargá VERCEL_TOKEN (vercel.com/account/settings/tokens)."
    )
  }

  return token
}

function ambito(): string {
  const equipo = env().VERCEL_TEAM_ID

  return equipo ? `teamId=${encodeURIComponent(equipo)}` : ""
}

function url(ruta: string, consulta: string[] = []): string {
  const partes = [...consulta, ambito()].filter(Boolean)

  return `${BASE}${ruta}${partes.length ? `?${partes.join("&")}` : ""}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventario
// ─────────────────────────────────────────────────────────────────────────────
type ProyectoVercel = {
  id: string
  name: string
  accountId?: string
}

export async function listarProyectos(
  señal?: AbortSignal
): Promise<ProyectoVercel[]> {
  const respuesta = await pedirJson<{ projects?: ProyectoVercel[] }>(
    url("/v9/projects", ["limit=100"]),
    { token: credencial(), señal, proveedor: "Vercel" }
  )

  return respuesta.projects ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// Cargos FOCUS
// ─────────────────────────────────────────────────────────────────────────────
export type CargoFocus = {
  ServiceName?: string
  ServiceCategory?: string
  ConsumedQuantity?: number | null
  ConsumedUnit?: string | null
  BilledCost?: number
  EffectiveCost?: number
  ChargePeriodStart?: string
  ChargeCategory?: string
  Tags?: Record<string, string>
}

/**
 * La respuesta es JSONL: una línea de JSON por cargo, no un array. Parsear
 * línea a línea en vez de bufferear y hacer JSON.parse del todo evita que una
 * sola línea corrupta tire la corrida entera.
 */
export function parsearJsonl(texto: string): {
  cargos: CargoFocus[]
  rotas: number
} {
  const cargos: CargoFocus[] = []

  let rotas = 0

  for (const linea of texto.split("\n")) {
    const limpia = linea.trim()

    if (!limpia) continue

    try {
      cargos.push(JSON.parse(limpia) as CargoFocus)
    } catch {
      rotas += 1
    }
  }

  return { cargos, rotas }
}

/**
 * Traduce un cargo a una métrica del catálogo.
 *
 * Es la pieza delicada del colector. FOCUS devuelve una fila por día, servicio
 * y región, con una `ConsumedQuantity` cuya unidad cambia según el servicio:
 * sumar "GB", "invocations" y "GB-hours" en un mismo número da un número sin
 * significado que igual se ve razonable en un gráfico.
 *
 * Por eso el mapeo es explícito y lo que no está en la tabla devuelve null: ese
 * cargo se descarta y se reporta en `avisos`, con el par servicio × unidad
 * exacto, para poder agregarlo acá. Meterlo en un cajón "otros" sería peor que
 * perderlo, porque quedaría mezclado y nadie lo notaría.
 *
 * ⚠️ Los nombres de servicio son provisionales hasta que
 * `bun run sondear:uso --fuente=vercel` diga cuáles aparecen de verdad. Que no
 * acierten no corrompe nada: sólo hace que todo caiga en `avisos`.
 */
type Normalizacion = { metrica: string; unidad: string; factor?: number }

const GIGABYTE = 1024 ** 3

const MAPEO_SERVICIOS: Record<string, Normalizacion> = {
  fastdatatransfer: {
    metrica: "vercel.data_transfer_bytes",
    unidad: "bytes",
    factor: GIGABYTE,
  },
  datatransfer: {
    metrica: "vercel.data_transfer_bytes",
    unidad: "bytes",
    factor: GIGABYTE,
  },
  bandwidth: {
    metrica: "vercel.data_transfer_bytes",
    unidad: "bytes",
    factor: GIGABYTE,
  },
  edgerequests: { metrica: "vercel.edge_requests", unidad: "peticiones" },
  functioninvocations: {
    metrica: "vercel.function_invocations",
    unidad: "cantidad",
  },
  functionduration: {
    metrica: "vercel.function_duration_hours",
    unidad: "horas",
  },
  fluidactivecpu: {
    metrica: "vercel.function_duration_hours",
    unidad: "horas",
  },
  imageoptimizationtransformations: {
    metrica: "vercel.image_transformations",
    unidad: "cantidad",
  },
  isrreads: { metrica: "vercel.isr_reads", unidad: "cantidad" },
  isrwrites: { metrica: "vercel.isr_writes", unidad: "cantidad" },
}

function clave(texto: string): string {
  return texto.toLowerCase().replace(/[^a-z0-9]/g, "")
}

export function normalizarCargo(cargo: CargoFocus): Normalizacion | null {
  if (!cargo.ServiceName) return null

  const encontrada = MAPEO_SERVICIOS[clave(cargo.ServiceName)]

  if (!encontrada) return null

  // La unidad es parte del contrato: si Vercel cambia de GB a TB, el factor de
  // conversión deja de valer y es mejor descartarlo que multiplicar mal.
  if (encontrada.factor) {
    const unidadCruda = clave(cargo.ConsumedUnit ?? "")

    if (unidadCruda && !unidadCruda.startsWith("gb")) return null
  }

  return encontrada
}

export async function leerCargos(
  desde: Date,
  hasta: Date,
  señal?: AbortSignal
): Promise<CargoFocus[]> {
  const texto = await pedirTexto(
    url("/v1/billing/charges", [
      `from=${desde.toISOString()}`,
      `to=${hasta.toISOString()}`,
    ]),
    { token: credencial(), señal, proveedor: "Vercel" }
  )

  return parsearJsonl(texto).cargos
}

// ─────────────────────────────────────────────────────────────────────────────
// Plan B: despliegues
// ─────────────────────────────────────────────────────────────────────────────
type DespliegueVercel = {
  uid: string
  projectId?: string
  name?: string
  created: number
}

async function leerDespliegues(
  desde: Date,
  señal?: AbortSignal
): Promise<DespliegueVercel[]> {
  const respuesta = await pedirJson<{ deployments?: DespliegueVercel[] }>(
    url("/v6/deployments", [`since=${desde.getTime()}`, "limit=100"]),
    { token: credencial(), señal, proveedor: "Vercel" }
  )

  return respuesta.deployments ?? []
}

// ─────────────────────────────────────────────────────────────────────────────
// Colector
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Ventana de recolección.
 *
 * Treinta días y no siete porque la regla de Vercel es mensual y porque el plan
 * B —contar despliegues— es de baja frecuencia: en esta cuenta hubo 33
 * despliegues en un mes y ninguno en la última semana, así que con ventana
 * corta el panel se vería vacío casi siempre. Cabe holgado en la página de 100
 * que devuelve /v6/deployments.
 */
const DIAS = 30

export const colectorVercel: Colector = {
  fuente: "vercel",
  nombre: "Vercel",
  // Los cargos tienen granularidad de un día: pedirlos cada hora devolvería lo
  // mismo veinticuatro veces.
  cadenciaMinutos: 360,

  apagado() {
    return !env().VERCEL_TOKEN
  },

  async recolectar(señal) {
    const avisos: string[] = []

    const proyectos = await listarProyectos(señal)
    const nombrePorId = new Map(proyectos.map((p) => [p.id, p.name]))

    const hasta = new Date()
    const desde = new Date(hasta.getTime() - DIAS * 24 * 60 * 60 * 1000)

    const porRecurso = new Map<string, MedicionesDeRecurso>()

    function recurso(idExterno: string, nombre: string): MedicionesDeRecurso {
      const existente = porRecurso.get(idExterno)

      if (existente) return existente

      const nuevo: MedicionesDeRecurso = {
        recurso: { fuente: "vercel", idExterno, nombre },
        mediciones: [],
      }

      porRecurso.set(idExterno, nuevo)

      return nuevo
    }

    // El inventario se registra siempre, aunque después no haya consumo: un
    // proyecto sin cargos tiene que aparecer en la página igual.
    for (const proyecto of proyectos) recurso(proyecto.id, proyecto.name)

    try {
      const cargos = await leerCargos(desde, hasta, señal)

      acumularCargos(cargos, recurso, nombrePorId, avisos)
    } catch (error) {
      if (!esErrorMonitor(error) || error.codigo !== "NO_DISPONIBLE")
        throw error

      // Acá estamos en el escenario que el sondeo tenía que descartar: el plan
      // no da facturación. En vez de dejar la página vacía, medimos actividad.
      avisos.push(
        "La facturación no está disponible en este plan; se miden despliegues en su lugar."
      )

      const despliegues = await leerDespliegues(desde, señal)

      acumularDespliegues(despliegues, recurso, nombrePorId)
    }

    return {
      datos: [...porRecurso.values()],
      avisos,
    } satisfies ResultadoColector
  },
}

type Buscador = (idExterno: string, nombre: string) => MedicionesDeRecurso

/** Suma por (recurso, métrica, día) antes de escribir, no después. */
function sumar(destino: Medicion[], nueva: Medicion) {
  const existente = destino.find(
    (m) => m.metrica === nueva.metrica && m.dia === nueva.dia
  )

  if (existente) existente.valor += nueva.valor
  else destino.push(nueva)
}

function acumularCargos(
  cargos: CargoFocus[],
  recurso: Buscador,
  nombrePorId: Map<string, string>,
  avisos: string[]
) {
  const noReconocidos = new Set<string>()

  for (const cargo of cargos) {
    // Los créditos y ajustes no son consumo; mezclarlos con el uso del período
    // haría que un reembolso pareciera un mes tranquilo.
    if (cargo.ChargeCategory && cargo.ChargeCategory !== "Usage") continue

    const idProyecto = cargo.Tags?.ProjectId ?? cargo.Tags?.ProjectName

    if (!idProyecto) continue

    const nombre =
      nombrePorId.get(idProyecto) ?? cargo.Tags?.ProjectName ?? idProyecto

    const dia = diaUtc(
      cargo.ChargePeriodStart ? new Date(cargo.ChargePeriodStart) : new Date()
    )

    const destino = recurso(idProyecto, nombre).mediciones

    if (typeof cargo.BilledCost === "number" && cargo.BilledCost !== 0) {
      sumar(destino, {
        metrica: "vercel.cost_usd",
        dia,
        valor: cargo.BilledCost,
        unidad: "usd",
        agregacion: "suma",
      })
    }

    if (typeof cargo.ConsumedQuantity !== "number") continue

    const normalizada = normalizarCargo(cargo)

    if (!normalizada) {
      noReconocidos.add(
        `${cargo.ServiceName ?? "?"} × ${cargo.ConsumedUnit ?? "sin unidad"}`
      )

      continue
    }

    sumar(destino, {
      metrica: normalizada.metrica,
      dia,
      valor: cargo.ConsumedQuantity * (normalizada.factor ?? 1),
      unidad: normalizada.unidad,
      agregacion: "suma",
    })
  }

  for (const sinMapeo of noReconocidos) {
    avisos.push(`Cargo sin mapeo, descartado: ${sinMapeo}`)
  }
}

function acumularDespliegues(
  despliegues: DespliegueVercel[],
  recurso: Buscador,
  nombrePorId: Map<string, string>
) {
  for (const despliegue of despliegues) {
    if (!despliegue.projectId) continue

    const nombre =
      nombrePorId.get(despliegue.projectId) ??
      despliegue.name ??
      despliegue.projectId

    sumar(recurso(despliegue.projectId, nombre).mediciones, {
      metrica: "vercel.deployments",
      dia: diaUtc(new Date(despliegue.created)),
      valor: 1,
      unidad: "despliegues",
      agregacion: "suma",
    })
  }
}
