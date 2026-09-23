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
import { FolderPlusIcon, SearchIcon } from "lucide-react"
import { createIssue, updateIssue } from "@/actions/issues"
import { createProject } from "@/actions/projects"
import { buscarPosiblesDuplicados } from "@/actions/duplicates"
import { AvisoDuplicados } from "@/components/issues/similar-issues"
import {
  SelectorFotos,
  type FotoPendiente,
} from "@/components/issues/selector-fotos"
import { mensajeDeError, subirFoto } from "@/lib/adjuntos/cliente"
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

export type AreaOpcion = {
  id: string
  projectId: string
  name: string
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

/** Tiene que coincidir con MAX_ADJUNTOS_POR_ISSUE del servidor. */
const MAX_FOTOS = 10

const VALORES_INICIALES: IssueFormValues = {
  title: "",
  description: "",
  projectId: "",
  areaId: "",
  type: "bug",
  priority: "media",
  status: "pendiente",
}

type Props = {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  proyectos: ProyectoOpcion[]
  /** Áreas de todos los proyectos; se filtran por el proyecto elegido. */
  areas?: AreaOpcion[]
  /** Id del problema a editar. Si falta, es un alta. */
  issueId?: string
  valoresIniciales?: Partial<IssueFormValues>
  /** Cuántas fotos tiene ya el problema que se edita. */
  fotosExistentes?: number
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
  areas = [],
  issueId,
  valoresIniciales,
  fotosExistentes = 0,
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
  const [fotos, setFotos] = React.useState<FotoPendiente[]>([])
  const [subiendoFotos, setSubiendoFotos] = React.useState(false)
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
      descartarFotos()
    }
  }

  /** Las previsualizaciones son object URLs: hay que soltarlas a mano. */
  function descartarFotos() {
    setFotos((previas) => {
      for (const foto of previas) URL.revokeObjectURL(foto.preview)

      return []
    })
  }

  /**
   * Las fotos se suben después de guardar, cuando el problema ya tiene id: la
   * ruta del archivo en el bucket lo incluye. Si alguna falla, el problema
   * queda creado igual y el aviso dice cuál no entró.
   */
  async function subirPendientes(idDelIssue: string) {
    if (fotos.length === 0) return

    setSubiendoFotos(true)

    let fallaron = 0

    for (const foto of fotos) {
      try {
        await subirFoto(idDelIssue, foto.imagen, foto.nombre)
      } catch (error) {
        fallaron++
        toast.add({
          title: `${foto.nombre}: ${mensajeDeError(error)}`,
          type: "error",
        })
      }
    }

    setSubiendoFotos(false)
    descartarFotos()

    const subidas = fotos.length - fallaron

    if (subidas > 0) {
      toast.add({
        title: subidas === 1 ? "Foto adjuntada" : `${subidas} fotos adjuntadas`,
        type: "success",
      })
    }
  }

  function set<K extends keyof IssueFormValues>(
    campo: K,
    valor: IssueFormValues[K]
  ) {
    setValores((previos) => ({ ...previos, [campo]: valor }))
  }

  // Un área pertenece a un proyecto: cambiar de proyecto deja el área vacía en
  // vez de arrastrar una que no le corresponde.
  function elegirProyecto(projectId: string) {
    setValores((previos) => ({ ...previos, projectId, areaId: "" }))
  }

  const areasDelProyecto = areas.filter(
    (a) => a.projectId === valores.projectId
  )

  /**
   * Búsqueda de parecidos, a pedido.
   *
   * Antes corría sola en el primer submit y demoraba el alta varios segundos
   * esperando el embedding, aun cuando ya sabías que el problema era nuevo.
   * Ahora crear es instantáneo y esto queda para cuando tenés la duda.
   */
  async function buscarParecidos() {
    setBuscandoDuplicados(true)
    setDuplicadosIgnorados(false)

    const similares = await buscarPosiblesDuplicados(
      valores.title,
      valores.description
    )

    setDuplicados(similares)
    setBuscandoDuplicados(false)

    if (similares.length === 0) {
      toast.add({ title: "No encontré problemas parecidos", type: "info" })
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

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

    const creado = editando
      ? null
      : (resultado.data as { id: string; number: number })

    await subirPendientes(issueId ?? creado!.id)

    onOpenChange(false)
    onGuardado?.(creado)
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
                  onValueChange={(valor) => elegirProyecto(valor ?? "")}
                  opciones={proyectosLocales.map((p) => ({
                    label: p.name,
                    value: p.id,
                  }))}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="areaId">Área</FieldLabel>
                <EnumSelect
                  id="areaId"
                  className="w-full"
                  placeholder="Sin área"
                  value={valores.areaId || null}
                  onValueChange={(valor) => set("areaId", valor ?? "")}
                  opciones={areasDelProyecto.map((a) => ({
                    label: a.name,
                    value: a.id,
                  }))}
                />
                <FieldDescription>
                  {!valores.projectId
                    ? "Elegí un proyecto para ver sus áreas."
                    : areasDelProyecto.length === 0
                      ? "Este proyecto todavía no tiene áreas. Se crean en Proyectos."
                      : "El módulo o parte del proyecto."}
                </FieldDescription>
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
            <Field>
              <FieldLabel>Fotos</FieldLabel>
              <SelectorFotos
                fotos={fotos}
                onChange={setFotos}
                disponibles={MAX_FOTOS - fotosExistentes}
                disabled={guardando}
              />
              <FieldDescription>
                Capturas de pantalla, la pizarra, el error en el celular. Se
                suben cuando guardes.
              </FieldDescription>
            </Field>
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

            {/* Sólo al dar de alta: en una edición el problema ya existe. */}
            {!editando ? (
              <Button
                type="button"
                variant="ghost"
                onClick={buscarParecidos}
                disabled={
                  guardando ||
                  buscandoDuplicados ||
                  valores.title.trim().length < 8
                }
                title="Busca si ya anotaste algo parecido. Tarda unos segundos."
              >
                {buscandoDuplicados ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SearchIcon data-icon="inline-start" />
                )}
                {buscandoDuplicados ? "Buscando…" : "Buscar parecidos"}
              </Button>
            ) : null}

            <Button
              type="submit"
              disabled={guardando || subiendoFotos || buscandoDuplicados}
            >
              {guardando || subiendoFotos ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {subiendoFotos
                ? "Subiendo fotos…"
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
