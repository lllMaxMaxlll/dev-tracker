import { getUser } from "@/lib/auth/require-user"
import { UserMenu } from "@/components/layout/user-menu"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Aislado en su propio componente async para que el resto del shell se pueda
 * prerenderizar: leer la sesión implica leer cookies, y eso vuelve dinámico
 * todo lo que esté por encima.
 */
export async function UserMenuSlot() {
  const user = await getUser()

  if (!user) {
    return null
  }

  return <UserMenu user={user} />
}

export function UserMenuFallback() {
  return <Skeleton className="size-8 rounded-full" />
}
