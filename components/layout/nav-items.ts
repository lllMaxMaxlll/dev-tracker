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
}

/**
 * Los cinco módulos de Taller. Proyectos, GitHub, Consumo y Ajustes viven
 * adentro de Planta: se miran poco y no merecen un lugar propio acá.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Banco", icon: WarehouseIcon, tecla: "b" },
  { href: "/bandeja", label: "Bandeja", icon: InboxIcon, tecla: "i" },
  { href: "/ordenes", label: "Órdenes", icon: ListIcon, tecla: "o" },
  { href: "/planta", label: "Planta", icon: GaugeIcon, tecla: "p" },
  { href: "/informes", label: "Informes", icon: FileTextIcon, tecla: "r" },
]
