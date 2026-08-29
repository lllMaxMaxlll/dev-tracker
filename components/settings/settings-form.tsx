"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/components/ui/toast"
import { AvisoSinTools, ModelPicker } from "@/components/settings/model-picker"
import { guardarAjustesIA } from "@/actions/settings"
import { regenerarEmbeddings } from "@/actions/duplicates"
import type { ModeloCatalogo } from "@/lib/ai/models"
import type { UserAiSettings } from "@/lib/db/schema"

function Parametros({
  temperatura,
  maxTokens,
  onTemperatura,
  onMaxTokens,
  prefijo,
}: {
  temperatura: number
  maxTokens: number
  onTemperatura: (v: number) => void
  onMaxTokens: (v: number) => void
  prefijo: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${prefijo}-temp`}>
          Temperatura:{" "}
          <span className="tabular-nums">{temperatura.toFixed(2)}</span>
        </FieldLabel>
        <Slider
          id={`${prefijo}-temp`}
          value={[temperatura]}
          onValueChange={(v) =>
            onTemperatura((Array.isArray(v) ? v[0] : v) ?? 0)
          }
          min={0}
          max={1.5}
          step={0.05}
        />
        <FieldDescription>
          Más baja, más obediente y repetible. Más alta, más suelta.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor={`${prefijo}-tokens`}>
          Máximo de tokens: <span className="tabular-nums">{maxTokens}</span>
        </FieldLabel>
        <Slider
          id={`${prefijo}-tokens`}
          value={[maxTokens]}
          onValueChange={(v) => onMaxTokens((Array.isArray(v) ? v[0] : v) ?? 0)}
          min={256}
          max={8192}
          step={256}
        />
        <FieldDescription>Límite de la respuesta.</FieldDescription>
      </Field>
    </div>
  )
}

export function SettingsForm({
  ajustes,
  modelosTexto,
  modelosEmbeddings,
}: {
  ajustes: UserAiSettings
  modelosTexto: ModeloCatalogo[]
  modelosEmbeddings: ModeloCatalogo[]
}) {
  const router = useRouter()
  const [guardando, setGuardando] = React.useState(false)
  const [aviso, setAviso] = React.useState<string | null>(null)
  const [regenerando, setRegenerando] = React.useState(false)

  async function regenerar() {
    setRegenerando(true)
    const resultado = await regenerarEmbeddings()
    setRegenerando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    const { procesados, fallidos } = resultado.data

    toast.add({
      title: `${procesados - fallidos} de ${procesados} embeddings regenerados`,
      description: fallidos > 0 ? `${fallidos} fallaron.` : undefined,
      type: fallidos > 0 ? "warning" : "success",
    })
    setAviso(null)
    router.refresh()
  }

  const [valores, setValores] = React.useState({
    defaultModel: ajustes.defaultModel,
    fastModel: ajustes.fastModel ?? "",
    reasoningModel: ajustes.reasoningModel ?? "",
    embeddingModel: ajustes.embeddingModel,
    fastTemperature: ajustes.fastTemperature,
    fastMaxTokens: ajustes.fastMaxTokens,
    reasoningTemperature: ajustes.reasoningTemperature,
    reasoningMaxTokens: ajustes.reasoningMaxTokens,
    requireToolCalling: ajustes.requireToolCalling,
  })

  function set<K extends keyof typeof valores>(
    campo: K,
    valor: (typeof valores)[K]
  ) {
    setValores((previos) => ({ ...previos, [campo]: valor }))
  }

  const modeloDefault = modelosTexto.find((m) => m.id === valores.defaultModel)
  const modeloFast = modelosTexto.find(
    (m) => m.id === (valores.fastModel || valores.defaultModel)
  )
  const modeloReasoning = modelosTexto.find(
    (m) => m.id === (valores.reasoningModel || valores.defaultModel)
  )

  async function guardar() {
    setGuardando(true)
    setAviso(null)

    const resultado = await guardarAjustesIA(valores)

    setGuardando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    if (resultado.data.avisoDimensiones) {
      setAviso(resultado.data.avisoDimensiones)
    }

    toast.add({ title: "Ajustes guardados", type: "success" })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Modelos</CardTitle>
          <CardDescription>
            Se usan por el binding de Workers AI: no hace falta ninguna API key.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContentSwitch
                titulo="Mostrar sólo modelos con tool calling"
                descripcion="Las salidas estructuradas lo necesitan. Sin esto, la lista incluye modelos que van a fallar."
              />
              <Switch
                checked={valores.requireToolCalling}
                onCheckedChange={(v) => set("requireToolCalling", Boolean(v))}
                aria-label="Mostrar sólo modelos con tool calling"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="modelo-default">
                Modelo por defecto
              </FieldLabel>
              <ModelPicker
                id="modelo-default"
                modelos={modelosTexto}
                valor={valores.defaultModel}
                onChange={(v) => set("defaultModel", v)}
                soloConTools={valores.requireToolCalling}
              />
              <AvisoSinTools modelo={modeloDefault} />
              <FieldDescription>
                Lo heredan las tareas que no tengan uno propio.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tareas rápidas</CardTitle>
          <CardDescription>
            Captura en lenguaje natural y vinculación de commits: estructurar
            texto, no escribirlo. Conviene un modelo barato y obediente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="modelo-fast">Modelo</FieldLabel>
              <ModelPicker
                id="modelo-fast"
                modelos={modelosTexto}
                valor={valores.fastModel}
                onChange={(v) => set("fastModel", v)}
                soloConTools={valores.requireToolCalling}
                opcionHeredar={`Heredar (${valores.defaultModel})`}
              />
              <AvisoSinTools modelo={modeloFast} />
            </Field>

            <Parametros
              prefijo="fast"
              temperatura={valores.fastTemperature}
              maxTokens={valores.fastMaxTokens}
              onTemperatura={(v) => set("fastTemperature", v)}
              onMaxTokens={(v) => set("fastMaxTokens", v)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tareas de razonamiento</CardTitle>
          <CardDescription>
            Resúmenes, priorización, insights y enriquecimiento: acá conviene un
            modelo más capaz.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="modelo-reasoning">Modelo</FieldLabel>
              <ModelPicker
                id="modelo-reasoning"
                modelos={modelosTexto}
                valor={valores.reasoningModel}
                onChange={(v) => set("reasoningModel", v)}
                soloConTools={valores.requireToolCalling}
                opcionHeredar={`Heredar (${valores.defaultModel})`}
              />
              <AvisoSinTools modelo={modeloReasoning} />
            </Field>

            <Parametros
              prefijo="reasoning"
              temperatura={valores.reasoningTemperature}
              maxTokens={valores.reasoningMaxTokens}
              onTemperatura={(v) => set("reasoningTemperature", v)}
              onMaxTokens={(v) => set("reasoningMaxTokens", v)}
            />
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Embeddings</CardTitle>
          <CardDescription>
            Se usan para detectar problemas duplicados o relacionados (Fase 6).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="modelo-embeddings">Modelo</FieldLabel>
            <ModelPicker
              id="modelo-embeddings"
              modelos={modelosEmbeddings}
              valor={valores.embeddingModel}
              onChange={(v) => set("embeddingModel", v)}
              soloConTools={false}
            />
            <FieldDescription>
              Dimensiones guardadas: {ajustes.embeddingDimensions}. Cambiar a un
              modelo con otra dimensión obliga a regenerar los embeddings
              existentes.
            </FieldDescription>
          </Field>

          {aviso ? (
            <Alert>
              <AlertTitle>Cambió la dimensión del vector</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{aviso}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={regenerar}
                  disabled={regenerando}
                >
                  {regenerando ? <Spinner data-icon="inline-start" /> : null}
                  Regenerar embeddings
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={regenerar}
              disabled={regenerando}
            >
              {regenerando ? <Spinner data-icon="inline-start" /> : null}
              Regenerar todos los embeddings
            </Button>
            <p className="text-xs text-muted-foreground">
              Útil si cambiaste de modelo o si algún problema quedó sin
              embedding porque falló su generación.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? <Spinner data-icon="inline-start" /> : null}
          Guardar ajustes
        </Button>
      </div>
    </div>
  )
}

function FieldContentSwitch({
  titulo,
  descripcion,
}: {
  titulo: string
  descripcion: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">{titulo}</span>
      <span className="text-xs text-muted-foreground">{descripcion}</span>
    </div>
  )
}
