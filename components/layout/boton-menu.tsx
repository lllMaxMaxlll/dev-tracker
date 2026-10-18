"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MenuIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Logotipo } from "@/components/icons/logo"
import { moduloActual } from "@/components/layout/nav-items"

/**
 * Lado izquierdo del header.
 *
 * En escritorio, el botón de siempre para colapsar el sidebar. En el celular
 * el sidebar no está a la vista, así que el header hace de barra de la app:
 * hamburguesa para abrir el menú, el logo y en qué módulo estás.
 */
export function BotonMenu() {
  const { setOpenMobile } = useSidebar()
  const pathname = usePathname()
  const modulo = moduloActual(pathname)

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
      </div>

      <div className="flex min-w-0 items-center gap-2 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-1 size-10"
          onClick={() => setOpenMobile(true)}
          aria-label="Abrir el menú"
        >
          <MenuIcon className="size-6" />
        </Button>
        <Link href="/" aria-label="Ir al Banco" className="shrink-0">
          <Logotipo className="size-7" />
        </Link>
        {modulo ? (
          <span className="truncate text-sm font-extrabold tracking-tight uppercase [font-stretch:125%]">
            {modulo.label}
          </span>
        ) : null}
      </div>
    </>
  )
}
