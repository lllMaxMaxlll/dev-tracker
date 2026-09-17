/**
 * Formato de los mensajes de Telegram.
 *
 * Se manda HTML y no MarkdownV2 a propósito: MarkdownV2 obliga a escapar
 * dieciocho caracteres, el punto entre ellos, así que un importe como "$1.50"
 * rompe el mensaje con un 400 y la alerta no llega. HTML sólo pide escapar
 * tres, y son los tres de siempre.
 */
export function escaparHtml(texto: string): string {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function negrita(texto: string): string {
  return `<b>${escaparHtml(texto)}</b>`
}

export function codigo(texto: string): string {
  return `<code>${escaparHtml(texto)}</code>`
}

/**
 * Telegram corta los mensajes a 4096 caracteres con un 400, así que un
 * /consumo con muchos proyectos hay que partirlo. Se parte por líneas para no
 * dejar una etiqueta HTML abierta a la mitad.
 */
const LARGO_MAXIMO = 4000

export function trocear(texto: string): string[] {
  if (texto.length <= LARGO_MAXIMO) return [texto]

  const trozos: string[] = []

  let actual = ""

  for (const linea of texto.split("\n")) {
    if (actual.length + linea.length + 1 > LARGO_MAXIMO) {
      if (actual) trozos.push(actual)

      actual = linea
    } else {
      actual = actual ? `${actual}\n${linea}` : linea
    }
  }

  if (actual) trozos.push(actual)

  return trozos
}
