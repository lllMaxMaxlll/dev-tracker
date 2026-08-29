import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Necesario para la directiva `use cache` (caché de GitHub y del catálogo de
  // modelos de OpenRouter en fases posteriores).
  cacheComponents: true,
  // Imagen chica para el contenedor de Coolify.
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
}

export default nextConfig
