import {
  BarChart3Icon,
  FolderKanbanIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react"

import { GithubIcon } from "@/components/icons/github"

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon | typeof GithubIcon
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon },
  { href: "/problemas", label: "Problemas", icon: ListTodoIcon },
  { href: "/proyectos", label: "Proyectos", icon: FolderKanbanIcon },
  { href: "/github", label: "GitHub", icon: GithubIcon },
  { href: "/resumenes", label: "Resúmenes", icon: BarChart3Icon },
  { href: "/ajustes", label: "Ajustes", icon: SettingsIcon },
]
