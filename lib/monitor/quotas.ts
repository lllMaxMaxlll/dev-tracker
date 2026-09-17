/**
 * Cuotas de los planes.
 *
 * Ninguna de las tres APIs devuelve el límite del plan: sólo el consumo. Sin
 * este archivo, una regla de tipo `porcentaje_cuota` no tendría contra qué
 * calcular el porcentaje.
 *
 * Es el único lugar del código donde vive un número que no salió de una API, y
 * por eso cada entrada lleva fecha y link: un número inventado acá hace que la
 * barra de la UI mienta con total convicción. Cuando no se sabe, no se pone:
 * `cuotaDe()` devuelve undefined y la UI muestra el valor absoluto sin barra.
 *
 * Cuando el proveedor sí informa el tope —Supabase reporta el tamaño del disco,
 * OpenRouter reporta su límite diario de peticiones gratis— la cuota se declara
 * como derivada de esa otra métrica en vez de copiarse: así no se desactualiza.
 */
export type Cuota =
  | {
      tipo: "fija"
      valor: number
      plan: string
      verificadoEl: string
      fuente: string
    }
  | {
      tipo: "derivada"
      /** Métrica que trae el tope, medida sobre el mismo recurso. */
      metrica: string
      nota: string
    }

export const CUOTAS: Record<string, Cuota> = {
  // El propio endpoint de disco devuelve fs_size_bytes junto con fs_used_bytes,
  // así que el tope se lee, no se supone. Vale tanto para Free como para
  // cualquier plan con disco ampliado.
  "supabase.disk_used_bytes": {
    tipo: "derivada",
    metrica: "supabase.disk_size_bytes",
    nota: "Lo informa /v1/projects/{ref}/config/disk/util en la misma respuesta.",
  },

  "openrouter.free_requests_used": {
    tipo: "derivada",
    metrica: "openrouter.free_requests_limit",
    nota: "Lo informa /api/v1/key en free_model_daily_requests.limit.",
  },

  // ── Sin cuota declarada, a propósito ───────────────────────────────────────
  //
  // Vercel Hobby: los topes del plan (ancho de banda, invocaciones, horas de
  // cómputo) no salen de ninguna API, y la unidad en que Vercel los factura
  // cambió más de una vez. Ponerlos de memoria haría que la barra de la UI
  // mostrara un porcentaje falso, que es peor que no mostrar ninguno.
  //
  // Se completan cuando `bun run sondear:uso --fuente=vercel` diga qué
  // combinaciones de servicio y unidad devuelve realmente esta cuenta; ahí
  // recién se sabe contra qué habría que comparar. Hasta entonces las reglas de
  // Vercel son de umbral absoluto en dólares, que no necesita cuota.
  //
  // Supabase egress y MAU: no existe endpoint público. Viven sólo en la página
  // de facturación de la organización.
}

export function cuotaDe(metrica: string): Cuota | undefined {
  return CUOTAS[metrica]
}

/**
 * Resuelve la cuota a un número.
 *
 * `valorDeMetrica` la provee quien llama porque las cuotas derivadas dependen
 * del recurso concreto: el disco de un proyecto no es el de otro.
 */
export function resolverCuota(
  metrica: string,
  valorDeMetrica: (clave: string) => number | undefined
): number | undefined {
  const cuota = cuotaDe(metrica)

  if (!cuota) return undefined

  if (cuota.tipo === "fija") return cuota.valor

  const valor = valorDeMetrica(cuota.metrica)

  // Un tope de cero no es un tope: sería una división por cero disfrazada de
  // "estás al infinito por ciento".
  return valor && valor > 0 ? valor : undefined
}
