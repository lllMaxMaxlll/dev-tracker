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
  // Dos líneas y no una: en una columna angosta, número, título, estado,
  // porcentaje y botón en la misma fila se partían en cualquier lugar.
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/ordenes/${similar.number}`}
          className="truncate font-medium underline-offset-4 hover:underline"
        >
          <span className="font-mono text-xs text-muted-foreground">
            #{similar.number}
          </span>{" "}
          {similar.title}
        </Link>
        <span className="flex items-center gap-2 text-muted-foreground">
          <EstadoBadge estado={similar.status} />
          <span className="font-mono text-xs">
            {Math.round(similar.similitud * 100)} % parecida
          </span>
        </span>
      </div>
      {accion ? <div className="shrink-0">{accion}</div> : null}
    </li>
  )
}

/**
 * Aviso de posibles duplicados.
 *
 * Nunca bloquea el alta: el botón de crear queda habilitado igual. Es el mismo
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
          Ignorar aviso
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
        No encontré órdenes parecidas.
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
