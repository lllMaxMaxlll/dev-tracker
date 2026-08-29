import type { NextConfig } from "next"

/**
 * vinext lee este archivo para la configuración compartida (imágenes, etc.),
 * pero el build lo hace Vite, no `next build`.
 *
 * `cacheComponents` quedó DESACTIVADO a propósito: vinext lo marca como
 * soporte experimental con comportamiento incompleto. El caché de las
 * respuestas de GitHub (Fase 4) va con `revalidate` de ISR más el adaptador
 * de KV de Cloudflare, que sí está soportado por completo.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
}

export default nextConfig
