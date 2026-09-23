/**
 * Compresión de fotos en el navegador, antes de subirlas.
 *
 * Una foto de celular pesa entre 3 y 12 MB. Subirla entera es lento con datos
 * móviles —que es justo donde se saca la foto— y no aporta nada: la galería la
 * muestra a lo sumo a 1600px de lado. Se reescala y se reencoda acá, así lo que
 * viaja son unos cientos de kilobytes.
 *
 * Es un módulo de cliente: usa `createImageBitmap` y `canvas`, que no existen
 * en el servidor.
 */

/** Lado máximo del resultado. Alcanza para ver una captura de pantalla. */
const LADO_MAXIMO = 1600

/** A partir de acá se deja de bajar la calidad. */
const PESO_OBJETIVO = 400 * 1024

/** Calidades que se prueban, de mejor a peor. */
const CALIDADES = [0.82, 0.7, 0.6, 0.5] as const

export type ImagenComprimida = {
  blob: Blob
  width: number
  height: number
  tipo: string
}

export class ImagenInvalidaError extends Error {}

function dibujar(
  bitmap: ImageBitmap,
  escala: number
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas")

  canvas.width = Math.max(1, Math.round(bitmap.width * escala))
  canvas.height = Math.max(1, Math.round(bitmap.height * escala))

  const ctx = canvas.getContext("2d")

  if (!ctx) return null

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

  return canvas
}

function aBlob(
  canvas: HTMLCanvasElement,
  tipo: string,
  calidad: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad))
}

/**
 * Devuelve la versión comprimida de una imagen.
 *
 * Primero reescala al lado máximo, después va bajando la calidad hasta llegar
 * al peso objetivo. Si ni con la calidad más baja alcanza —fotos muy grandes y
 * con mucho detalle— reduce las medidas una vez más y repite.
 */
export async function comprimirImagen(
  archivo: File
): Promise<ImagenComprimida> {
  if (!archivo.type.startsWith("image/")) {
    throw new ImagenInvalidaError("Eso no es una imagen")
  }

  let bitmap: ImageBitmap

  try {
    // `from-image` aplica la orientación EXIF: sin esto, las fotos sacadas en
    // vertical con el celular se suben acostadas.
    bitmap = await createImageBitmap(archivo, {
      imageOrientation: "from-image",
    })
  } catch {
    throw new ImagenInvalidaError("No se pudo leer la imagen")
  }

  // WebP comprime bastante mejor que JPEG a igual calidad. Lo soportan todos
  // los navegadores actuales; si alguno no puede, `toBlob` devuelve un PNG y el
  // tipo real se lee del blob.
  const tipo = "image/webp"

  try {
    let escala = Math.min(
      1,
      LADO_MAXIMO / Math.max(bitmap.width, bitmap.height)
    )
    let mejor: Blob | null = null
    let canvas = dibujar(bitmap, escala)

    if (!canvas) {
      throw new ImagenInvalidaError("No se pudo procesar la imagen")
    }

    for (const intento of [0, 1]) {
      for (const calidad of CALIDADES) {
        const blob = await aBlob(canvas, tipo, calidad)

        if (!blob) continue

        mejor = blob

        if (blob.size <= PESO_OBJETIVO) {
          return {
            blob,
            width: canvas.width,
            height: canvas.height,
            tipo: blob.type || tipo,
          }
        }
      }

      // Segunda vuelta: si bajar la calidad no alcanzó, achicar.
      if (intento === 0) {
        escala *= 0.75
        const reducido = dibujar(bitmap, escala)

        if (!reducido) break

        canvas = reducido
      }
    }

    if (!mejor) {
      throw new ImagenInvalidaError("No se pudo comprimir la imagen")
    }

    return {
      blob: mejor,
      width: canvas.width,
      height: canvas.height,
      tipo: mejor.type || tipo,
    }
  } finally {
    bitmap.close()
  }
}
