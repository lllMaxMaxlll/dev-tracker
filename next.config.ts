import type { NextConfig } from "next"

/**
 * Configuración de Next. El build es el estándar (`next build`): hasta la
 * migración a Vercel lo hacía Vite a través de vinext, para poder correr en
 * Cloudflare Workers.
 *
 * El caché de las respuestas de GitHub va con `revalidate` de ISR, que en
 * Vercel funciona de fábrica y ya no necesita el adaptador de KV.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
}

export default nextConfig
