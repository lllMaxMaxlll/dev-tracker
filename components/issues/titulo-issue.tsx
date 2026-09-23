"use client"

import Link from "next/link"

import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

/** Lo que trae la consulta de lista: 281 caracteres, uno más que el corte. */
const LARGO_VISIBLE = 280

/**
 * Título del problema con la descripción en un tooltip.
 *
 * Es para decidir sin abrir: en una lista de cien, casi siempre alcanza con las
 * primeras líneas para saber si es el que buscabas. Si no hay descripción no
 * aparece nada: un tooltip vacío es peor que ninguno.
 */
export function TituloIssue({
  numero,
  titulo,
  excerpt,
  className,
  onPointerDown,
}: {
  numero: number
  titulo: string
  excerpt: string | null
  className?: string
  onPointerDown?: (event: React.PointerEvent) => void
}) {
  const texto = excerpt?.trim()

  const enlace = (
    <Link
      href={`/problemas/${numero}`}
      className={cn("underline-offset-4 hover:underline", className)}
      onPointerDown={onPointerDown}
    >
      {titulo}
    </Link>
  )

  if (!texto) return enlace

  const recortado = texto.length > LARGO_VISIBLE

  return (
    <TooltipProvider delay={400}>
      <Tooltip>
        <TooltipTrigger render={enlace} />
        <TooltipContent
          side="bottom"
          align="start"
          className="block max-w-sm text-left whitespace-pre-line"
        >
          {recortado ? `${texto.slice(0, LARGO_VISIBLE).trimEnd()}…` : texto}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
