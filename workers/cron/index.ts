/**
 * Worker de tareas programadas de DevTracker.
 *
 * Existe por separado de la app porque **vinext no expone un handler
 * `scheduled`**: su entrypoint (`vinext/server/fetch-handler`) exporta
 * únicamente `fetch`. Declarar `triggers.crons` en el Worker de la app hace que
 * Cloudflare dispare el evento contra un Worker que no sabe atenderlo.
 *
 * Este Worker no tiene lógica de negocio: sólo llama a endpoints de la app, que
 * es donde vive todo. Así el cron no duplica nada ni necesita acceso a la base.
 */
type Env = {
  APP_URL: string
  CRON_SECRET: string
}

const RESUMEN_SEMANAL = "0 18 * * 5"

async function resumenSemanal(env: Env) {
  const respuesta = await fetch(`${env.APP_URL}/api/cron/weekly-summary`, {
    headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
  })

  const cuerpo = await respuesta.text()

  console.log(
    `[cron] resumen semanal → ${respuesta.status} ${cuerpo.slice(0, 300)}`
  )

  if (!respuesta.ok) {
    throw new Error(`El resumen semanal falló con ${respuesta.status}`)
  }
}

/**
 * Mantiene despierta la base.
 *
 * Supabase pausa los proyectos del plan gratuito tras **7 días sin actividad de
 * base de datos**, y sólo cuentan las consultas reales: entrar al panel o pegarle
 * a un endpoint cacheado no alcanza. `/api/health` hace un `select 1` a través
 * de Hyperdrive, así que sirve como señal de vida legítima.
 *
 * Corre a diario y no una vez por semana a propósito: con margen de sobra, una
 * corrida fallida no deja el proyecto a un día de pausarse.
 */
async function mantenerBaseDespierta(env: Env) {
  const respuesta = await fetch(`${env.APP_URL}/api/health`)
  const cuerpo = await respuesta.text()

  console.log(
    `[cron] ping a la base → ${respuesta.status} ${cuerpo.slice(0, 120)}`
  )

  if (!respuesta.ok) {
    // Que falle importa: si se repite una semana, Supabase pausa el proyecto.
    throw new Error(`El ping a la base falló con ${respuesta.status}`)
  }
}

const worker = {
  async scheduled(
    evento: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ) {
    const tarea =
      evento.cron === RESUMEN_SEMANAL
        ? resumenSemanal(env)
        : mantenerBaseDespierta(env)

    // `waitUntil` para que el Worker no termine antes de que la llamada
    // resuelva.
    ctx.waitUntil(
      tarea.catch((error) => {
        console.error(`[cron] falló "${evento.cron}"`, error)

        throw error
      })
    )
  },

  /**
   * Permite probar las tareas a mano sin esperar al horario:
   *   curl "https://<worker>/?tarea=ping"
   * Protegido con el mismo secreto que usa la app.
   */
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("no autorizado", { status: 401 })
    }

    try {
      if (url.searchParams.get("tarea") === "resumen") {
        await resumenSemanal(env)
      } else {
        await mantenerBaseDespierta(env)
      }

      return Response.json({ ok: true })
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : "error" },
        { status: 500 }
      )
    }
  },
}

export default worker
