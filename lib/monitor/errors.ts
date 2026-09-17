/**
 * Errores tipados del monitor de consumo.
 *
 * El código importa más que el mensaje: la diferencia entre "el plan no expone
 * este dato" y "la llamada falló" es justamente lo que la página tiene que
 * saber para no mostrar un cero donde en realidad no hay información.
 */
export type CodigoErrorMonitor =
  "SIN_CREDENCIAL" | "NO_DISPONIBLE" | "RATE_LIMIT" | "TIMEOUT" | "PROVEEDOR"

export class ErrorMonitor extends Error {
  constructor(
    readonly codigo: CodigoErrorMonitor,
    message: string,
    readonly detalle?: string
  ) {
    super(message)
    this.name = "ErrorMonitor"
  }
}

export function esErrorMonitor(error: unknown): error is ErrorMonitor {
  return error instanceof ErrorMonitor
}

/** Mensaje corto para guardar en `monitored_resources.last_error`. */
export function describirError(error: unknown): string {
  if (esErrorMonitor(error)) {
    return error.detalle ? `${error.message} ${error.detalle}` : error.message
  }

  return error instanceof Error ? error.message : String(error)
}
