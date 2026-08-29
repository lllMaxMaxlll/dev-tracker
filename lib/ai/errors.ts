/** Errores tipados de la capa de IA, para poder mostrar mensajes accionables. */
export type CodigoErrorIA =
  "MODELO_SIN_TOOLS" | "SALIDA_INVALIDA" | "TIMEOUT" | "PROVEEDOR"

export class ErrorIA extends Error {
  constructor(
    readonly codigo: CodigoErrorIA,
    message: string,
    readonly detalle?: string
  ) {
    super(message)
    this.name = "ErrorIA"
  }
}

export function esErrorIA(error: unknown): error is ErrorIA {
  return error instanceof ErrorIA
}
