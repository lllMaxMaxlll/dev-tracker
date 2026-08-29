import "server-only"

import { conCache } from "@/lib/github/cache"
import { conGithub } from "@/lib/github/client"

/**
 * Cada función devuelve datos ya normalizados, no la respuesta cruda de la API.
 * Es lo que permite cachear payloads chicos y que la interfaz no dependa de la
 * forma exacta que devuelve Octokit.
 */

export type RepoResumen = {
  id: number
  fullName: string
  name: string
  owner: string
  description: string | null
  language: string | null
  stars: number
  isPrivate: boolean
  isFork: boolean
  updatedAt: string
  htmlUrl: string
  defaultBranch: string
}

export async function listarRepos(userId: string) {
  return conCache(userId, "repos", 15 * 60 * 1000, async () =>
    conGithub(userId, async (octokit) => {
      // `affiliation` incluye los repos donde sos colaborador, no sólo los
      // propios. 100 es el máximo por página; con una alcanza de sobra para un
      // uso personal y evita paginar.
      const { data } = await octokit.rest.repos.listForAuthenticatedUser({
        sort: "updated",
        per_page: 100,
        affiliation: "owner,collaborator,organization_member",
      })

      return data.map<RepoResumen>((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        name: repo.name,
        owner: repo.owner.login,
        description: repo.description,
        language: repo.language ?? null,
        stars: repo.stargazers_count ?? 0,
        isPrivate: repo.private,
        isFork: repo.fork,
        updatedAt: repo.updated_at ?? repo.pushed_at ?? "",
        htmlUrl: repo.html_url,
        defaultBranch: repo.default_branch ?? "main",
      }))
    })
  )
}

export type CommitResumen = {
  sha: string
  mensaje: string
  autor: string | null
  autorAvatar: string | null
  fecha: string
  url: string
}

export async function listarCommits(
  userId: string,
  owner: string,
  repo: string,
  limite = 20
) {
  return conCache(userId, `commits:${owner}/${repo}`, undefined, async () =>
    conGithub(userId, async (octokit) => {
      const { data } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        per_page: limite,
      })

      return data.map<CommitResumen>((commit) => ({
        sha: commit.sha,
        // Sólo la primera línea: el cuerpo del mensaje no entra en una lista.
        mensaje: commit.commit.message.split("\n")[0],
        autor: commit.author?.login ?? commit.commit.author?.name ?? null,
        autorAvatar: commit.author?.avatar_url ?? null,
        fecha: commit.commit.author?.date ?? "",
        url: commit.html_url,
      }))
    })
  )
}

export type DiaHeatmap = { fecha: string; total: number }

/**
 * Actividad diaria del último año para el heatmap.
 *
 * Usa el endpoint de estadísticas de commits por semana, que devuelve 52
 * semanas en una sola llamada. La alternativa (paginar todos los commits del
 * año) serían decenas de requests.
 *
 * GitHub calcula estas estadísticas de forma diferida: la primera vez que se
 * piden puede devolver 202 y un cuerpo vacío. En ese caso devolvemos vacío y la
 * interfaz avisa que GitHub las está preparando.
 */
export async function getActividad(
  userId: string,
  owner: string,
  repo: string
) {
  return conCache(
    userId,
    `actividad:${owner}/${repo}`,
    undefined,
    async () =>
      conGithub(userId, async (octokit) => {
        const respuesta = await octokit.rest.repos.getCommitActivityStats({
          owner,
          repo,
        })

        if (respuesta.status === 202 || !Array.isArray(respuesta.data)) {
          return { calculando: true, dias: [] as DiaHeatmap[] }
        }

        const dias: DiaHeatmap[] = []

        for (const semana of respuesta.data) {
          for (const [indice, total] of semana.days.entries()) {
            const fecha = new Date((semana.week + indice * 86_400) * 1000)

            dias.push({ fecha: fecha.toISOString().slice(0, 10), total })
          }
        }

        return { calculando: false, dias }
      }),
    // Un 202 significa "todavía la estoy calculando": no se cachea, así la
    // próxima visita vuelve a preguntar en vez de esperar todo el TTL.
    { cachearSi: (resultado) => !resultado.calculando }
  )
}

export type PullResumen = {
  numero: number
  titulo: string
  estado: "abierto" | "cerrado" | "fusionado"
  autor: string | null
  creadoEn: string
  url: string
  rama: string
}

export async function listarPulls(
  userId: string,
  owner: string,
  repo: string,
  limite = 20
) {
  return conCache(userId, `pulls:${owner}/${repo}`, undefined, async () =>
    conGithub(userId, async (octokit) => {
      const { data } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: limite,
      })

      return data.map<PullResumen>((pr) => ({
        numero: pr.number,
        titulo: pr.title,
        estado: pr.merged_at
          ? "fusionado"
          : pr.state === "open"
            ? "abierto"
            : "cerrado",
        autor: pr.user?.login ?? null,
        creadoEn: pr.created_at,
        url: pr.html_url,
        rama: pr.head.ref,
      }))
    })
  )
}

export type IssueResumen = {
  numero: number
  titulo: string
  estado: "abierto" | "cerrado"
  autor: string | null
  creadoEn: string
  url: string
  etiquetas: string[]
}

export async function listarIssuesDelRepo(
  userId: string,
  owner: string,
  repo: string,
  limite = 20
) {
  return conCache(userId, `issues:${owner}/${repo}`, undefined, async () =>
    conGithub(userId, async (octokit) => {
      const { data } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: limite,
      })

      return (
        data
          // La API de issues devuelve también los PRs; los sacamos porque ya
          // tienen su propia sección.
          .filter((issue) => !issue.pull_request)
          .map<IssueResumen>((issue) => ({
            numero: issue.number,
            titulo: issue.title,
            estado: issue.state === "open" ? "abierto" : "cerrado",
            autor: issue.user?.login ?? null,
            creadoEn: issue.created_at,
            url: issue.html_url,
            etiquetas: issue.labels.map((etiqueta) =>
              typeof etiqueta === "string" ? etiqueta : (etiqueta.name ?? "")
            ),
          }))
      )
    })
  )
}

export type RamaResumen = {
  nombre: string
  sha: string
  protegida: boolean
  esPorDefecto: boolean
}

export async function listarRamas(
  userId: string,
  owner: string,
  repo: string,
  ramaPorDefecto: string
) {
  return conCache(userId, `ramas:${owner}/${repo}`, undefined, async () =>
    conGithub(userId, async (octokit) => {
      const { data } = await octokit.rest.repos.listBranches({
        owner,
        repo,
        per_page: 50,
      })

      return data
        .map<RamaResumen>((rama) => ({
          nombre: rama.name,
          sha: rama.commit.sha,
          protegida: rama.protected,
          esPorDefecto: rama.name === ramaPorDefecto,
        }))
        .sort((a, b) => Number(b.esPorDefecto) - Number(a.esPorDefecto))
    })
  )
}

export async function getRepo(userId: string, owner: string, repo: string) {
  return conCache(userId, `repo:${owner}/${repo}`, undefined, async () =>
    conGithub(userId, async (octokit) => {
      const { data } = await octokit.rest.repos.get({ owner, repo })

      return {
        id: data.id,
        fullName: data.full_name,
        description: data.description,
        language: data.language ?? null,
        stars: data.stargazers_count,
        isPrivate: data.private,
        htmlUrl: data.html_url,
        defaultBranch: data.default_branch,
        openIssues: data.open_issues_count,
      }
    })
  )
}
