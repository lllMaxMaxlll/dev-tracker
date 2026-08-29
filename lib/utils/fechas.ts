import { formatDistanceToNowStrict, format } from "date-fns"
import { es } from "date-fns/locale"

export function haceCuanto(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha

  return formatDistanceToNowStrict(valor, { addSuffix: true, locale: es })
}

export function fechaCorta(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha

  return format(valor, "d MMM yyyy", { locale: es })
}

export function fechaLarga(fecha: Date | string): string {
  const valor = typeof fecha === "string" ? new Date(fecha) : fecha

  return format(valor, "d 'de' MMMM yyyy, HH:mm", { locale: es })
}

/** Duración legible en español: "3 días", "5 horas". */
export function duracionLegible(ms: number): string {
  const horas = ms / 3_600_000

  if (horas < 1) {
    const minutos = Math.max(1, Math.round(ms / 60_000))

    return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`
  }

  if (horas < 48) {
    const redondeadas = Math.round(horas)

    return `${redondeadas} ${redondeadas === 1 ? "hora" : "horas"}`
  }

  const dias = Math.round(horas / 24)

  return `${dias} ${dias === 1 ? "día" : "días"}`
}
