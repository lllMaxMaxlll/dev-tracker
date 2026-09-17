"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import {
  alternarRegla,
  cambiarUmbral,
  silenciarTodo,
  sincronizarAhora,
} from "@/actions/monitor"
import { definicionDe, formatearValor } from "@/lib/monitor/metrics"
import type { ReglaConEstado } from "@/lib/db/queries/consumo"

/**
 * Umbrales y acciones del monitor.
 *
 * El botón de sincronizar no es un lujo: sin él, cada cambio en un colector se
 * prueba esperando a que corra el cron.
 */
export function ReglasPanel({ reglas }: { reglas: ReglaConEstado[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = React.useState(false)

  const silenciadas = reglas.some((regla) => regla.silenciada)

  async function sincronizar() {
    setOcupado(true)

    const resultado = await sincronizarAhora()

    setOcupado(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    // Los fallos parciales se avisan pero no se presentan como un fracaso: que
    // una fuente esté caída no invalida lo que trajeron las otras.
    toast.add({
      title: `${resultado.data.filas} mediciones actualizadas`,
      description: resultado.data.fallos.join(" · ") || undefined,
      type: resultado.data.fallos.length ? "warning" : "success",
    })

    router.refresh()
  }

  async function silenciar(horas: number | null) {
    setOcupado(true)

    const resultado = await silenciarTodo(horas)

    setOcupado(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: horas === null ? "Alertas reactivadas" : `Calladas ${horas} h`,
      type: "success",
    })

    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={sincronizar} disabled={ocupado}>
          {ocupado ? <Spinner /> : null}
          Sincronizar ahora
        </Button>

        {silenciadas ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => silenciar(null)}
            disabled={ocupado}
          >
            Reactivar alertas
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => silenciar(24)}
            disabled={ocupado}
          >
            Silenciar 24 h
          </Button>
        )}
      </div>

      <div className="flex flex-col divide-y">
        {reglas.map((regla) => (
          <ReglaFila key={regla.id} regla={regla} />
        ))}
      </div>
    </div>
  )
}

function ReglaFila({ regla }: { regla: ReglaConEstado }) {
  const router = useRouter()
  const definicion = definicionDe(regla.metrica)

  const [umbral, setUmbral] = React.useState(String(regla.umbral))
  const [guardando, setGuardando] = React.useState(false)

  const silenciada = regla.silenciada

  async function guardar() {
    if (Number(umbral) === regla.umbral) return

    setGuardando(true)

    const resultado = await cambiarUmbral(regla.id, Number(umbral))

    setGuardando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })
      setUmbral(String(regla.umbral))

      return
    }

    router.refresh()
  }

  async function alternar(activa: boolean) {
    const resultado = await alternarRegla(regla.id, activa)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-3">
      <Switch
        checked={regla.activa}
        onCheckedChange={alternar}
        aria-label={`Activar ${regla.etiqueta}`}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{regla.etiqueta}</span>
        <span className="text-xs text-muted-foreground">
          {regla.tipoUmbral === "porcentaje_cuota"
            ? "% de la cuota"
            : definicion.etiqueta}{" "}
          · por {regla.ventana === "dia" ? "día" : "mes"}
          {silenciada ? " · silenciada" : ""}
          {regla.ultimoDisparo
            ? ` · último aviso ${regla.ultimoDisparo.toISOString().slice(0, 10)}`
            : ""}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={umbral}
          onChange={(evento) => setUmbral(evento.target.value)}
          onBlur={guardar}
          inputMode="decimal"
          className="w-28 text-right tabular-nums"
          aria-label={`Umbral de ${regla.etiqueta}`}
        />
        <span className="w-24 text-xs text-muted-foreground">
          {regla.tipoUmbral === "porcentaje_cuota"
            ? "%"
            : formatearValor(regla.umbral, definicion.unidad)}
        </span>
        {guardando ? <Spinner /> : null}
      </div>
    </div>
  )
}
