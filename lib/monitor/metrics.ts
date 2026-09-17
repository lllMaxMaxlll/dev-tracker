import type { UsageAggregation } from "@/lib/db/schema"

/**
 * Catálogo de métricas del monitor.
 *
 * Es la única fuente de las etiquetas y unidades que ve el usuario: sin esto,
 * cada componente terminaría con su propio `Record<string, string>` y las tres
 * fuentes se rotularían distinto.
 *
 * `metric` en la base es text, no un enum, justamente para que agregar una
 * métrica sea editar este archivo y no escribir una migración. La contracara
 * es que pueden llegar claves que no están acá — de un cargo de Vercel que el
 * mapeo todavía no conoce, por ejemplo — y por eso `definicionDe()` devuelve
 * algo razonable en vez de romper.
 */
export type Unidad =
  | "usd"
  | "bytes"
  | "peticiones"
  | "despliegues"
  | "cantidad"
  | "horas"
  | "booleano"

export type DefinicionMetrica = {
  etiqueta: string
  unidad: Unidad
  agregacion: UsageAggregation
  /** Qué significa el número, cuando no es obvio. */
  nota?: string
}

export const METRICAS = {
  // ── Vercel ─────────────────────────────────────────────────────────────────
  "vercel.cost_usd": {
    etiqueta: "Cargos",
    unidad: "usd",
    agregacion: "suma",
    nota: "Suma de BilledCost de todos los servicios del proyecto.",
  },
  "vercel.deployments": {
    etiqueta: "Despliegues",
    unidad: "despliegues",
    agregacion: "suma",
    nota: "Plan B cuando la facturación no está disponible: mide actividad, no costo.",
  },

  // Las siguientes salen de mapear ConsumedQuantity de cada cargo FOCUS. Los
  // nombres de servicio con los que Vercel las factura están en
  // lib/monitor/vercel.ts; hasta que el sondeo confirme cuáles aparecen de
  // verdad en esta cuenta, son provisionales. Ninguna se escribe si el mapeo
  // no reconoce el cargo: lo no reconocido va a `avisos`, no a la base.
  "vercel.data_transfer_bytes": {
    etiqueta: "Transferencia de datos",
    unidad: "bytes",
    agregacion: "suma",
  },
  "vercel.edge_requests": {
    etiqueta: "Peticiones al edge",
    unidad: "peticiones",
    agregacion: "suma",
  },
  "vercel.function_invocations": {
    etiqueta: "Invocaciones de funciones",
    unidad: "cantidad",
    agregacion: "suma",
  },
  "vercel.function_duration_hours": {
    etiqueta: "Cómputo de funciones",
    unidad: "horas",
    agregacion: "suma",
  },
  "vercel.image_transformations": {
    etiqueta: "Transformaciones de imagen",
    unidad: "cantidad",
    agregacion: "suma",
  },
  "vercel.isr_reads": {
    etiqueta: "Lecturas de ISR",
    unidad: "cantidad",
    agregacion: "suma",
  },
  "vercel.isr_writes": {
    etiqueta: "Escrituras de ISR",
    unidad: "cantidad",
    agregacion: "suma",
  },

  // ── Supabase ───────────────────────────────────────────────────────────────
  "supabase.disk_used_bytes": {
    etiqueta: "Disco usado",
    unidad: "bytes",
    agregacion: "maximo",
    nota: "Del mes interesa el pico, no el último valor: si se llenó un martes, eso es lo que hay que ver.",
  },
  "supabase.disk_size_bytes": {
    etiqueta: "Disco total",
    unidad: "bytes",
    agregacion: "ultimo",
  },
  "supabase.db_size_bytes": {
    etiqueta: "Tamaño de la base",
    unidad: "bytes",
    agregacion: "maximo",
    nota: "Lo que Supabase factura, y no lo mismo que el disco usado: en DevTracker la base son 14 MB y el disco 276 MB. El plan Free documenta un tope de 500 MB, pero la API no informa el tope de ningún plan, así que no se muestra como porcentaje.",
  },
  "supabase.rest_requests": {
    etiqueta: "Peticiones REST",
    unidad: "peticiones",
    agregacion: "suma",
  },
  "supabase.auth_requests": {
    etiqueta: "Peticiones de Auth",
    unidad: "peticiones",
    agregacion: "suma",
  },
  "supabase.storage_requests": {
    etiqueta: "Peticiones de Storage",
    unidad: "peticiones",
    agregacion: "suma",
  },
  "supabase.realtime_requests": {
    etiqueta: "Peticiones de Realtime",
    unidad: "peticiones",
    agregacion: "suma",
  },
  "supabase.project_paused": {
    etiqueta: "Proyecto pausado",
    unidad: "booleano",
    agregacion: "ultimo",
    nota: "Supabase pausa los proyectos del plan Free tras 7 días sin actividad.",
  },

  // ── OpenRouter ─────────────────────────────────────────────────────────────
  // El gasto por tarea NO se copia acá: ya está en ai_usage_log, indexado y
  // agregado por lib/ai/usage.ts. Duplicarlo daría dos fuentes de verdad que
  // se pueden desincronizar. Lo que sí se guarda es lo que la base no sabe:
  // el estado de la cuenta.
  "openrouter.usage_monthly_usd": {
    etiqueta: "Gasto del mes",
    unidad: "usd",
    agregacion: "ultimo",
    nota: "Acumulado que reporta OpenRouter para el mes en curso.",
  },
  "openrouter.credits_remaining_usd": {
    etiqueta: "Saldo",
    unidad: "usd",
    agregacion: "ultimo",
  },
  "openrouter.free_requests_used": {
    etiqueta: "Peticiones a modelos gratis",
    unidad: "peticiones",
    agregacion: "ultimo",
    nota: "Cuota diaria de los modelos con sufijo :free.",
  },
  "openrouter.free_requests_limit": {
    etiqueta: "Tope de peticiones gratis",
    unidad: "peticiones",
    agregacion: "ultimo",
  },

  // ── El propio monitor ──────────────────────────────────────────────────────
  "monitor.sync_age_hours": {
    etiqueta: "Antigüedad de la recolección",
    unidad: "horas",
    agregacion: "ultimo",
    nota: "Horas desde la última corrida exitosa. No se guarda como snapshot: se calcula sobre sync_runs al evaluar, porque si la recolección muere no hay nadie que escriba la fila.",
  },
} as const satisfies Record<string, DefinicionMetrica>

export type ClaveMetrica = keyof typeof METRICAS

/**
 * Definición de una métrica, con un respaldo razonable para las claves que
 * todavía no están en el catálogo. Devolver la clave cruda es feo pero honesto;
 * inventar una etiqueta lo sería menos.
 */
export function definicionDe(clave: string): DefinicionMetrica {
  const conocida = (METRICAS as Record<string, DefinicionMetrica | undefined>)[
    clave
  ]

  if (conocida) return conocida

  return {
    etiqueta: clave,
    unidad: "peticiones",
    agregacion: "suma",
  }
}

export function esMetricaConocida(clave: string): clave is ClaveMetrica {
  return clave in METRICAS
}

const formatoUsd = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

const formatoEntero = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 0,
})

export function formatearBytes(bytes: number): string {
  const unidades = ["B", "KB", "MB", "GB", "TB"]

  let valor = Math.abs(bytes)
  let indice = 0

  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024
    indice += 1
  }

  const decimales = valor < 10 && indice > 0 ? 2 : valor < 100 ? 1 : 0

  return `${(bytes < 0 ? -valor : valor).toFixed(decimales)} ${unidades[indice]}`
}

/** Para la UI y para los mensajes de Telegram: un solo formato en los dos. */
export function formatearValor(valor: number, unidad: Unidad): string {
  switch (unidad) {
    case "usd":
      return formatoUsd.format(valor)
    case "bytes":
      return formatearBytes(valor)
    case "horas":
      return valor < 1
        ? `${Math.round(valor * 60)} min`
        : `${valor.toFixed(1)} h`
    case "booleano":
      return valor >= 1 ? "sí" : "no"
    case "peticiones":
    case "despliegues":
    case "cantidad":
      return formatoEntero.format(valor)
  }
}
