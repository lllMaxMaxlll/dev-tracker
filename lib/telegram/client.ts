import "server-only"

import { env } from "@/lib/env"
import { trocear } from "@/lib/telegram/format"

/**
 * Envío de mensajes por el bot de Telegram.
 *
 * Nunca lanza. Telegram es el canal, no la fuente de verdad: si el bot no está
 * configurado o la API está caída, la alerta tiene que seguir quedando
 * registrada en la base y visible en /consumo. Hacer fallar la recolección
 * porque no se pudo avisar sería perder el dato además del aviso.
 */
export type ResultadoEnvio = { enviado: boolean; motivo?: string }

export function telegramConfigurado(): boolean {
  const config = env()

  return Boolean(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID)
}

export async function enviarMensaje(texto: string): Promise<ResultadoEnvio> {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = env()

  if (!token || !chat) {
    return { enviado: false, motivo: "Telegram no está configurado" }
  }

  for (const trozo of trocear(texto)) {
    const resultado = await enviarTrozo(token, chat, trozo)

    if (!resultado.enviado) return resultado
  }

  return { enviado: true }
}

async function enviarTrozo(
  token: string,
  chat: string,
  texto: string
): Promise<ResultadoEnvio> {
  try {
    const respuesta = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chat,
          text: texto,
          parse_mode: "HTML",
          // Las alertas no llevan links, y sin previsualización el mensaje
          // ocupa lo que dice ocupar.
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(10_000),
      }
    )

    if (respuesta.ok) return { enviado: true }

    const detalle = (await respuesta.text().catch(() => "")).slice(0, 200)

    return {
      enviado: false,
      motivo: `Telegram respondió ${respuesta.status}: ${detalle}`,
    }
  } catch (error) {
    return {
      enviado: false,
      motivo: error instanceof Error ? error.message : "error desconocido",
    }
  }
}
