"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { XIcon } from "lucide-react"

import { Logotipo } from "@/components/icons/logo"
import { Button } from "@/components/ui/button"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { NAV_ITEMS, moduloActual } from "@/components/layout/nav-items"

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const actual = moduloActual(pathname)

  // En el celular el menú es un panel encima de la página: elegir una opción
  // tiene que cerrarlo, si no queda tapando lo que acabás de abrir.
  const cerrarEnCelular = () => {
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center">
        <SidebarMenu className="min-w-0 flex-1">
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="Taller"
              render={<Link href="/" onClick={cerrarEnCelular} />}
            >
              {/* `size-8!` con el `!` a propósito: el botón trae una regla
                  `[&_svg]:size-4` que, por ser un selector descendente, le gana
                  en especificidad a un `size-8` suelto y dejaba el logo a la
                  mitad de tamaño. */}
              <Logotipo className="size-8! shrink-0" />

              {/* Escondido al colapsar. shadcn sólo oculta los `span` directos
                  del botón; este texto va envuelto en un `div`, así que sin
                  esta clase sobrevivía y se veía recortado al lado del icono
                  (asomaba la "C" de "Cuaderno"). */}
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-extrabold tracking-tight uppercase [font-stretch:125%]">
                  Taller
                </span>
                <span className="text-xs text-muted-foreground">
                  Órdenes de trabajo
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* En el celular el panel tapa la página: se cierra tocando afuera,
            pero una X arriba es lo que uno busca primero. */}
        {isMobile ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 shrink-0"
            onClick={() => setOpenMobile(false)}
            aria-label="Cerrar el menú"
          >
            <XIcon className="size-5" />
          </Button>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const activo = item.href === actual?.href

                return (
                  <SidebarMenuItem key={item.href}>
                    {isMobile ? (
                      // Celular: ítems altos, con ícono grande y una línea que
                      // dice qué hay adentro. Se tocan con el pulgar, no con
                      // el mouse.
                      <SidebarMenuButton
                        isActive={activo}
                        render={
                          <Link href={item.href} onClick={cerrarEnCelular} />
                        }
                        className="h-auto gap-3 py-3 data-active:shadow-[inset_3px_0_0_var(--primary)] [&_svg]:size-5!"
                      >
                        <item.icon />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-base font-semibold">
                            {item.label}
                          </span>
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {item.descripcion}
                          </span>
                        </div>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        isActive={activo}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}
