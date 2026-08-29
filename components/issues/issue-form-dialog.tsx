"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { EnumSelect } from "@/components/ui/enum-select"
import { toast } from "@/components/ui/toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FolderPlusIcon } from "lucide-react"
import { createIssue, updateIssue } from "@/actions/issues"
import { createProject } from "@/actions/projects"
import { buscarPosiblesDuplicados } from "@/actions/duplicates"
import { AvisoDuplicados } from "@/components/issues/similar-issues"
import type { Similar } from "@/lib/ai/embeddings"
import {
  ESTADOS,
  ETIQUETAS_ESTADO,
  ETIQUETAS_PRIORIDAD,
  ETIQUETAS_TIPO,
  PRIORIDADES,
  TIPOS,
} from "@/lib/schemas/enums"
import type { IssueFormValues } from "@/lib/schemas/issue"

export type ProyectoOpcion = {
  id: string
  name: string
  slug: string
  color: string | null
}

const OPCIONES_TIPO = TIPOS.map((t) => ({ label: ETIQUETAS_TIPO[t], value: t }))
const OPCIONES_PRIORIDAD = PRIORIDADES.map((p) => ({
  label: ETIQUETAS_PRIORIDAD[p],
  value: p,
}))
const OPCIONES_ESTADO = ESTADOS.map((e) => ({
  label: ETIQUETAS_ESTADO[e],
  value: e,
}))

const VALORES_INICIALES: IssueFormValues = {
  title: "",
  description: "",
  projectId: "",
  type: "bug",
  priority: "media",
  status: "pendiente",
}

type Props = {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  proyectos: ProyectoOpcion[]
  /** Id del problema a editar. Si falta, es un alta. */
  issueId?: string
  valoresIniciales?: Partial<IssueFormValues>
  /** Texto extra bajo el título, p. ej. el aviso de la captura por IA. */
  encabezado?: React.ReactNode
  /** Proyecto que la IA mencionó y todavía no existe. Se ofrece crearlo. */
  proyectoNuevo?: string | null
  onGuardado?: (resultado: { id: string; number: number } | null) => void
}

export function IssueFormDialog({
  open,
  onOpenChange,
  proyectos,
  issueId,
  valoresIniciales,
  encabezado,
  proyectoNuevo,
  onGuardado,
}: Props) {
  const router = useRouter()
  const [guardando, setGuardando] = React.useState(false)
  const [errores, setErrores] = React.useState<Record<string, string[]>>({})
  const [valores, setValores] = React.useState<IssueFormValues>({
    ...VALORES_INICIALES,
    ...valoresIniciales,
  })

  const editando = Boolean(issueId)
  const [duplicados, setDuplicados] = React.useState<Similar[]>([])
  const [buscandoDuplicados, setBuscandoDuplicados] = React.useState(false)
  const [duplicadosIgnorados, setDuplicadosIgnorados] = React.useState(false)
  const [creandoProyecto, setCreandoProyecto] = React.useState(false)
  const [proyectosLocales, setProyectosLocales] = React.useState(proyectos)
  const [sugerenciaProyecto, setSugerenciaProyecto] = React.useState<
    string | null
  >(proyectoNuevo ?? null)

  const [proyectosPrevios, setProyectosPrevios] = React.useState(proyectos)

  if (proyectos !== proyectosPrevios) {
    setProyectosPrevios(proyectos)
    setProyectosLocales(proyectos)
  }

  const [sugerenciaPrevia, setSugerenciaPrevia] = React.useState(proyectoNuevo)

  if (proyectoNuevo !== sugerenciaPrevia) {
    setSugerenciaPrevia(proyectoNuevo)
    setSugerenciaProyecto(proyectoNuevo ?? null)
  }

  async function crearProyectoSugerido() {
    if (!sugerenciaProyecto) return

    setCreandoProyecto(true)
    const resultado = await createProject({ name: sugerenciaProyecto })
    setCreandoProyecto(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    const nuevo = {
      id: resultado.data.id,
      name: sugerenciaProyecto,
      slug: resultado.data.slug,
      color: null,
    }

    setProyectosLocales((previos) => [...previos, nuevo])
    setValores((previos) => ({ ...previos, projectId: nuevo.id }))
    setSugerenciaProyecto(null)
    toast.add({
      title: `Proyecto «${sugerenciaProyecto}» creado`,
      type: "success",
    })
    router.refresh()
  }

  // Al reabrir el diálogo, volver a los valores que corresponden: sin esto el
  // formulario conservaría lo tipeado la vez anterior. Se ajusta durante el
  // render, que es el patrón que recomienda React para estado derivado.
  const [abiertoPrevio, setAbiertoPrevio] = React.useState(open)

  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open)

    if (open) {
      setValores({ ...VALORES_INICIALES, ...valoresIniciales })
      setErrores({})
      setDuplicados([])
      setDuplicadosIgnorados(false)
    }
  }

  function set<K extends keyof IssueFormValues>(
    campo: K,
    valor: IssueFormValues[K]
  ) {
    setValores((previos) => ({ ...previos, [campo]: valor }))
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // En un alta, primero se busca si ya existe algo parecido. El aviso se
    // muestra una sola vez: si igual querés crearlo, el segundo submit pasa
    // de largo. Editar no dispara la búsqueda.
    if (!issueId && !duplicadosIgnorados && duplicados.length === 0) {
      setBuscandoDuplicados(true)
      const similares = await buscarPosiblesDuplicados(
        valores.title,
        valores.description
      )
      setBuscandoDuplicados(false)

      if (similares.length > 0) {
        setDuplicados(similares)

        return
      }
    }

    setGuardando(true)
    setErrores({})

    const resultado = issueId
      ? await updateIssue({ ...valores, id: issueId })
      : await createIssue(valores)

    setGuardando(false)

    if (!resultado.ok) {
      setErrores(resultado.fieldErrors ?? {})
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: editando ? "Problema actualizado" : "Problema creado",
      type: "success",
    })
    onOpenChange(false)
    onGuardado?.(
      editando ? null : (resultado.data as { id: string; number: number })
    )
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar problema" : "Nuevo problema"}
          </DialogTitle>
          <DialogDescription>
            Anotalo como lo harías en el cuaderno. Podés completarlo después.
          </DialogDescription>
        </DialogHeader>

        {encabezado}

        {sugerenciaProyecto ? (
          <Alert>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>
                La nota menciona el proyecto «{sugerenciaProyecto}», que todavía
                no existe.
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={crearProyectoSugerido}
                disabled={creandoProyecto}
              >
                {creandoProyecto ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <FolderPlusIcon data-icon="inline-start" />
                )}
                Crearlo
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {duplicados.length > 0 && !duplicadosIgnorados ? (
          <AvisoDuplicados
            similares={duplicados}
            onIgnorar={() => setDuplicadosIgnorados(true)}
          />
        ) : null}

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={errores.title ? true : undefined}>
              <FieldLabel htmlFor="title">Título</FieldLabel>
              <Input
                id="title"
                value={valores.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="El login se rompe cuando el mail tiene mayúsculas"
                autoFocus
                required
                aria-invalid={errores.title ? true : undefined}
              />
              {errores.title ? (
                <FieldError>{errores.title[0]}</FieldError>
              ) : null}
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Descripción</FieldLabel>
              <Textarea
                id="description"
                rows={5}
                value={valores.description ?? ""}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Pasos para reproducirlo, entorno, lo que se te ocurra."
              />
              <FieldDescription>Acepta markdown simple.</FieldDescription>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="projectId">Proyecto</FieldLabel>
                <EnumSelect
                  id="projectId"
                  className="w-full"
                  placeholder="Sin proyecto"
                  value={valores.projectId || null}
                  onValueChange={(valor) => set("projectId", valor ?? "")}
                  opciones={proyectosLocales.map((p) => ({
                    label: p.name,
                    value: p.id,
                  }))}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="type">Tipo</FieldLabel>
                <EnumSelect
                  id="type"
                  className="w-full"
                  placeholder="Elegí un tipo"
                  value={valores.type}
                  onValueChange={(valor) =>
                    set("type", (valor ?? "bug") as IssueFormValues["type"])
                  }
                  opciones={OPCIONES_TIPO}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="priority">Prioridad</FieldLabel>
                <EnumSelect
                  id="priority"
                  className="w-full"
                  placeholder="Elegí una prioridad"
                  value={valores.priority}
                  onValueChange={(valor) =>
                    set(
                      "priority",
                      (valor ?? "media") as IssueFormValues["priority"]
                    )
                  }
                  opciones={OPCIONES_PRIORIDAD}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="status">Estado</FieldLabel>
                <EnumSelect
                  id="status"
                  className="w-full"
                  placeholder="Elegí un estado"
                  value={valores.status}
                  onValueChange={(valor) =>
                    set(
                      "status",
                      (valor ?? "pendiente") as IssueFormValues["status"]
                    )
                  }
                  opciones={OPCIONES_ESTADO}
                />
              </Field>
            </div>
          </FieldGroup>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || buscandoDuplicados}>
              {guardando || buscandoDuplicados ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {buscandoDuplicados
                ? "Buscando parecidos…"
                : editando
                  ? "Guardar"
                  : duplicados.length > 0
                    ? "Crear igual"
                    : "Crear problema"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
