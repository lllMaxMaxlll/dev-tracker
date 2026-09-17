import "server-only"

import { env } from "@/lib/env"
import { describirError, ErrorMonitor } from "@/lib/monitor/errors"
import { diaUtc, enTandas, pedirJson, pedirTexto } from "@/lib/monitor/http"
import type {
  Colector,
  Medicion,
  MedicionesDeRecurso,
  ResultadoColector,
} from "@/lib/monitor/types"

/**
 * Colector de Supabase, por la Management API.
 *
 * Lo que se puede leer con un Personal Access Token: el inventario de
 * proyectos con su estado, la utilización del disco, y el recuento diario de
 * peticiones por servicio.
 *
 * Lo que NO se puede: egress y usuarios activos mensuales. No existe endpoint
 * público; viven sólo en la página de facturación de la organización. La UI lo
 * dice en lugar de estimarlos, porque una estimación de egress equivocada es
 * justo el número que haría tomar una decisión errada.
 */
const BASE = "https://api.supabase.com"

function credencial(): string {
  const pat = env().SUPABASE_PAT

  if (!pat) {
    throw new ErrorMonitor(
      "SIN_CREDENCIAL",
      "Falta el token de Supabase.",
      "Cargá SUPABASE_PAT (supabase.com/dashboard/account/tokens)."
    )
  }

  return pat
}

type ProyectoSupabase = {
  ref: string
  name: string
  status: string
  region?: string
  organization_slug?: string
  created_at?: string
}

export async function listarProyectos(
  señal?: AbortSignal
): Promise<ProyectoSupabase[]> {
  return await pedirJson<ProyectoSupabase[]>(`${BASE}/v1/projects`, {
    token: credencial(),
    señal,
    proveedor: "Supabase",
  })
}

type UtilizacionDisco = {
  metrics: {
    fs_size_bytes: number
    fs_used_bytes: number
    fs_avail_bytes: number
  }
}

export async function leerDisco(
  ref: string,
  señal?: AbortSignal
): Promise<UtilizacionDisco> {
  return await pedirJson<UtilizacionDisco>(
    `${BASE}/v1/projects/${ref}/config/disk/util`,
    { token: credencial(), señal, proveedor: "Supabase" }
  )
}

type ConteoPeticiones = {
  result?: {
    timestamp: string
    total_auth_requests: number
    total_realtime_requests: number
    total_rest_requests: number
    total_storage_requests: number
  }[]
}

/**
 * `interval` es la VENTANA hacia atrás, no el tamaño del bucket, y el tamaño
 * del bucket lo decide Supabase en función de ella: con `1day` devuelve buckets
 * horarios de las últimas 24 h, con `7day` devuelve buckets diarios de la
 * última semana. Usamos 7day porque la base guarda por día y porque así una
 * instalación nueva arranca con una semana de historia en vez de vacía.
 */
export async function leerPeticiones(
  ref: string,
  señal?: AbortSignal
): Promise<ConteoPeticiones> {
  return await pedirJson<ConteoPeticiones>(
    `${BASE}/v1/projects/${ref}/analytics/endpoints/usage.api-counts?interval=7day`,
    { token: credencial(), señal, proveedor: "Supabase" }
  )
}

/**
 * Scrape de Prometheus del proyecto: 781 series, de las que nos interesa una.
 *
 * `pg_database_size_bytes` es el tamaño real de la base, que es lo que Supabase
 * factura y lo que se llena en el plan Free. No es lo mismo que el disco:
 * medido en DevTracker, la base son 14 MB y el disco usado 276 MB — la
 * diferencia son WAL, índices del sistema y overhead del volumen. Alertar sobre
 * el disco y creer que se está mirando la base sería un malentendido caro.
 */
export async function leerTamañoDeBase(
  ref: string,
  señal?: AbortSignal
): Promise<number | null> {
  const texto = await pedirTexto(
    `${BASE}/v1/projects/${ref}/analytics/endpoints/metrics`,
    { token: credencial(), señal, proveedor: "Supabase" }
  )

  return extraerTamañoDeBase(texto)
}

/**
 * Parser mínimo del formato de exposición de Prometheus: alcanza con las
 * líneas `nombre{etiquetas} valor`, ignorando los comentarios. Traer una
 * librería entera para leer una serie de 781 sería desproporcionado.
 */
export function extraerTamañoDeBase(scrape: string): number | null {
  for (const linea of scrape.split("\n")) {
    if (!linea.startsWith("pg_database_size_bytes")) continue

    // Hay una serie por base: postgres, template0, template1. La que importa
    // es la de la aplicación.
    if (!linea.includes('datname="postgres"')) continue

    const valor = Number(linea.slice(linea.lastIndexOf("}") + 1).trim())

    if (Number.isFinite(valor)) return valor
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Colector
// ─────────────────────────────────────────────────────────────────────────────
/**
 * De a dos. La documentación dice 30 peticiones por minuto para analytics, pero
 * la cabecera x-ratelimit-limit que devuelven esos endpoints dice 10 — medido
 * con `bun run sondear:uso --fuente=supabase`. Con dos proyectos y dos
 * llamadas de analytics cada uno estamos justo debajo; de a cuatro, no.
 */
const CONCURRENCIA = 2

const ESTADO_SANO = "ACTIVE_HEALTHY"

export const colectorSupabase: Colector = {
  fuente: "supabase",
  nombre: "Supabase",
  // El disco es lo que puede llenarse de golpe y bloquear la base, así que
  // esta fuente sí se mira todas las horas.
  cadenciaMinutos: 60,

  apagado() {
    return !env().SUPABASE_PAT
  },

  async recolectar(señal) {
    const avisos: string[] = []
    const proyectos = await listarProyectos(señal)
    const hoy = diaUtc(new Date())

    const datos = await enTandas(proyectos, CONCURRENCIA, async (proyecto) => {
      const entrada: MedicionesDeRecurso = {
        recurso: {
          fuente: "supabase",
          idExterno: proyecto.ref,
          nombre: proyecto.name,
          organizacion: proyecto.organization_slug,
          estado: proyecto.status,
          metadata: { region: proyecto.region, creado: proyecto.created_at },
        },
        mediciones: [],
      }

      // Métrica sintética 0/1. Un proyecto pausado es una de las cosas que más
      // interesa saber y no hay ninguna métrica de consumo que lo delate:
      // justamente deja de consumir.
      entrada.mediciones.push({
        metrica: "supabase.project_paused",
        dia: hoy,
        valor: proyecto.status === ESTADO_SANO ? 0 : 1,
        unidad: "booleano",
        agregacion: "ultimo",
      })

      if (proyecto.status !== ESTADO_SANO) {
        avisos.push(
          `${proyecto.name} está en estado ${proyecto.status}: no se le piden métricas.`
        )

        return entrada
      }

      entrada.mediciones.push(
        ...(await medirDisco(proyecto, hoy, señal, avisos))
      )
      entrada.mediciones.push(
        ...(await medirTamañoDeBase(proyecto, hoy, señal, avisos))
      )
      entrada.mediciones.push(
        ...(await medirPeticiones(proyecto, señal, avisos))
      )

      return entrada
    })

    return { datos, avisos } satisfies ResultadoColector
  },
}

/**
 * Un fallo de una métrica de un proyecto no puede tumbar la corrida: con varios
 * proyectos, que uno responda 429 dejaría sin datos a todos los demás.
 */
async function medirDisco(
  proyecto: ProyectoSupabase,
  dia: string,
  señal: AbortSignal,
  avisos: string[]
): Promise<Medicion[]> {
  try {
    const { metrics } = await leerDisco(proyecto.ref, señal)

    return [
      {
        metrica: "supabase.disk_used_bytes",
        dia,
        valor: metrics.fs_used_bytes,
        unidad: "bytes",
        agregacion: "maximo",
      },
      {
        // El tope del plan no se codifica en ningún lado: se lee de acá. Es lo
        // que hace que la barra de porcentaje de la UI sea un dato y no una
        // suposición.
        metrica: "supabase.disk_size_bytes",
        dia,
        valor: metrics.fs_size_bytes,
        unidad: "bytes",
        agregacion: "ultimo",
      },
    ]
  } catch (error) {
    avisos.push(`Disco de ${proyecto.name}: ${describirError(error)}`)

    return []
  }
}

/**
 * Supabase devuelve "2026-09-16T13:00:00", sin sufijo de zona. `new Date()` lo
 * interpreta como hora LOCAL, así que desde una máquina en UTC-3 el bucket se
 * correría tres horas y algunos caerían en el día equivocado.
 */
function comoUtc(timestamp: string): string {
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp) ? timestamp : `${timestamp}Z`
}

async function medirTamañoDeBase(
  proyecto: ProyectoSupabase,
  dia: string,
  señal: AbortSignal,
  avisos: string[]
): Promise<Medicion[]> {
  try {
    const bytes = await leerTamañoDeBase(proyecto.ref, señal)

    if (bytes === null) {
      avisos.push(
        `${proyecto.name}: el scrape no traía pg_database_size_bytes de la base postgres.`
      )

      return []
    }

    return [
      {
        metrica: "supabase.db_size_bytes",
        dia,
        valor: bytes,
        unidad: "bytes",
        agregacion: "maximo",
      },
    ]
  } catch (error) {
    avisos.push(`Tamaño de base de ${proyecto.name}: ${describirError(error)}`)

    return []
  }
}

const SERVICIOS = [
  ["total_rest_requests", "supabase.rest_requests"],
  ["total_auth_requests", "supabase.auth_requests"],
  ["total_storage_requests", "supabase.storage_requests"],
  ["total_realtime_requests", "supabase.realtime_requests"],
] as const

async function medirPeticiones(
  proyecto: ProyectoSupabase,
  señal: AbortSignal,
  avisos: string[]
): Promise<Medicion[]> {
  try {
    const { result } = await leerPeticiones(proyecto.ref, señal)

    const mediciones: Medicion[] = []

    for (const bucket of result ?? []) {
      const dia = diaUtc(new Date(comoUtc(bucket.timestamp)))

      for (const [campo, metrica] of SERVICIOS) {
        const valor = bucket[campo]

        if (typeof valor !== "number") continue

        mediciones.push({
          metrica,
          dia,
          valor,
          unidad: "peticiones",
          agregacion: "suma",
        })
      }
    }

    return mediciones
  } catch (error) {
    avisos.push(`Peticiones de ${proyecto.name}: ${describirError(error)}`)

    return []
  }
}
