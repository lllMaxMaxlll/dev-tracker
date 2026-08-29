"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export type OpcionSelect = { label: string; value: string | null }

/**
 * Envoltorio del Select de Base UI para los casos de "elegir un valor de una
 * lista corta", que es casi todo en esta app. Base UI necesita el prop `items`
 * en la raíz para poder mostrar la etiqueta del valor elegido en el trigger.
 */
export function EnumSelect({
  value,
  onValueChange,
  opciones,
  placeholder,
  name,
  id,
  className,
  ariaInvalid,
}: {
  value: string | null
  onValueChange: (valor: string | null) => void
  opciones: OpcionSelect[]
  placeholder: string
  name?: string
  id?: string
  className?: string
  ariaInvalid?: boolean
}) {
  const items: OpcionSelect[] = [
    { label: placeholder, value: null },
    ...opciones,
  ]

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(nuevo) => onValueChange(nuevo as string | null)}
      name={name}
    >
      <SelectTrigger id={id} className={className} aria-invalid={ariaInvalid}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((opcion) => (
            <SelectItem key={opcion.value ?? "__vacio__"} value={opcion.value}>
              {opcion.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
