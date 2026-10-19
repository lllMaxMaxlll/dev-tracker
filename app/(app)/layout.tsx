import { Suspense } from "react"

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { BotonMenu } from "@/components/layout/boton-menu"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { AvisoSinConexion } from "@/components/pwa/aviso-sin-conexion"
import {
  UserMenuFallback,
  UserMenuSlot,
} from "@/components/layout/user-menu-slot"
import {
  QuickCaptureFallback,
  QuickCaptureSlot,
} from "@/components/capture/quick-capture-slot"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />

      {/* `min-w-0` es lo que permite que los hijos con overflow-x (el kanban,
          la tabla de problemas) scrolleen adentro en vez de estirar la página.
          Sin esto, un elemento flex no baja de su ancho de contenido y el
          desborde se propaga hasta el body. */}
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <BotonMenu />

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<UserMenuFallback />}>
              <UserMenuSlot />
            </Suspense>
          </div>
        </header>

        <AvisoSinConexion />

        <div className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          {children}
        </div>

        {/* Al pie: la línea de comandos es sticky y tiene que quedar última
            dentro del inset. El botón flotante y los diálogos van por portal. */}
        <Suspense fallback={<QuickCaptureFallback />}>
          <QuickCaptureSlot />
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  )
}
