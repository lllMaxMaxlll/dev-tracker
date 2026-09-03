"use client"

import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon, TriangleAlertIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { ModeloCatalogo } from "@/lib/ai/models"

function precio(valor: number | null) {
  if (valor === null) return "—"

  // Los precios van de $0,017 a $4 por millón: hacen falta decimales finos.
  return `$${valor < 0.1 ? valor.toFixed(4) : valor.toFixed(2)}`
}

function contexto(valor: number | null) {
  if (!valor) return "—"
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`

  return `${Math.round(valor / 1000)}k`
}

export function ModelPicker({
  modelos,
  valor,
  onChange,
  soloConTools,
  /** Etiqueta de la opción vacía: sólo para los selectores por tarea. */
  opcionHeredar,
  id,
}: {
  modelos: ModeloCatalogo[]
  valor: string
  onChange: (id: string) => void
  soloConTools: boolean
  opcionHeredar?: string
  id?: string
}) {
  const [abierto, setAbierto] = React.useState(false)

  const visibles = React.useMemo(
    () => (soloConTools ? modelos.filter((m) => m.soportaTools) : modelos),
    [modelos, soloConTools]
  )

  const elegido = modelos.find((m) => m.id === valor)

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className="w-full justify-between font-normal"
          />
        }
      >
        <span className="truncate">
          {elegido ? elegido.id : (opcionHeredar ?? "Elegí un modelo")}
        </span>
        <ChevronsUpDownIcon className="ml-2 shrink-0 opacity-50" />
      </PopoverTrigger>

      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por nombre o proveedor…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Ningún modelo coincide.</CommandEmpty>

            <CommandGroup>
              {opcionHeredar ? (
                <CommandItem
                  value="heredar del modelo por defecto"
                  onSelect={() => {
                    onChange("")
                    setAbierto(false)
                  }}
                >
                  <CheckIcon
                    className={cn(valor ? "opacity-0" : "opacity-100")}
                  />
                  {opcionHeredar}
                </CommandItem>
              ) : null}

              {visibles.map((modelo) => (
                <CommandItem
                  key={modelo.id}
                  value={`${modelo.id} ${modelo.proveedor}`}
                  onSelect={() => {
                    onChange(modelo.id)
                    setAbierto(false)
                  }}
                >
                  <CheckIcon
                    className={cn(
                      valor === modelo.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {modelo.nombre}
                      </span>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {modelo.proveedor}
                      </Badge>
                      {!modelo.soportaTools ? (
                        <TriangleAlertIcon
                          className="size-3 shrink-0 text-amber-500"
                          aria-label="Sin tool calling"
                        />
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {contexto(modelo.contexto)} de contexto ·{" "}
                      {precio(modelo.precioEntradaUsd)} entrada /{" "}
                      {precio(modelo.precioSalidaUsd)} salida por M tokens
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** Aviso de que el modelo elegido no sirve para salidas estructuradas. */
export function AvisoSinTools({
  modelo,
}: {
  modelo: ModeloCatalogo | undefined
}) {
  if (!modelo || modelo.soportaTools) {
    return null
  }

  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
      <TriangleAlertIcon className="mt-0.5 size-3 shrink-0" />
      <span>
        {modelo.nombre} no soporta tool calling. La captura en lenguaje natural
        y la vinculación de commits van a fallar con este modelo.
      </span>
    </p>
  )
}
