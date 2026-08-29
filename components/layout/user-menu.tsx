"use client"

import { LogOutIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SessionUser } from "@/lib/auth/require-user"

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .map((parte) => parte[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function UserMenu({ user }: { user: SessionUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Menú de usuario" />
        }
      >
        <Avatar className="size-8">
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} alt={user.displayName} />
          ) : null}
          <AvatarFallback>{iniciales(user.displayName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* La etiqueta va dentro de un grupo a la fuerza: Base UI lanza
            "MenuGroupContext is missing" si Menu.GroupLabel no tiene un
            Menu.Group como padre, y eso rompe toda la página al abrir el
            menú. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="flex flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {user.displayName}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {user.githubLogin ? `@${user.githubLogin}` : user.email}
              </span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/ajustes" />}>
            <SettingsIcon />
            Ajustes
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/* Form POST: cerrar sesión cambia estado del servidor, no puede ser
              un GET que un prefetch dispare sin querer. */}
          <form action="/auth/signout" method="post">
            <DropdownMenuItem
              render={<button type="submit" className="w-full" />}
              variant="destructive"
            >
              <LogOutIcon />
              Cerrar sesión
            </DropdownMenuItem>
          </form>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
