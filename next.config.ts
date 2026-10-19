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
  // La reorganización de Taller movió casi todas las rutas. Las viejas
  // redirigen para que no se rompan los links guardados ni los marcadores.
  // Temporales (307): si algún día se reusa un nombre, no queda cacheado.
  async redirects() {
    return [
      { source: "/problemas", destination: "/ordenes", permanent: false },
      {
        source: "/problemas/:number",
        destination: "/ordenes/:number",
        permanent: false,
      },
      { source: "/consumo", destination: "/planta", permanent: false },
      { source: "/github", destination: "/planta/repos", permanent: false },
      {
        source: "/github/:owner/:repo",
        destination: "/planta/repos/:owner/:repo",
        permanent: false,
      },
      {
        source: "/proyectos",
        destination: "/planta/proyectos",
        permanent: false,
      },
      { source: "/ajustes", destination: "/planta/ajustes", permanent: false },
      { source: "/resumenes", destination: "/informes", permanent: false },
    ]
  },
  // El service worker nunca va al caché HTTP: si quedara una copia vieja, el
  // navegador no se enteraría de los deploys nuevos.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
    ]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
}

export default nextConfig
