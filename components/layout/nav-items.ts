import {
  FileTextIcon,
  GaugeIcon,
  InboxIcon,
  ListIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** Atajo de la paleta: G seguida de esta letra. */
  tecla: string
  /** Una línea bajo el nombre, en el menú del celular. */
  descripcion: string
}

/**
 * Los cinco módulos de Taller. Proyectos, GitHub, Consumo y Ajustes viven
 * adentro de Planta: se miran poco y no merecen un lugar propio acá.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/",
    label: "Banco",
    icon: WarehouseIcon,
    tecla: "b",
    descripcion: "Lo que tenés entre manos",
  },
  {
    href: "/bandeja",
    label: "Bandeja",
    icon: InboxIcon,
    tecla: "i",
    descripcion: "Lo que espera tu revisión",
  },
  {
    href: "/ordenes",
    label: "Órdenes",
    icon: ListIcon,
    tecla: "o",
    descripcion: "Todas las órdenes de trabajo",
  },
  {
    href: "/planta",
    label: "Planta",
    icon: GaugeIcon,
    tecla: "p",
    descripcion: "Consumo, repos, proyectos y ajustes",
  },
  {
    href: "/informes",
    label: "Informes",
    icon: FileTextIcon,
    tecla: "r",
    descripcion: "Gráficos y resúmenes semanales",
  },
]

/** El módulo al que pertenece una ruta: "/ordenes/12" es de Órdenes. */
export function moduloActual(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((item) =>
    item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
  )
}
