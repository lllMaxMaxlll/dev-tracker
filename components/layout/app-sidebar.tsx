"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Logotipo } from "@/components/icons/logo"

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
} from "@/components/ui/sidebar"
import { NAV_ITEMS } from "@/components/layout/nav-items"

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="DevTracker"
              render={<Link href="/" />}
            >
              {/* `size-8!` con el `!` a propósito: el botón trae una regla
                  `[&_svg]:size-4` que, por ser un selector descendente, le gana
                  en especificidad a un `size-8` suelto y dejaba el logo a la
                  mitad de tamaño. */}
              <Logotipo className="size-8! shrink-0 rounded-lg" />

              {/* Escondido al colapsar. shadcn sólo oculta los `span` directos
                  del botón; este texto va envuelto en un `div`, así que sin
                  esta clase sobrevivía y se veía recortado al lado del icono
                  (asomaba la "C" de "Cuaderno"). */}
              <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                <span className="font-semibold">DevTracker</span>
                <span className="text-xs text-muted-foreground">
                  Cuaderno de desarrollo
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const activo =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={activo}
                      tooltip={item.label}
                      render={<Link href={item.href} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
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
