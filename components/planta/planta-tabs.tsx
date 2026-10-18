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

/** Pestañas de Planta. Son links: cada una es una ruta con su propia URL. */
export function PlantaTabs() {
  const pathname = usePathname()

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b">
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
              "border-b-2 px-3 py-2 text-xs font-bold tracking-wide whitespace-nowrap uppercase transition-colors [font-stretch:125%]",
              activa
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {pestana.label}
          </Link>
        )
      })}
    </nav>
  )
}
