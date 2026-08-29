/**
 * Error tipado para cuando el token de GitHub deja de servir.
 *
 * La interfaz lo traduce a un banner de "Reconectá tu cuenta de GitHub" en vez
 * de romper la página: el resto de la app (problemas, dashboard) no depende de
 * GitHub y tiene que seguir funcionando.
 */
export class GithubAuthError extends Error {
  readonly code = "GITHUB_AUTH"

  constructor(
    message = "El acceso a GitHub caducó o fue revocado",
    readonly causa:
      "sin_token" | "token_invalido" | "sin_permisos" = "token_invalido"
  ) {
    super(message)
    this.name = "GithubAuthError"
  }
}

export function esErrorDeAuthDeGithub(
  error: unknown
): error is GithubAuthError {
  return error instanceof GithubAuthError
}
