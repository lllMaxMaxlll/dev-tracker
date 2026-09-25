/**
 * Tiempo medido en horas de trabajo.
 *
 * Un problema que se anota un viernes a las 15:00 y se resuelve el lunes a las
 * 08:00 no tardó 65 horas: tardó una. Lo que pasó en el medio fue el fin de
 * semana. Lo mismo con lo que se resuelve de noche desde casa: son horas que
 * existieron, pero no son las que describen cómo viene el trabajo.
 *
 * Contar sólo los minutos que caen dentro de la jornada resuelve los dos casos
 * de una, y también el que pediste al revés: un movimiento fuera de hora no
 * suma nada hasta que abre el día siguiente, así que cuenta como si hubiera
 * pasado recién ahí.
 */

/** Zona del usuario. Argentina no tiene horario de verano desde 2009. */
export const ZONA = "America/Argentina/Buenos_Aires"

/** Jornada laboral, en minutos desde la medianoche local. */
export const JORNADA = {
  inicio: 7 * 60 + 30, // 07:30
  fin: 16 * 60, // 16:00
} as const

/** Duración de un día de trabajo, en milisegundos. */
export const MS_POR_JORNADA = (JORNADA.fin - JORNADA.inicio) * 60_000

const MS_POR_DIA = 86_400_000

const formato = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
})

/**
 * Cuánto se corre la zona respecto de UTC en ese instante, en milisegundos.
 *
 * Se calcula con `Intl` y no con un `-3` fijo para que siga siendo cierto si la
 * zona vuelve a tener horario de verano o si el servidor corre en otra región.
 */
function desfase(instante: Date): number {
  const p = Object.fromEntries(
    formato.formatToParts(instante).map((parte) => [parte.type, parte.value])
  )

  const comoSiFueraUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour === "24" ? "0" : p.hour),
    Number(p.minute),
    Number(p.second)
  )

  return comoSiFueraUtc - instante.getTime()
}

/**
 * Pasa un instante al "reloj local": el mismo momento, corrido para que leerlo
 * con los getters UTC devuelva la hora de la zona. Es lo que permite hacer toda
 * la cuenta con aritmética simple.
 */
function aRelojLocal(instante: Date): number {
  return instante.getTime() + desfase(instante)
}

/**
 * Milisegundos de jornada laboral entre dos instantes.
 *
 * Devuelve 0 si el rango es inválido o si cae entero fuera de horario.
 */
export function msLaborales(desde: Date, hasta: Date): number {
  const inicio = aRelojLocal(desde)
  const fin = aRelojLocal(hasta)

  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) {
    return 0
  }

  // Medianoche local del día en que arranca el rango.
  const primerDia = Math.floor(inicio / MS_POR_DIA) * MS_POR_DIA

  let total = 0

  for (let dia = primerDia; dia <= fin; dia += MS_POR_DIA) {
    const diaDeSemana = new Date(dia).getUTCDay()

    // 0 domingo, 6 sábado.
    if (diaDeSemana === 0 || diaDeSemana === 6) continue

    const abre = dia + JORNADA.inicio * 60_000
    const cierra = dia + JORNADA.fin * 60_000

    const tramoInicio = Math.max(inicio, abre)
    const tramoFin = Math.min(fin, cierra)

    if (tramoFin > tramoInicio) total += tramoFin - tramoInicio
  }

  return total
}

/**
 * Formato de una duración laboral.
 *
 * No sirve el formato de siempre: ahí «2 días» son 48 horas, y acá dos días de
 * trabajo son 17. Por encima de dos jornadas se cuenta en jornadas, que es la
 * unidad en la que se piensa el trabajo.
 */
export function duracionLaboralLegible(ms: number): string {
  const minutos = Math.round(ms / 60_000)

  if (minutos < 60) {
    const m = Math.max(1, minutos)

    return `${m} ${m === 1 ? "minuto" : "minutos"}`
  }

  if (ms < MS_POR_JORNADA * 2) {
    const horas = Math.round(ms / 3_600_000)

    return `${horas} ${horas === 1 ? "hora" : "horas"}`
  }

  const jornadas = ms / MS_POR_JORNADA
  const redondeadas =
    jornadas < 10 ? Math.round(jornadas * 10) / 10 : Math.round(jornadas)

  return `${String(redondeadas).replace(".", ",")} ${
    redondeadas === 1 ? "jornada" : "jornadas"
  }`
}
