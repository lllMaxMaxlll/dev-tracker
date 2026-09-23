import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Bucket privado creado en la migración 0010. */
export const BUCKET_ADJUNTOS = "adjuntos"

/** Cuántas fotos se aceptan por problema. */
export const MAX_ADJUNTOS_POR_ISSUE = 10

/**
 * Techo de subida, igual al `file_size_limit` del bucket. El navegador comprime
 * muy por debajo; esto sólo ataja lo que llegue por otro camino.
 */
export const MAX_BYTES_ADJUNTO = 2 * 1024 * 1024

export const TIPOS_ADJUNTO = ["image/webp", "image/jpeg", "image/png"] as const

/** El archivo se llama como lo que realmente es, no como lo que pedimos. */
export const EXTENSIONES_ADJUNTO: Record<
  (typeof TIPOS_ADJUNTO)[number],
  string
> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png",
}

/**
 * Ruta de un archivo dentro del bucket. La primera carpeta es el id del
 * usuario: es lo que miran las políticas del bucket para decidir de quién es.
 */
export function rutaAdjunto(
  userId: string,
  issueId: string,
  nombreArchivo: string
): string {
  return `${userId}/${issueId}/${nombreArchivo}`
}

export function esRutaPropia(
  path: string,
  userId: string,
  issueId: string
): boolean {
  const partes = path.split("/")

  return (
    partes.length === 3 &&
    partes[0] === userId &&
    partes[1] === issueId &&
    partes[2].length > 0 &&
    // Nada de subir un nivel ni de rutas raras.
    !partes[2].includes("..")
  )
}

/** Una hora: lo que dura mirar un problema, sin dejar enlaces eternos sueltos. */
const SEGUNDOS_FIRMA = 60 * 60

/**
 * URLs firmadas para mostrar las imágenes. El bucket es privado, así que sin
 * firma no hay forma de verlas; las firmas caducan y se generan en cada render.
 */
export async function firmarAdjuntos(
  paths: string[]
): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()

  if (paths.length === 0) return firmadas

  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from(BUCKET_ADJUNTOS)
    .createSignedUrls(paths, SEGUNDOS_FIRMA)

  if (error) {
    console.error("[firmarAdjuntos]", error)

    return firmadas
  }

  for (const item of data ?? []) {
    if (item.signedUrl && item.path) {
      firmadas.set(item.path, item.signedUrl)
    }
  }

  return firmadas
}

/**
 * Borra archivos del bucket. Devuelve si salió bien: quien llama decide qué
 * hacer, porque un archivo huérfano es menos grave que una fila fantasma.
 */
export async function borrarObjetos(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true

  const supabase = await createClient()
  const { error } = await supabase.storage.from(BUCKET_ADJUNTOS).remove(paths)

  if (error) {
    console.error("[borrarObjetos]", error)

    return false
  }

  return true
}
