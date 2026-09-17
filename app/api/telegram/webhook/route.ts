import { NextResponse, type NextRequest } from "next/server"

import { env } from "@/lib/env"
import { responder } from "@/lib/telegram/commands"

/**
 * Webhook del bot de Telegram.
 *
 * Doble validación, porque cada una tapa un agujero distinto:
 *
 *   • El `secret_token` (cabecera X-Telegram-Bot-Api-Secret-Token) prueba que
 *     la petición viene de Telegram y no de cualquiera que descubra la URL.
 *   • El `chat.id` prueba que quien pregunta sos vos. Sin esto, cualquiera que
 *     encuentre el bot y le escriba recibiría el detalle de tu infraestructura
 *     y tu gasto: Telegram reenviaría su mensaje con un secret_token
 *     perfectamente válido.
 *
 * La respuesta va en el CUERPO del 200, con `method: "sendMessage"`: Telegram
 * ejecuta eso como si fuera una llamada a la API. Ahorra un viaje de ida y
 * vuelta y deja el handler terminando en milisegundos, que importa porque
 * Telegram reintenta el update si tardás.
 */
export const maxDuration = 30

type Update = {
  message?: {
    text?: string
    chat?: { id?: number | string }
  }
}

export async function POST(request: NextRequest) {
  const config = env()

  if (!config.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET no está configurado" },
      { status: 500 }
    )
  }

  const secreto = request.headers.get("x-telegram-bot-api-secret-token")

  if (secreto !== config.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 })
  }

  let update: Update

  try {
    update = (await request.json()) as Update
  } catch {
    // 200 y no 400: un cuerpo ilegible no se arregla reintentando, y Telegram
    // reintenta todo lo que no sea 2xx.
    return NextResponse.json({})
  }

  const chat = update.message?.chat?.id
  const texto = update.message?.text

  if (!chat || !texto) return NextResponse.json({})

  if (String(chat) !== config.TELEGRAM_CHAT_ID) {
    // Silencio deliberado: contestar "no estás autorizado" ya confirmaría que
    // el bot hace algo y para quién.
    console.warn("[telegram] mensaje de un chat no autorizado", chat)

    return NextResponse.json({})
  }

  try {
    return NextResponse.json({
      method: "sendMessage",
      chat_id: chat,
      text: await responder(texto),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    })
  } catch (error) {
    console.error("[telegram] no se pudo responder", error)

    return NextResponse.json({
      method: "sendMessage",
      chat_id: chat,
      text: "No pude leer el consumo. Revisá los logs del servidor.",
    })
  }
}
