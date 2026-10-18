"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const PESTANAS = [
  { href: "/planta", label: "Consumo" },
  { href: "/planta/repos", label: "Repositorios" },
  { href: "/planta/proyectos", label: "Proyectos" },
  { href: "/planta/ajustes", label: "Ajustes" },
]

/**
 * Pestañas de Planta. Son links: cada una es una ruta con su propia URL.
 *
 * En el celular van en una grilla de 2×2 y no en una fila con scroll
 * horizontal: con scroll, "Ajustes" quedaba cortada y no había forma de saber
 * que había más pestañas sin deslizar por casualidad.
 */
export function PlantaTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Secciones de Planta"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border md:flex md:gap-1 md:overflow-visible md:rounded-none md:border-0 md:border-b md:bg-transparent"
    >
      {PESTANAS.map((pestana) => {
        // Consumo es la raíz: con startsWith quedaría activa en todas.
        const activa =
          pestana.href === "/planta"
            ? pathname === "/planta"
            : pathname.startsWith(pestana.href)

        return (
          <Link
            key={pestana.href}
            href={pestana.href}
            aria-current={activa ? "page" : undefined}
            className={cn(
              "px-3 text-xs font-bold tracking-wide whitespace-nowrap uppercase transition-colors [font-stretch:125%]",
              // Celular: celdas altas para el pulgar, la activa en naranja.
              "flex h-11 items-center justify-center bg-card",
              activa
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground active:bg-muted",
              // Escritorio: pestañas subrayadas, como antes.
              "md:-mb-px md:h-auto md:border-b-2 md:bg-transparent md:py-2",
              activa
                ? "md:border-primary md:bg-transparent md:text-foreground"
                : "md:border-transparent md:hover:text-foreground"
            )}
          >
            {pestana.label}
          </Link>
        )
      })}
    </nav>
  )
}
