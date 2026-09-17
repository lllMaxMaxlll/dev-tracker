import "server-only"

import { env } from "@/lib/env"
import { ErrorMonitor } from "@/lib/monitor/errors"
import { diaUtc, pedirJson } from "@/lib/monitor/http"
import type { Colector, Medicion, ResultadoColector } from "@/lib/monitor/types"

/**
 * Colector de OpenRouter.
 *
 * Sólo mide el ESTADO DE LA CUENTA: saldo, acumulado del mes y cuota diaria de
 * los modelos gratuitos. El gasto por tarea no se toca — ya está en
 * `ai_usage_log`, que lo escribe `lib/ai/usage.ts` con el detalle de modelo y
 * tokens, y lo agrega `getConsumoDelMes()`. Copiarlo acá daría dos fuentes de
 * verdad para el mismo número, que tarde o temprano dejarían de coincidir.
 *
 * La división es limpia: la base sabe en qué se gastó, la API sabe cuánto queda.
 */
const BASE = "https://openrouter.ai/api/v1"

function credencial(): string {
  const key = env().OPENROUTER_API_KEY

  if (!key) {
    throw new ErrorMonitor(
      "SIN_CREDENCIAL",
      "Falta la API key de OpenRouter.",
      "Cargá OPENROUTER_API_KEY en las variables de entorno."
    )
  }

  return key
}

type Creditos = {
  data?: { total_credits?: number; total_usage?: number }
}

type Key = {
  data?: {
    usage?: number
    usage_monthly?: number
    limit?: number | null
    limit_remaining?: number | null
    is_free_tier?: boolean
    free_model_daily_requests?: {
      used?: number
      limit?: number
      remaining?: number
    }
  }
}

export const colectorOpenRouter: Colector = {
  fuente: "openrouter",
  nombre: "OpenRouter",
  cadenciaMinutos: 60,

  apagado() {
    return !env().OPENROUTER_API_KEY
  },

  async recolectar(señal) {
    const token = credencial()
    const proveedor = "OpenRouter"
    const dia = diaUtc(new Date())
    const avisos: string[] = []

    const [creditos, key] = await Promise.all([
      pedirJson<Creditos>(`${BASE}/credits`, { token, señal, proveedor }),
      pedirJson<Key>(`${BASE}/key`, { token, señal, proveedor }),
    ])

    const mediciones: Medicion[] = []

    const comprados = creditos.data?.total_credits
    const gastados = creditos.data?.total_usage

    // Sólo tiene sentido si se compraron créditos alguna vez. En una cuenta
    // free tier `total_credits` es 0 y esto daría un "saldo" de -0,002 USD:
    // un número que parece una deuda y no significa nada. Mejor no publicarlo
    // y que la UI muestre un guion.
    if (
      typeof comprados === "number" &&
      typeof gastados === "number" &&
      comprados > 0
    ) {
      mediciones.push({
        metrica: "openrouter.credits_remaining_usd",
        dia,
        valor: comprados - gastados,
        unidad: "usd",
        agregacion: "ultimo",
      })
    }

    const mensual = key.data?.usage_monthly

    if (typeof mensual === "number") {
      mediciones.push({
        metrica: "openrouter.usage_monthly_usd",
        dia,
        valor: mensual,
        unidad: "usd",
        agregacion: "ultimo",
      })
    }

    const gratis = key.data?.free_model_daily_requests

    if (typeof gratis?.used === "number") {
      mediciones.push({
        metrica: "openrouter.free_requests_used",
        dia,
        valor: gratis.used,
        unidad: "peticiones",
        agregacion: "ultimo",
      })
    }

    if (typeof gratis?.limit === "number") {
      mediciones.push({
        metrica: "openrouter.free_requests_limit",
        dia,
        valor: gratis.limit,
        unidad: "peticiones",
        agregacion: "ultimo",
      })
    }

    if (mediciones.length === 0) {
      avisos.push(
        "La cuenta respondió pero sin ninguna métrica reconocible; puede que la key no tenga permiso de lectura."
      )
    }

    return {
      datos: [
        {
          // Una sola "cuenta" y no un recurso por modelo: el consumo por modelo
          // ya se desglosa en el panel de IA, a partir de ai_usage_log.
          recurso: {
            fuente: "openrouter",
            idExterno: "cuenta",
            nombre: "Cuenta de OpenRouter",
            estado: key.data?.is_free_tier ? "free" : "pago",
          },
          mediciones,
        },
      ],
      avisos,
    } satisfies ResultadoColector
  },
}
