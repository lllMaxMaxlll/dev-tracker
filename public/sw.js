/**
 * Service worker de Taller.
 *
 * Las páginas se renderizan en el servidor con datos de Supabase, así que
 * "offline" acá no significa trabajar sin conexión: significa poder abrir la
 * app y ver la última copia de lo que ya miraste. Las escrituras (server
 * actions, POST) no pasan por el caché nunca.
 *
 * - Assets del build e íconos: caché primero. Llevan hash en el nombre, una
 *   copia vieja nunca es incorrecta.
 * - Navegaciones: red primero. Si responde, se guarda la página; si no hay
 *   red, se sirve la copia guardada o, si no hay, /offline.html.
 * - Cerrar sesión (o que venza) vacía las páginas guardadas: son HTML con
 *   datos de la cuenta y no tienen que sobrevivir a la sesión.
 *
 * Al cambiar la lógica de este archivo, subir VERSION: los cachés viejos se
 * borran al activarse el nuevo.
 */

const VERSION = "v1"
const CACHE_ESTATICOS = `taller-estaticos-${VERSION}`
const CACHE_PAGINAS = `taller-paginas-${VERSION}`
const PAGINA_OFFLINE = "/offline.html"

// Topes para que el caché no crezca sin fin: cada deploy trae assets con
// hashes nuevos y los viejos quedan huérfanos.
const MAX_ESTATICOS = 300
const MAX_PAGINAS = 40

// Ni la sesión ni las APIs se cachean nunca.
const SIN_CACHE = ["/api/", "/auth/", "/login"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_ESTATICOS)
      .then((cache) =>
        cache.addAll([PAGINA_OFFLINE, "/icon.svg", "/icons/icon-192.png"])
      )
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter(
              (nombre) =>
                nombre.startsWith("taller-") &&
                nombre !== CACHE_ESTATICOS &&
                nombre !== CACHE_PAGINAS
            )
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener("fetch", (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return
  }

  if (SIN_CACHE.some((ruta) => url.pathname.startsWith(ruta))) {
    // Llegar al login es la señal de que no hay sesión: las páginas
    // guardadas son de la cuenta y se van con ella.
    if (request.mode === "navigate" && url.pathname === "/login") {
      event.waitUntil(caches.delete(CACHE_PAGINAS))
    }
    return
  }

  if (esEstatico(url)) {
    event.respondWith(cachePrimero(request))
    return
  }

  if (request.mode === "navigate") {
    event.respondWith(redPrimero(event, request))
  }

  // El resto (payloads RSC, prefetch, imágenes de /_next/image) va directo a
  // la red. Si una navegación del cliente falla sin conexión, Next cae a una
  // navegación completa, y esa sí pasa por redPrimero.
})

function esEstatico(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/icon.svg" ||
    url.pathname === "/apple-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  )
}

async function cachePrimero(request) {
  const guardada = await caches.match(request)
  if (guardada) {
    return guardada
  }

  const respuesta = await fetch(request)
  if (respuesta.ok) {
    const cache = await caches.open(CACHE_ESTATICOS)
    await cache.put(request, respuesta.clone())
    recortar(CACHE_ESTATICOS, MAX_ESTATICOS)
  }
  return respuesta
}

async function redPrimero(event, request) {
  try {
    const respuesta = await fetch(request)

    // Si el proxy nos mandó al login, la sesión venció.
    if (new URL(respuesta.url).pathname === "/login") {
      event.waitUntil(caches.delete(CACHE_PAGINAS))
      return respuesta
    }

    if (respuesta.ok && !respuesta.redirected) {
      const copia = respuesta.clone()
      event.waitUntil(
        caches
          .open(CACHE_PAGINAS)
          .then((cache) => cache.put(request.url, copia))
          .then(() => recortar(CACHE_PAGINAS, MAX_PAGINAS))
      )
    }
    return respuesta
  } catch {
    const guardada = await caches.match(request.url, {
      cacheName: CACHE_PAGINAS,
    })
    return guardada ?? (await caches.match(PAGINA_OFFLINE))
  }
}

// Borra las entradas más viejas. cache.keys() devuelve en orden de inserción.
async function recortar(nombre, maximo) {
  const cache = await caches.open(nombre)
  const claves = await cache.keys()
  const sobrantes = claves.length - maximo
  for (let i = 0; i < sobrantes; i++) {
    if (claves[i].url.endsWith(PAGINA_OFFLINE)) continue
    await cache.delete(claves[i])
  }
}
