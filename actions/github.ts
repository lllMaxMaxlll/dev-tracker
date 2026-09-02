"use server"

import { conDb } from "@/lib/db"
import { requireUser } from "@/lib/auth/require-user"
import { listarRepos, type RepoResumen } from "@/lib/github/queries"
import { cargarSeguro } from "@/lib/github/cargar-seguro"

/**
 * Repos del usuario para el selector del formulario de proyectos.
 * Devuelve lista vacía en vez de romper si GitHub no está conectado: el
 * formulario tiene que seguir funcionando aunque el token haya caducado.
 */
export async function listarReposParaSelector(): Promise<{
  repos: RepoResumen[]
  error: string | null
}> {
  const user = await requireUser()

  // `listarRepos` llega a la base por dos lados: el token de GitHub y el caché
  // de respuestas. Sin `conDb`, cada uno abriría su propia conexión.
  return conDb(async () => {
    const resultado = await cargarSeguro(() => listarRepos(user.id))

    if (!resultado.ok) {
      return { repos: [], error: resultado.mensaje }
    }

    return { repos: resultado.datos.datos, error: null }
  })
}
