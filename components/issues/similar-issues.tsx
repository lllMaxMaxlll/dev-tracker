"use client"

import * as React from "react"
import Link from "next/link"
import { LinkIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EstadoBadge } from "@/components/issues/issue-badges"
import { haceCuanto } from "@/lib/utils/fechas"
import type { Similar } from "@/lib/ai/embeddings"

function Fila({
  similar,
  accion,
}: {
  similar: Similar
  accion?: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="text-xs text-muted-foreground tabular-nums">
        #{similar.number}
      </span>
      <Link
        href={`/problemas/${similar.number}`}
        className="min-w-0 flex-1 truncate font-medium underline-offset-4 hover:underline"
      >
        {similar.title}
      </Link>
      <EstadoBadge estado={similar.status} />
      <Badge variant="outline" className="tabular-nums">
        {Math.round(similar.similitud * 100)}%
      </Badge>
      {accion}
    </li>
  )
}

/**
 * Aviso de posibles duplicados, antes de crear.
 *
 * Nunca bloquea el alta: siempre se puede ignorar y crear igual. Es el mismo
 * criterio que el resto de la capa de IA — propone, no decide.
 */
export function AvisoDuplicados({
  similares,
  onIgnorar,
}: {
  similares: Similar[]
  onIgnorar: () => void
}) {
  if (similares.length === 0) {
    return null
  }

  const masParecido = similares[0]

  return (
    <Alert>
      <AlertTitle>Esto se parece a algo que ya anotaste</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <span>
          {similares.length === 1
            ? "Encontré un problema parecido:"
            : `Encontré ${similares.length} problemas parecidos. El más cercano es el #${masParecido.number}, que ${
                masParecido.status === "descartado"
                  ? "descartaste"
                  : masParecido.status === "resuelto"
                    ? "resolviste"
                    : "sigue abierto"
              } ${haceCuanto(masParecido.updatedAt)}.`}
        </span>

        <ul className="flex w-full flex-col divide-y">
          {similares.map((similar) => (
            <Fila key={similar.id} similar={similar} />
          ))}
        </ul>

        <Button
          variant="outline"
          size="sm"
          onClick={onIgnorar}
          className="w-fit"
        >
          Ignorar y crear igual
        </Button>
      </AlertDescription>
    </Alert>
  )
}

/** Sección "Relacionados" del detalle. */
export function ListaRelacionados({
  similares,
  vinculados,
  onVincular,
}: {
  similares: Similar[]
  vinculados: Set<string>
  onVincular: (similar: Similar) => void
}) {
  if (similares.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No encontré problemas parecidos.
      </p>
    )
  }

  return (
    <ul className="flex flex-col divide-y">
      {similares.map((similar) => (
        <Fila
          key={similar.id}
          similar={similar}
          accion={
            vinculados.has(similar.id) ? (
              <Badge variant="secondary">Vinculado</Badge>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onVincular(similar)}
              >
                <LinkIcon data-icon="inline-start" />
                Vincular
              </Button>
            )
          }
        />
      ))}
    </ul>
  )
}
