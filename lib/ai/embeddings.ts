import "server-only"

import { env as cloudflareEnv } from "cloudflare:workers"
import { and, eq, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueEmbeddings, issues, projects } from "@/lib/db/schema"
import { getModeloEmbeddings } from "@/lib/ai/settings"
import { registrarUso } from "@/lib/ai/usage"

/**
 * Embeddings con Workers AI (`@cf/baai/bge-m3`, 1024 dimensiones).
 *
 * Se usan para detectar problemas duplicados o relacionados por similitud de
 * coseno, no para generar texto.
 */
const DIMENSIONES_ESPERADAS = 1024

/** Texto que representa al problema. Título y descripción, nada más. */
export function textoDelProblema(titulo: string, descripcion?: string | null) {
  return [titulo, descripcion?.trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000)
}

/**
 * Hash del contenido, para no regenerar el embedding cuando el texto no cambió.
 * Editar sólo la prioridad de un problema no debería costar una llamada.
 */
export async function hashContenido(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto)
  const digest = await crypto.subtle.digest("SHA-256", datos)

  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

export async function generarEmbeddings(
  userId: string,
  textos: string[]
): Promise<number[][]> {
  if (textos.length === 0) {
    return []
  }

  const { modelo } = await getModeloEmbeddings(userId)
  const inicio = Date.now()

  try {
    const ai = cloudflareEnv.AI as unknown as {
      run: (
        m: string,
        i: unknown
      ) => Promise<{ data?: number[][]; usage?: unknown }>
    }

    const respuesta = await ai.run(modelo, { text: textos })
    const vectores = respuesta.data ?? []

    if (vectores.length !== textos.length) {
      throw new Error(
        `El modelo devolvió ${vectores.length} vectores para ${textos.length} textos`
      )
    }

    await registrarUso({
      userId,
      tarea: "embedding",
      modelo,
      consumo: respuesta.usage as never,
      latenciaMs: Date.now() - inicio,
      exito: true,
    })

    return vectores
  } catch (error) {
    await registrarUso({
      userId,
      tarea: "embedding",
      modelo,
      latenciaMs: Date.now() - inicio,
      exito: false,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
}

/**
 * Genera y guarda el embedding de un problema.
 *
 * No lanza si falla: la detección de duplicados es una ayuda, no puede impedir
 * que se guarde un problema. Devuelve si lo logró.
 */
export async function guardarEmbedding(
  userId: string,
  issueId: string,
  titulo: string,
  descripcion?: string | null
): Promise<boolean> {
  try {
    const texto = textoDelProblema(titulo, descripcion)
    const hash = await hashContenido(texto)

    const [existente] = await db
      .select({ hash: issueEmbeddings.contentHash })
      .from(issueEmbeddings)
      .where(eq(issueEmbeddings.issueId, issueId))
      .limit(1)

    if (existente?.hash === hash) {
      return true
    }

    const { modelo, dimensiones } = await getModeloEmbeddings(userId)
    const [vector] = await generarEmbeddings(userId, [texto])

    if (!vector || vector.length !== DIMENSIONES_ESPERADAS) {
      console.error(
        `[guardarEmbedding] dimensión inesperada: ${vector?.length} (se esperaban ${DIMENSIONES_ESPERADAS})`
      )

      return false
    }

    await db
      .insert(issueEmbeddings)
      .values({
        issueId,
        userId,
        embedding: vector,
        embeddingModel: modelo,
        embeddingDimensions: dimensiones,
        contentHash: hash,
      })
      .onConflictDoUpdate({
        target: issueEmbeddings.issueId,
        set: {
          embedding: vector,
          embeddingModel: modelo,
          embeddingDimensions: dimensiones,
          contentHash: hash,
          updatedAt: new Date(),
        },
      })

    return true
  } catch (error) {
    console.error("[guardarEmbedding]", error)

    return false
  }
}

export type Similar = {
  id: string
  number: number
  title: string
  status: string
  type: string
  projectName: string | null
  updatedAt: Date
  /** 0 a 1: 1 es idéntico. */
  similitud: number
}

/**
 * Problemas más parecidos, por similitud de coseno.
 *
 * El operador `<=>` de pgvector devuelve *distancia* de coseno (0 = idéntico),
 * así que la similitud es `1 - distancia`. El índice HNSW de la migración 0000
 * es el que hace que esto no sea un scan completo.
 */
export async function buscarSimilares(params: {
  userId: string
  vector: number[]
  excluirIssueId?: string
  umbral?: number
  limite?: number
}): Promise<Similar[]> {
  const { userId, vector, excluirIssueId, umbral = 0.75, limite = 5 } = params

  const literal = `[${vector.join(",")}]`

  const filas = await db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      status: issues.status,
      type: issues.type,
      projectName: projects.name,
      updatedAt: issues.updatedAt,
      similitud: sql<number>`1 - (${issueEmbeddings.embedding} <=> ${literal}::vector)`,
    })
    .from(issueEmbeddings)
    .innerJoin(issues, eq(issues.id, issueEmbeddings.issueId))
    .leftJoin(projects, eq(projects.id, issues.projectId))
    .where(
      excluirIssueId
        ? and(
            eq(issueEmbeddings.userId, userId),
            ne(issueEmbeddings.issueId, excluirIssueId)
          )
        : eq(issueEmbeddings.userId, userId)
    )
    .orderBy(sql`${issueEmbeddings.embedding} <=> ${literal}::vector`)
    .limit(limite)

  return filas.filter((fila) => fila.similitud >= umbral)
}

/** Problemas sin embedding o con uno de otra dimensión, para regenerar. */
export async function contarEmbeddingsDesactualizados(
  userId: string,
  dimensionActual: number
) {
  const [fila] = await db
    .select({
      sinEmbedding: sql<number>`count(*) filter (where ${issueEmbeddings.issueId} is null)::int`,
      otraDimension: sql<number>`count(*) filter (where ${issueEmbeddings.embeddingDimensions} is not null and ${issueEmbeddings.embeddingDimensions} <> ${dimensionActual})::int`,
    })
    .from(issues)
    .leftJoin(issueEmbeddings, eq(issueEmbeddings.issueId, issues.id))
    .where(eq(issues.userId, userId))

  return fila ?? { sinEmbedding: 0, otraDimension: 0 }
}
