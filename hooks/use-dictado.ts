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

export function useDictado(onTexto: (texto: string) => void) {
  const [escuchando, setEscuchando] = React.useState(false)
  const referencia = React.useRef<ReconocimientoLike | null>(null)

  // useSyncExternalStore en vez de un flag en useEffect: la API sólo existe en
  // el cliente y hay que devolver `false` durante el render del servidor.
  const soportado = React.useSyncExternalStore(
    suscripcionVacia,
    () => constructor() !== null,
    () => false
  )

  // El callback se guarda en un ref para que `alternar` no dependa de él y no
  // haya que recrear el reconocimiento en cada render. Se sincroniza en un
  // effect: escribir un ref durante el render no está permitido.
  const onTextoRef = React.useRef(onTexto)

  React.useEffect(() => {
    onTextoRef.current = onTexto
  }, [onTexto])

  const alternar = React.useCallback(() => {
    if (escuchando) {
      referencia.current?.stop()

      return
    }

    const Constructor = constructor()

    if (!Constructor) return

    const reconocimiento = new Constructor()
    reconocimiento.lang = "es-AR"
    reconocimiento.continuous = true
    reconocimiento.interimResults = false

    reconocimiento.onresult = (evento) => {
      let texto = ""

      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        if (evento.results[i].isFinal) {
          texto += evento.results[i][0].transcript
        }
      }

      if (texto) {
        onTextoRef.current(texto)
      }
    }

    reconocimiento.onerror = () => setEscuchando(false)
    reconocimiento.onend = () => setEscuchando(false)

    referencia.current = reconocimiento
    reconocimiento.start()
    setEscuchando(true)
  }, [escuchando])

  React.useEffect(() => () => referencia.current?.stop(), [])

  return { soportado, escuchando, alternar }
}
