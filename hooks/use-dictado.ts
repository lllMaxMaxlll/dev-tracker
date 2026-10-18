"use client"

import * as React from "react"

/**
 * Dictado por voz con la Web Speech API.
 *
 * No está en todos los navegadores: Firefox no la tiene y en iOS el soporte es
 * parcial. Por eso `soportado` se expone y la interfaz esconde el botón cuando
 * no está: el textarea siempre funciona igual.
 */
type ReconocimientoLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  onresult: ((evento: SpeechRecognitionEventLike) => void) | null
  onerror: ((evento: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: {
    length: number
    [i: number]: { isFinal: boolean; 0: { transcript: string } }
  }
}

function constructor(): (new () => ReconocimientoLike) | null {
  if (typeof window === "undefined") return null

  const w = window as unknown as {
    SpeechRecognition?: new () => ReconocimientoLike
    webkitSpeechRecognition?: new () => ReconocimientoLike
  }

  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const suscripcionVacia = () => () => {}

/** Los errores que vale la pena explicar; el resto se ve como un corte. */
const MENSAJES_DE_ERROR: Record<string, string> = {
  "not-allowed": "El navegador no tiene permiso para usar el micrófono.",
  "service-not-allowed": "El navegador no tiene permiso para usar el micrófono.",
  "audio-capture": "No se encontró un micrófono.",
  network: "El dictado necesita conexión a internet.",
}

export function useDictado({
  onTexto,
  onFin,
}: {
  /** Cada frase que el reconocimiento da por terminada. */
  onTexto: (texto: string) => void
  /** Cuando el reconocimiento se cerró y ya entregó todo el texto. */
  onFin?: () => void
}) {
  const [escuchando, setEscuchando] = React.useState(false)
  // Lo que se está diciendo y todavía puede cambiar. Se muestra aparte para
  // no pisar lo que el usuario edita a mano en el textarea.
  const [parcial, setParcial] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const referencia = React.useRef<ReconocimientoLike | null>(null)

  // useSyncExternalStore en vez de un flag en useEffect: la API sólo existe en
  // el cliente y hay que devolver `false` durante el render del servidor.
  const soportado = React.useSyncExternalStore(
    suscripcionVacia,
    () => constructor() !== null,
    () => false
  )

  // Los callbacks se guardan en refs para que `iniciar` no dependa de ellos y
  // no haya que recrear el reconocimiento en cada render. Se sincronizan en un
  // effect: escribir un ref durante el render no está permitido.
  const onTextoRef = React.useRef(onTexto)
  const onFinRef = React.useRef(onFin)

  React.useEffect(() => {
    onTextoRef.current = onTexto
    onFinRef.current = onFin
  }, [onTexto, onFin])

  const iniciar = React.useCallback(() => {
    if (referencia.current) return

    const Constructor = constructor()

    if (!Constructor) return

    const reconocimiento = new Constructor()
    reconocimiento.lang = "es-AR"
    reconocimiento.continuous = true
    reconocimiento.interimResults = true

    reconocimiento.onresult = (evento) => {
      let final = ""
      let provisorio = ""

      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i]

        if (resultado.isFinal) {
          final += resultado[0].transcript
        } else {
          provisorio += resultado[0].transcript
        }
      }

      if (final.trim()) {
        onTextoRef.current(final.trim())
      }

      setParcial(provisorio)
    }

    reconocimiento.onerror = (evento) => {
      setError(MENSAJES_DE_ERROR[evento.error ?? ""] ?? null)
    }

    // `onend` llega siempre, también después de un error, y siempre después
    // del último `onresult`: es el único lugar seguro para avisar que terminó.
    reconocimiento.onend = () => {
      referencia.current = null
      setEscuchando(false)
      setParcial("")
      onFinRef.current?.()
    }

    referencia.current = reconocimiento
    setError(null)

    try {
      reconocimiento.start()
      setEscuchando(true)
    } catch {
      referencia.current = null
    }
  }, [])

  const detener = React.useCallback(() => {
    referencia.current?.stop()
  }, [])

  const alternar = React.useCallback(() => {
    if (referencia.current) {
      detener()
    } else {
      iniciar()
    }
  }, [detener, iniciar])

  React.useEffect(() => () => referencia.current?.stop(), [])

  return { soportado, escuchando, parcial, error, iniciar, detener, alternar }
}
