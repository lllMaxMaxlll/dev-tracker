import { Suspense } from "react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { FuenteCard } from "@/components/consumo/fuente-card"
import { ReglasPanel } from "@/components/consumo/reglas-panel"
import { SerieChart } from "@/components/consumo/serie-chart"
import { requireUser } from "@/lib/auth/require-user"
import {
  getEstadoDeFuentes,
  getGastoIaDelMes,
  getRecursosConConsumo,
  getReglasConEstado,
  getSerieDiaria,
  getSerieGastoIa,
} from "@/lib/db/queries/consumo"

export const metadata: Metadata = { title: "Consumo · DevTracker" }

/**
 * Monitor de consumo.
 *
 * Cada bloque tiene su propio `<Suspense>`: si una consulta tarda, el resto de
 * la página ya está a la vista. Y cada tarjeta de fuente sabe distinguir "sin
 * credencial", "falló" y "sin consumo", porque las tres cosas se verían igual
 * —un cero— si no se dijeran.
 */
async function Fuentes() {
  const [recursos, estados] = await Promise.all([
    getRecursosConConsumo(),
    getEstadoDeFuentes(),
  ])

  const de = (fuente: string) => recursos.filter((r) => r.fuente === fuente)
  const estado = (fuente: string) => estados.find((e) => e.fuente === fuente)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <FuenteCard
        fuente="vercel"
        recursos={de("vercel")}
        estado={estado("vercel")}
        nota="El plan Hobby no expone facturación por API: acá se cuentan despliegues, que miden actividad y no costo."
      />
      <FuenteCard
        fuente="supabase"
        recursos={de("supabase")}
        estado={estado("supabase")}
        nota="El egress y los usuarios activos no tienen endpoint público: se miran en la facturación de la organización."
      />
      <FuenteCard
        fuente="openrouter"
        recursos={de("openrouter")}
        estado={estado("openrouter")}
        nota="El desglose por modelo y por tarea está en Ajustes, calculado sobre el registro local de llamadas."
      />
    </div>
  )
}

async function Graficos() {
  const [peticiones, despliegues, gastoIa, totalIa] = await Promise.all([
    getSerieDiaria(
      [
        "supabase.rest_requests",
        "supabase.auth_requests",
        "supabase.storage_requests",
        "supabase.realtime_requests",
      ],
      30
    ),
    getSerieDiaria(["vercel.deployments"], 30),
    getSerieGastoIa(30),
    // El total sale del registro local de llamadas y no de la API: es el único
    // número del panel que sabe en qué se gastó, no sólo cuánto.
    getGastoIaDelMes(),
  ])

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Peticiones a Supabase</CardTitle>
        </CardHeader>
        <CardContent>
          <SerieChart datos={peticiones} etiqueta="Peticiones" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Despliegues en Vercel</CardTitle>
        </CardHeader>
        <CardContent>
          <SerieChart datos={despliegues} etiqueta="Despliegues" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-baseline justify-between gap-2">
          <CardTitle className="text-base">Gasto de IA</CardTitle>
          <span className="text-xs text-muted-foreground tabular-nums">
            {totalIa.llamadas} llamadas este mes · $
            {totalIa.costoUsd.toFixed(4)}
          </span>
        </CardHeader>
        <CardContent>
          <SerieChart
            datos={gastoIa}
            etiqueta="USD"
            formato={(valor) => `$${valor.toFixed(4)}`}
          />
        </CardContent>
      </Card>
    </div>
  )
}

async function Reglas() {
  const reglas = await getReglasConEstado()

  return <ReglasPanel reglas={reglas} />
}

export default async function ConsumoPage() {
  // La página no filtra por usuario —el consumo es de la instancia— pero sigue
  // exigiendo sesión: la autorización acá es binaria, no de pertenencia.
  await requireUser()

  return (
    <>
      <PageHeader
        title="Consumo"
        description="Qué están gastando los proyectos en Vercel, Supabase y OpenRouter."
      />

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        }
      >
        <Fuentes />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        }
      >
        <Graficos />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Alertas</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-48 w-full" />}>
            <Reglas />
          </Suspense>
        </CardContent>
      </Card>
    </>
  )
}
