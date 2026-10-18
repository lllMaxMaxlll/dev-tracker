import { Suspense } from "react"
import Link from "next/link"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { Puestos } from "@/components/banco/puestos"
import { Cola } from "@/components/banco/cola"
import { requireUser } from "@/lib/auth/require-user"
import {
  PUESTOS_DEL_BANCO,
  getActividadReciente,
  getCola,
  getEnProgreso,
  type EventoDeActividad,
} from "@/lib/db/queries/banco"
import { getResumen } from "@/lib/db/queries/metrics"
import { getEstancados } from "@/lib/db/queries/semana"
import {
  ZONA,
  duracionLaboralLegible,
  msLaborales,
} from "@/lib/utils/horario-laboral"

export const metadata: Metadata = { title: "Banco · Taller" }

async function Saludo() {
  const user = await requireUser()

  return (
    <PageHeader
      title="Banco de trabajo"
      description={`Hola, ${user.displayName.split(" ")[0]}. Hasta ${PUESTOS_DEL_BANCO} órdenes en progreso: si querés empezar otra, terminá o soltá una.`}
    />
  )
}

/**
 * Puestos y cola van juntos porque la cola necesita saber si el banco está
 * lleno, y las dos consultas son livianas.
 */
async function Mesa() {
  const user = await requireUser()

  const [enProgreso, cola] = await Promise.all([
    getEnProgreso(user.id),
    getCola(user.id),
  ])

  const ahora = new Date()

  const puestos = enProgreso.map((orden) => ({
    id: orden.id,
    number: orden.number,
    title: orden.title,
    type: orden.type,
    priority: orden.priority,
    projectName: orden.projectName,
    areaName: orden.areaName,
    // Horas de trabajo, como el tiempo de resolución: lo que pasa de noche,
    // el fin de semana o un feriado no suma.
    lleva: orden.firstInProgressAt
      ? duracionLaboralLegible(msLaborales(orden.firstInProgressAt, ahora))
      : null,
  }))

  return (
    <div className="flex flex-col gap-8">
      <Puestos puestos={puestos} capacidad={PUESTOS_DEL_BANCO} />
      <Cola
        items={cola.map((orden) => ({
          id: orden.id,
          number: orden.number,
          title: orden.title,
          type: orden.type,
          priority: orden.priority,
          projectName: orden.projectName,
        }))}
        bancoLleno={enProgreso.length >= PUESTOS_DEL_BANCO}
      />
    </div>
  )
}

function Indicador({
  valor,
  etiqueta,
  href,
  destacado,
}: {
  valor: string
  etiqueta: string
  href?: string
  destacado?: "bien" | "aviso"
}) {
  const contenido = (
    <div className="flex h-full flex-col gap-1 bg-card p-4 transition-colors hover:bg-muted">
      <span
        className={
          destacado === "bien"
            ? "font-mono text-3xl font-bold tracking-tighter text-emerald-600 dark:text-emerald-400"
            : destacado === "aviso"
              ? "font-mono text-3xl font-bold tracking-tighter text-amber-600 dark:text-amber-400"
              : "font-mono text-3xl font-bold tracking-tighter"
        }
      >
        {valor}
      </span>
      <span className="font-mono text-[0.7rem] tracking-wide text-muted-foreground uppercase">
        {etiqueta}
      </span>
    </div>
  )

  return href ? <Link href={href}>{contenido}</Link> : contenido
}

async function Indicadores() {
  const user = await requireUser()
  const [resumen, estancados] = await Promise.all([
    getResumen(user.id),
    getEstancados(user.id),
  ])

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
        Indicadores
      </h2>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border">
        <Indicador
          valor={String(resumen.abiertos)}
          etiqueta="Abiertas"
          href="/ordenes?estado=abiertos"
        />
        <Indicador
          valor={String(resumen.resueltosEstaSemana)}
          etiqueta="Cerradas · semana"
          href="/ordenes?estado=resuelto&vista=tabla"
          destacado={resumen.resueltosEstaSemana > 0 ? "bien" : undefined}
        />
        <Indicador
          valor={
            resumen.tiempoPromedioMs === null
              ? "—"
              : duracionLaboralLegible(resumen.tiempoPromedioMs)
          }
          etiqueta="Resolución · laboral"
        />
        {/* getEstancados corta en 5: más que eso se lee como "5+". */}
        <Indicador
          valor={estancados.length >= 5 ? "5+" : String(estancados.length)}
          etiqueta="Quietas +14 días"
          destacado={estancados.length > 0 ? "aviso" : undefined}
        />
      </div>
    </section>
  )
}

const HORA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  hour: "2-digit",
  minute: "2-digit",
})

const DIA = new Intl.DateTimeFormat("es-AR", {
  timeZone: ZONA,
  weekday: "short",
})

function describir(evento: EventoDeActividad) {
  if (evento.desde === null) return "entró"
  if (evento.hacia === "resuelto") return "cerrada"
  if (evento.hacia === "descartado") return "descartada"
  if (evento.hacia === "en_progreso") return "al banco"
  if (evento.desde === "en_progreso") return "soltada"

  return "reabierta"
}

async function Actividad() {
  const user = await requireUser()
  const eventos = await getActividadReciente(user.id)
  const hoy = DIA.format(new Date())

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold tracking-wide text-muted-foreground uppercase [font-stretch:125%]">
        Actividad
      </h2>
      {eventos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada en los últimos dos días.
        </p>
      ) : (
        <ul className="flex flex-col">
          {eventos.map((evento) => {
            const dia = DIA.format(evento.cuando)

            return (
              <li
                key={`${evento.numero}-${evento.cuando.toISOString()}`}
                className="grid grid-cols-[3.25rem_1fr] gap-2 border-b border-dashed py-2 text-sm last:border-b-0"
              >
                <time className="font-mono text-xs text-muted-foreground">
                  {dia === hoy ? HORA.format(evento.cuando) : dia}
                </time>
                <span className="min-w-0">
                  <Link
                    href={`/ordenes/${evento.numero}`}
                    className="font-semibold underline-offset-4 hover:underline"
                  >
                    #{evento.numero}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    {describir(evento)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {evento.titulo}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * El banco: lo que tenés entre manos, lo que viene después, los números de la
 * semana y lo último que pasó. Cada bloque tiene su propio Suspense.
 */
export default function BancoPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-16 w-72 max-w-full" />}>
        <Saludo />
      </Suspense>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Suspense
          fallback={
            <div className="flex flex-col gap-8">
              <div className="grid gap-3 md:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-44" />
                ))}
              </div>
              <Skeleton className="h-72" />
            </div>
          }
        >
          <Mesa />
        </Suspense>

        <aside className="flex flex-col gap-8">
          <Suspense fallback={<Skeleton className="h-48" />}>
            <Indicadores />
          </Suspense>
          <Suspense fallback={<Skeleton className="h-64" />}>
            <Actividad />
          </Suspense>
        </aside>
      </div>
    </div>
  )
}
