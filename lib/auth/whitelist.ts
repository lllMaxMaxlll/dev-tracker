import "server-only"

import { env } from "@/lib/env"

/**
 * Lista blanca opcional para que la instancia desplegada sea de uso
 * restringido. Si ALLOWED_EMAILS y ALLOWED_GITHUB_LOGINS están vacías, la
 * instancia es abierta (cómodo en desarrollo).
 */
export function isAllowed(params: {
  email?: string | null
  githubLogin?: string | null
}): boolean {
  const { ALLOWED_EMAILS, ALLOWED_GITHUB_LOGINS } = env()

  if (ALLOWED_EMAILS.length === 0 && ALLOWED_GITHUB_LOGINS.length === 0) {
    return true
  }

  const email = params.email?.toLowerCase()
  const login = params.githubLogin?.toLowerCase()

  return (
    (!!email && ALLOWED_EMAILS.includes(email)) ||
    (!!login && ALLOWED_GITHUB_LOGINS.includes(login))
  )
}
