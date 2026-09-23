import { createClient } from "@/lib/supabase/client"
import { prepararSubida, registrarAdjunto } from "@/actions/attachments"
import type { ImagenComprimida } from "@/lib/utils/comprimir-imagen"

const BUCKET = "adjuntos"

/**
 * Sube al bucket una imagen ya comprimida y la registra en la base.
 *
 * El orden importa: primero el servidor reserva la ruta (y de paso comprueba
 * que el problema sea tuyo), después va el archivo, y recién al final la fila.
 * Si la fila falla, el archivo se borra: una foto invisible en el bucket es
 * basura que nadie va a encontrar para limpiar.
 *
 * Lo usan la galería del detalle y el alta, que suben en momentos distintos: la
 * galería apenas elegís el archivo, el alta cuando el problema ya existe.
 */
export async function subirFoto(
  issueId: string,
  imagen: ImagenComprimida,
  nombreArchivo?: string
): Promise<void> {
  const reserva = await prepararSubida(issueId, imagen.tipo)

  if (!reserva.ok) {
    throw new Error(reserva.error)
  }

  const { path } = reserva.data
  const supabase = createClient()

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, imagen.blob, { contentType: imagen.tipo, upsert: false })

  if (error) {
    throw new Error(error.message)
  }

  const registrada = await registrarAdjunto({
    issueId,
    path,
    fileName: nombreArchivo?.slice(0, 120),
    mimeType: imagen.tipo,
    sizeBytes: imagen.blob.size,
    width: imagen.width,
    height: imagen.height,
  })

  if (!registrada.ok) {
    await supabase.storage.from(BUCKET).remove([path])

    throw new Error(registrada.error)
  }
}

/** Mensaje legible de lo que salió mal al subir una foto. */
export function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : "No se pudo subir"
}
