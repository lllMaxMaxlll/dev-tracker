/**
 * Sondeo de las APIs de consumo (Fase 0 del monitor).
 *
 * Los planes Hobby de Vercel y Free de Supabase no documentan del todo qué
 * endpoints responden y con qué forma. Antes de escribir un colector contra
 * ellos conviene medir, no suponer: este script pega a cada candidato con las
 * credenciales reales e imprime status, cabeceras de rate limit y una muestra
 * del cuerpo.
 *
 * Se queda en el repo a propósito: vuelve a servir cada vez que un proveedor
 * cambie su API.
 *
 *   bun run sondear:uso
 *   bun run sondear:uso --fuente=vercel --crudo
 *   bun run sondear:uso --registrar-webhook
 *
 * ⚠️ No importa nada de `lib/`: `lib/env.ts` y `lib/db/index.ts` empiezan con
 * `import "server-only"`, que tira fuera del runtime de React. Acá se lee
 * `process.env` directo, igual que en drizzle.config.ts.
 */
import { existsSync } from "node:fs"

import { Client } from "pg"

// Bun ya carga .env.local solo; Node no, y `process.loadEnvFile` tampoco
// existe en todas las versiones de Bun. Así el script corre con cualquiera de
// los dos runtimes.
if (typeof process.loadEnvFile === "function") {
  for (const archivo of [".env.local", ".env"]) {
    if (existsSync(archivo)) {
      process.loadEnvFile(archivo)
      break
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Argumentos
// ─────────────────────────────────────────────────────────────────────────────
const argumentos = process.argv.slice(2)

const FUENTES = ["vercel", "supabase", "openrouter", "telegram", "db"] as const
type Fuente = (typeof FUENTES)[number]

const fuentePedida = argumentos
  .find((arg) => arg.startsWith("--fuente="))
  ?.split("=")[1]

const volcarCrudo = argumentos.includes("--crudo")
const registrarWebhook = argumentos.includes("--registrar-webhook")

if (fuentePedida && !FUENTES.includes(fuentePedida as Fuente)) {
  console.error(`--fuente tiene que ser una de: ${FUENTES.join(", ")}`)
  process.exit(1)
}

function toca(fuente: Fuente) {
  return !fuentePedida || fuentePedida === fuente
}

// ─────────────────────────────────────────────────────────────────────────────
// Salida
// ─────────────────────────────────────────────────────────────────────────────
const MUESTRA_MAX = 1200

function titulo(texto: string) {
  console.log(`\n${"═".repeat(78)}\n${texto}\n${"═".repeat(78)}`)
}

function aviso(texto: string) {
  console.log(`   ⚠️  ${texto}`)
}

function recortar(texto: string) {
  if (volcarCrudo || texto.length <= MUESTRA_MAX) return texto

  return `${texto.slice(0, MUESTRA_MAX)}\n   […] (${texto.length} caracteres en total; --crudo para verlo entero)`
}

function sangrar(texto: string) {
  return texto
    .split("\n")
    .map((linea) => `   │ ${linea}`)
    .join("\n")
}

/** Cabeceras que dicen cuánto queda de cuota. Las de cada proveedor difieren. */
const CABECERAS_INTERESANTES = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-remaining",
  "retry-after",
  "content-type",
]

type Respuesta = {
  ok: boolean
  status: number
  texto: string
  json: unknown
}

async function sondear(
  nombre: string,
  url: string,
  init: RequestInit = {}
): Promise<Respuesta | null> {
  const metodo = init.method ?? "GET"

  console.log(`\n── ${nombre}`)
  console.log(`   ${metodo} ${url}`)

  const comienzo = Date.now()

  let respuesta: Response

  try {
    respuesta = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (error) {
    aviso(`la llamada falló: ${error instanceof Error ? error.message : error}`)

    return null
  }

  const ms = Date.now() - comienzo
  const texto = await respuesta.text()

  const cabeceras = CABECERAS_INTERESANTES.map((clave) => {
    const valor = respuesta.headers.get(clave)

    return valor ? `${clave}: ${valor}` : null
  })
    .filter(Boolean)
    .join("  ·  ")

  console.log(`   → ${respuesta.status} ${respuesta.statusText} (${ms} ms)`)

  if (cabeceras) console.log(`   ${cabeceras}`)

  let json: unknown = undefined

  try {
    json = JSON.parse(texto)
  } catch {
    // No es JSON: JSONL, texto de Prometheus, o un error en HTML.
  }

  const muestra = json === undefined ? texto : JSON.stringify(json, null, 2)

  if (muestra.trim()) console.log(sangrar(recortar(muestra.trim())))
  else console.log("   │ (cuerpo vacío)")

  return { ok: respuesta.ok, status: respuesta.status, texto, json }
}

function faltaCredencial(nombre: string, variable: string) {
  console.log(`\n── ${nombre}`)
  aviso(`no hay ${variable} en el entorno; se saltea`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Vercel
// ─────────────────────────────────────────────────────────────────────────────
async function sondearVercel() {
  titulo("VERCEL")

  const token = process.env.VERCEL_TOKEN

  if (!token) {
    faltaCredencial("Vercel", "VERCEL_TOKEN")
    aviso("se saca en vercel.com/account/settings/tokens")

    return
  }

  const auth = { Authorization: `Bearer ${token}` }
  const equipo = process.env.VERCEL_TEAM_ID
  const sufijoEquipo = equipo ? `&teamId=${equipo}` : ""

  await sondear(
    "Inventario de proyectos",
    `https://api.vercel.com/v9/projects?limit=100${sufijoEquipo}`,
    { headers: auth }
  )

  // FOCUS tiene granularidad de 1 día; siete días alcanzan para ver la forma
  // de los cargos sin traer un año entero.
  const hasta = new Date()
  const desde = new Date(hasta.getTime() - 7 * 24 * 60 * 60 * 1000)

  const rango = `from=${desde.toISOString()}&to=${hasta.toISOString()}`

  const cargos = await sondear(
    "Cargos FOCUS (la pregunta del millón: ¿responde en Hobby?)",
    `https://api.vercel.com/v1/billing/charges?${rango}${sufijoEquipo}`,
    { headers: auth }
  )

  if (cargos?.ok) {
    resumirCargosFocus(cargos.texto)
  } else if (cargos && !equipo) {
    aviso(
      "falló sin teamId. Si tenés un equipo, reintentá con VERCEL_TEAM_ID puesto."
    )
  }

  // Plan B si los cargos no están disponibles: los despliegues siempre lo están
  // y sirven como proxy de actividad por proyecto.
  await sondear(
    "Plan B — despliegues recientes",
    `https://api.vercel.com/v6/deployments?limit=20${sufijoEquipo}`,
    { headers: auth }
  )
}

type CargoFocus = {
  ServiceName?: string
  ServiceCategory?: string
  ConsumedQuantity?: number | null
  ConsumedUnit?: string | null
  BilledCost?: number
  EffectiveCost?: number
  ChargePeriodStart?: string
  Tags?: Record<string, string>
}

/**
 * La respuesta es JSONL: una línea de JSON por cargo. Este resumen es el
 * insumo directo de la tabla de mapeo del colector — sumar "GB-hours" con
 * "invocations" en un mismo número produce basura, así que primero hay que
 * saber qué combinaciones de servicio y unidad existen de verdad.
 */
function resumirCargosFocus(jsonl: string) {
  const lineas = jsonl.split("\n").filter((linea) => linea.trim())

  if (lineas.length === 0) {
    aviso("respondió 200 pero sin cargos en el rango (¿cuenta sin consumo?)")

    return
  }

  const combinaciones = new Map<string, number>()
  const proyectos = new Set<string>()

  let conProjectId = 0
  let costoTotal = 0
  let rotas = 0

  for (const linea of lineas) {
    let cargo: CargoFocus

    try {
      cargo = JSON.parse(linea) as CargoFocus
    } catch {
      rotas += 1

      continue
    }

    const clave = `${cargo.ServiceCategory ?? "?"} / ${cargo.ServiceName ?? "?"} → ${cargo.ConsumedUnit ?? "(sin unidad)"}`

    combinaciones.set(clave, (combinaciones.get(clave) ?? 0) + 1)

    const idProyecto = cargo.Tags?.ProjectId ?? cargo.Tags?.ProjectName

    if (idProyecto) {
      conProjectId += 1
      proyectos.add(idProyecto)
    }

    costoTotal += cargo.BilledCost ?? 0
  }

  console.log(`\n   ┌─ Resumen del JSONL (${lineas.length} cargos)`)

  if (rotas) console.log(`   │  ${rotas} líneas no parsearon`)

  console.log(
    `   │  Tags.ProjectId presente en ${conProjectId}/${lineas.length} cargos, ${proyectos.size} proyectos distintos`
  )
  console.log(`   │  BilledCost acumulado: ${costoTotal}`)
  console.log("   │  Combinaciones servicio × unidad:")

  for (const [clave, veces] of [...combinaciones].sort()) {
    console.log(`   │    · ${clave}  (${veces})`)
  }

  console.log("   └─")
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────────────────────────────────────
type ProyectoSupabase = {
  ref: string
  name: string
  status: string
  region?: string
  organization_slug?: string
}

async function sondearSupabase() {
  titulo("SUPABASE (Management API)")

  const pat = process.env.SUPABASE_PAT

  if (!pat) {
    faltaCredencial("Supabase", "SUPABASE_PAT")
    aviso("se saca en supabase.com/dashboard/account/tokens")

    return
  }

  const auth = { Authorization: `Bearer ${pat}` }

  const listado = await sondear(
    "Inventario de proyectos",
    "https://api.supabase.com/v1/projects",
    { headers: auth }
  )

  const proyectos = Array.isArray(listado?.json)
    ? (listado.json as ProyectoSupabase[])
    : []

  if (proyectos.length === 0) {
    aviso("sin proyectos que sondear")

    return
  }

  console.log(`\n   ${proyectos.length} proyectos:`)

  for (const proyecto of proyectos) {
    console.log(
      `   · ${proyecto.name} (${proyecto.ref}) — ${proyecto.status} — org ${proyecto.organization_slug ?? "?"}`
    )
  }

  // Sondeamos uno sano y, si lo hay, uno pausado: la pregunta abierta es qué
  // devuelven los endpoints de analytics cuando el proyecto no está corriendo.
  const sano = proyectos.find((p) => p.status === "ACTIVE_HEALTHY")
  const pausado = proyectos.find((p) => p.status !== "ACTIVE_HEALTHY")

  for (const proyecto of [sano, pausado].filter(
    Boolean
  ) as ProyectoSupabase[]) {
    const etiqueta = `${proyecto.name} [${proyecto.status}]`

    await sondear(
      `Disco — ${etiqueta}`,
      `https://api.supabase.com/v1/projects/${proyecto.ref}/config/disk/util`,
      { headers: auth }
    )

    await sondear(
      `Peticiones por día — ${etiqueta}`,
      `https://api.supabase.com/v1/projects/${proyecto.ref}/analytics/endpoints/usage.api-counts?interval=1day`,
      { headers: auth }
    )

    const metricas = await sondear(
      `Métricas Prometheus — ${etiqueta}`,
      `https://api.supabase.com/v1/projects/${proyecto.ref}/analytics/endpoints/metrics`,
      { headers: auth }
    )

    if (metricas?.ok) resumirPrometheus(metricas.texto)
  }
}

/** ~200 series por scrape: sin filtrar, el volcado es ilegible. */
function resumirPrometheus(texto: string) {
  const lineas = texto.split("\n").filter((l) => l && !l.startsWith("#"))

  const buscadas = [
    "pg_database_size_bytes",
    "pg_stat_database_blks",
    "pg_stat_database_numbackends",
    "node_filesystem_avail_bytes",
    "node_filesystem_size_bytes",
    "node_network_transmit_bytes_total",
  ]

  console.log(
    `\n   ┌─ ${lineas.length} series en el scrape. Las que interesan:`
  )

  for (const buscada of buscadas) {
    const encontradas = lineas.filter((l) => l.startsWith(buscada))

    if (encontradas.length === 0) {
      console.log(`   │  ✗ ${buscada} — no está`)

      continue
    }

    console.log(`   │  ✓ ${encontradas[0]}`)

    if (encontradas.length > 1) {
      console.log(`   │      (+${encontradas.length - 1} series más)`)
    }
  }

  console.log("   └─")
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter
// ─────────────────────────────────────────────────────────────────────────────
async function sondearOpenRouter() {
  titulo("OPENROUTER")

  const key = process.env.OPENROUTER_API_KEY

  if (!key) {
    faltaCredencial("OpenRouter", "OPENROUTER_API_KEY")

    return
  }

  const auth = { Authorization: `Bearer ${key}` }

  await sondear("Saldo de la cuenta", "https://openrouter.ai/api/v1/credits", {
    headers: auth,
  })

  await sondear("Límites de la key", "https://openrouter.ai/api/v1/key", {
    headers: auth,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Telegram
// ─────────────────────────────────────────────────────────────────────────────
async function sondearTelegram() {
  titulo("TELEGRAM")

  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    faltaCredencial("Telegram", "TELEGRAM_BOT_TOKEN")
    aviso("se saca hablándole a @BotFather con /newbot")

    return
  }

  const base = `https://api.telegram.org/bot${token}`

  await sondear("Identidad del bot", `${base}/getMe`)
  await sondear("Estado del webhook", `${base}/getWebhookInfo`)

  const chat = process.env.TELEGRAM_CHAT_ID

  if (chat) {
    await sondear("Mensaje de prueba", `${base}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chat,
        parse_mode: "HTML",
        text: "<b>DevTracker</b> · sondeo del monitor de consumo. Si ves esto, el canal funciona.",
      }),
    })
  } else {
    aviso(
      "sin TELEGRAM_CHAT_ID no se puede probar el envío. Mandale un mensaje al bot y mirá getUpdates para averiguarlo."
    )

    await sondear(
      "Updates pendientes (para sacar el chat_id)",
      `${base}/getUpdates`
    )
  }

  if (!registrarWebhook) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secreto = process.env.TELEGRAM_WEBHOOK_SECRET

  if (!appUrl || !secreto) {
    aviso(
      "para --registrar-webhook hacen falta NEXT_PUBLIC_APP_URL y TELEGRAM_WEBHOOK_SECRET"
    )

    return
  }

  // Alta de una sola vez. Vive acá y no en el README porque un curl
  // documentado que nadie ejecuta no sirve de nada.
  await sondear("Alta del webhook", `${base}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${appUrl}/api/telegram/webhook`,
      secret_token: secreto,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Base de datos
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Las tablas del monitor van con RLS habilitado pero sin policies. Que la app
 * las pueda leer depende de si el rol de la conexión tiene BYPASSRLS — y el
 * modo de falla, si no lo tuviera, sería devolver cero filas en silencio. Vale
 * la pena dejarlo verificado por escrito.
 */
async function sondearBaseDeDatos() {
  titulo("BASE DE DATOS (supuesto de RLS)")

  const url = process.env.DATABASE_URL

  if (!url) {
    faltaCredencial("Postgres", "DATABASE_URL")

    return
  }

  const cliente = new Client({ connectionString: url })

  try {
    await cliente.connect()

    const { rows } = await cliente.query<{
      current_user: string
      rolbypassrls: boolean
      rolsuper: boolean
    }>(
      "select current_user, rolbypassrls, rolsuper from pg_roles where rolname = current_user"
    )

    console.log(`\n── Rol de la conexión`)
    console.log(sangrar(JSON.stringify(rows, null, 2)))

    const fila = rows[0]

    if (fila?.rolbypassrls || fila?.rolsuper) {
      console.log(
        "   ✓ el rol bypasea RLS: las tablas sin policies se leen igual desde la app"
      )
    } else {
      aviso(
        "el rol NO bypasea RLS. La migración tiene que habilitar RLS sin FORCE, si no la app leería cero filas."
      )
    }
  } catch (error) {
    aviso(
      `no se pudo consultar: ${error instanceof Error ? error.message : error}`
    )
  } finally {
    await cliente.end().catch(() => {})
  }
}

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log("Sondeo de las APIs de consumo — DevTracker")
  console.log(new Date().toISOString())

  if (toca("vercel")) await sondearVercel()
  if (toca("supabase")) await sondearSupabase()
  if (toca("openrouter")) await sondearOpenRouter()
  if (toca("telegram")) await sondearTelegram()
  if (toca("db")) await sondearBaseDeDatos()

  console.log("\nListo.\n")
}

await main()
