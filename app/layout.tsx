import type { Metadata, Viewport } from "next"
import { Archivo, JetBrains_Mono } from "next/font/google"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

// Archivo para todo, con el eje de ancho cargado: los títulos usan la versión
// expandida (font-stretch 125 %) y el texto corrido la normal.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-sans",
})

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://devtracker.maxherr.com"

/**
 * Metadatos.
 *
 * Ojo con la palabra "SEO": esta app está **entera detrás del login**, así que
 * no hay nada que posicionar. Por eso va `robots: noindex, nofollow`: que
 * aparezca en buscadores no aporta y expone la existencia de la instancia.
 *
 * Lo que sí importa acá es lo otro que suele venir en el mismo paquete:
 * el título de la pestaña, el favicon, el color del navegador y el manifiesto,
 * que es lo que hace que "agregar a pantalla de inicio" funcione bien en el
 * celular — justo el caso de uso de anotar un problema en el momento.
 */
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Taller",
    template: "%s",
  },
  description:
    "Dashboard personal para registrar y seguir problemas, bugs e ideas de desarrollo, con integración a GitHub.",
  applicationName: "Taller",
  manifest: "/manifest.webmanifest",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  appleWebApp: {
    capable: true,
    title: "Taller",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  // Acompaña el tema: la barra del navegador en el celular deja de cortar
  // contra el fondo de la app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eeece6" },
    { media: "(prefers-color-scheme: dark)", color: "#121211" },
  ],
  colorScheme: "dark light",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        "font-sans",
        archivo.variable,
        fontMono.variable
      )}
    >
      <body>
        <ThemeProvider>
          <TooltipProvider>
            <Toaster>{children}</Toaster>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
