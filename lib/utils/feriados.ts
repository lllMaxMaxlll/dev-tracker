/**
 * Feriados nacionales de Argentina.
 *
 * Van escritos y no calculados: Carnaval y Viernes Santo dependen de la Pascua,
 * los trasladables se corren según la Ley 27.399, y los puentes turísticos los
 * decide el Ejecutivo por decreto cada año —no hay fórmula que los adivine—.
 * Una lista es más honesta que una cuenta que acierta a medias.
 *
 * Incluye los puentes turísticos. En el sector privado son «días no laborables»
 * y trabajarlos depende del empleador: si los trabajás, borrá esas fechas.
 *
 * Para actualizar:
 *   curl -s https://api.argentinadatos.com/v1/feriados/AAAA
 * o el calendario oficial en argentina.gob.ar/jefatura. Ojo: los puentes de un
 * año aparecen recién cuando sale la resolución, así que un año sin puentes
 * está incompleto, no libre de ellos.
 */
export const FERIADOS: Record<string, string> = {
  // ── 2025 ──
  "2025-01-01": "Año nuevo",
  "2025-03-03": "Carnaval",
  "2025-03-04": "Carnaval",
  "2025-03-24": "Día Nacional de la Memoria por la Verdad y la Justicia",
  "2025-04-02": "Día del Veterano y de los Caídos en la Guerra de Malvinas",
  "2025-04-18": "Viernes Santo",
  "2025-05-01": "Día del Trabajador",
  "2025-05-02": "Puente turístico no laborable",
  "2025-05-25": "Día de la Revolución de Mayo",
  "2025-06-16": "Paso a la Inmortalidad del General Martín Güemes",
  "2025-06-20": "Paso a la Inmortalidad del General Manuel Belgrano",
  "2025-07-09": "Día de la Independencia",
  "2025-08-15": "Puente turístico no laborable",
  "2025-08-17": "Paso a la Inmortalidad del Gral. José de San Martín",
  "2025-10-10": "Puente turístico no laborable",
  "2025-10-12": "Día del Respeto a la Diversidad Cultural",
  "2025-11-21": "Puente turístico no laborable",
  "2025-11-24": "Día de la Soberanía Nacional",
  "2025-12-08": "Día de la Inmaculada Concepción de María",
  "2025-12-25": "Navidad",

  // ── 2026 ──
  "2026-01-01": "Año nuevo",
  "2026-02-16": "Carnaval",
  "2026-02-17": "Carnaval",
  "2026-03-23": "Puente turístico no laborable",
  "2026-03-24": "Día Nacional de la Memoria por la Verdad y la Justicia",
  "2026-04-02": "Día del Veterano y de los Caídos en la Guerra de Malvinas",
  "2026-04-03": "Viernes Santo",
  "2026-05-01": "Día del Trabajador",
  "2026-05-25": "Día de la Revolución de Mayo",
  "2026-06-15": "Paso a la Inmortalidad del General Martín Güemes (17/6)",
  "2026-06-20": "Paso a la Inmortalidad del General Manuel Belgrano",
  "2026-07-09": "Día de la Independencia",
  "2026-07-10": "Puente turístico no laborable",
  "2026-08-17": "Paso a la Inmortalidad del Gral. José de San Martín",
  "2026-10-12": "Día del Respeto a la Diversidad Cultural",
  "2026-11-23": "Día de la Soberanía Nacional (20/11)",
  "2026-12-07": "Puente turístico no laborable",
  "2026-12-08": "Día de la Inmaculada Concepción de María",
  "2026-12-25": "Navidad",

  // ── 2027 ──
  // Los puentes turísticos de este año todavía no se decretaron.
  "2027-01-01": "Año nuevo",
  "2027-02-08": "Carnaval",
  "2027-02-09": "Carnaval",
  "2027-03-24": "Día Nacional de la Memoria por la Verdad y la Justicia",
  "2027-03-26": "Viernes Santo",
  "2027-04-02": "Día del Veterano y de los Caídos en la Guerra de Malvinas",
  "2027-05-01": "Día del Trabajador",
  "2027-05-25": "Día de la Revolución de Mayo",
  "2027-06-17": "Paso a la Inmortalidad del General Martín Güemes",
  "2027-06-20": "Paso a la Inmortalidad del General Manuel Belgrano",
  "2027-07-09": "Día de la Independencia",
  "2027-08-17": "Paso a la Inmortalidad del Gral. José de San Martín",
  "2027-10-12": "Día del Respeto a la Diversidad Cultural",
  "2027-11-20": "Día de la Soberanía Nacional",
  "2027-12-08": "Día de la Inmaculada Concepción de María",
  "2027-12-25": "Navidad",
}

/** Años que cubre la lista. Fuera de ese rango no se descuenta ningún feriado. */
export const ANIOS_CUBIERTOS = { desde: 2025, hasta: 2027 } as const

const avisados = new Set<number>()

/**
 * Si esa fecha local (AAAA-MM-DD) es feriado.
 *
 * Una fecha fuera de los años cargados cuenta como día hábil y deja un aviso en
 * los logs, una vez por año: es preferible un promedio apenas optimista con un
 * recordatorio, a que la lista caduque en silencio.
 */
export function esFeriado(fecha: string): boolean {
  const anio = Number(fecha.slice(0, 4))

  if (anio < ANIOS_CUBIERTOS.desde || anio > ANIOS_CUBIERTOS.hasta) {
    if (!avisados.has(anio)) {
      avisados.add(anio)
      console.warn(
        `[feriados] no hay feriados cargados para ${anio}: actualizá lib/utils/feriados.ts`
      )
    }

    return false
  }

  return fecha in FERIADOS
}
