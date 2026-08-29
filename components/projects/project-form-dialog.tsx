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
import { createProject, updateProject } from "@/actions/projects"
import { listarReposParaSelector } from "@/actions/github"
import type { ProjectWithCounts } from "@/lib/db/queries/projects"
import type { RepoResumen } from "@/lib/github/queries"

type Props = {
  open: boolean
  onOpenChange: (abierto: boolean) => void
  proyecto?: ProjectWithCounts | null
}

export function ProjectFormDialog({ open, onOpenChange, proyecto }: Props) {
  const router = useRouter()
  const [guardando, setGuardando] = React.useState(false)
  const [errores, setErrores] = React.useState<Record<string, string[]>>({})

  const editando = Boolean(proyecto)

  // Los repos se piden al abrir el diálogo, no al montar la página: no tiene
  // sentido gastar una llamada a GitHub por si acaso.
  const [repos, setRepos] = React.useState<RepoResumen[]>([])
  const [cargandoRepos, setCargandoRepos] = React.useState(false)
  const [errorRepos, setErrorRepos] = React.useState<string | null>(null)
  const [repoElegido, setRepoElegido] = React.useState<string | null>(
    proyecto?.githubRepoFullName ?? null
  )
  const [abiertoPrevio, setAbiertoPrevio] = React.useState(false)

  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open)

    if (open) {
      setRepoElegido(proyecto?.githubRepoFullName ?? null)

      if (repos.length === 0 && !cargandoRepos) {
        setCargandoRepos(true)
        listarReposParaSelector().then(({ repos: lista, error }) => {
          setRepos(lista)
          setErrorRepos(error)
          setCargandoRepos(false)
        })
      }
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setErrores({})

    const datos = new FormData(event.currentTarget)
    const valores = {
      name: String(datos.get("name") ?? ""),
      description: String(datos.get("description") ?? ""),
      color: String(datos.get("color") ?? ""),
      githubRepoFullName: String(datos.get("githubRepoFullName") ?? ""),
    }

    const resultado = proyecto
      ? await updateProject({ ...valores, id: proyecto.id })
      : await createProject(valores)

    setGuardando(false)

    if (!resultado.ok) {
      setErrores(resultado.fieldErrors ?? {})
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: editando ? "Proyecto actualizado" : "Proyecto creado",
      type: "success",
    })
    onOpenChange(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editando ? "Editar proyecto" : "Nuevo proyecto"}
          </DialogTitle>
          <DialogDescription>
            Agrupá tus problemas y vinculá el proyecto a un repositorio.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={errores.name ? true : undefined}>
              <FieldLabel htmlFor="name">Nombre</FieldLabel>
              <Input
                id="name"
                name="name"
                defaultValue={proyecto?.name ?? ""}
                placeholder="Fischer"
                autoFocus
                required
                aria-invalid={errores.name ? true : undefined}
              />
              {errores.name ? <FieldError>{errores.name[0]}</FieldError> : null}
            </Field>

            <Field data-invalid={errores.description ? true : undefined}>
              <FieldLabel htmlFor="description">Descripción</FieldLabel>
              <Textarea
                id="description"
                name="description"
                rows={2}
                defaultValue={proyecto?.description ?? ""}
                placeholder="Para qué es este proyecto"
              />
              {errores.description ? (
                <FieldError>{errores.description[0]}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={errores.githubRepoFullName ? true : undefined}>
              <FieldLabel htmlFor="githubRepoFullName">
                Repositorio de GitHub
              </FieldLabel>
              {/* El valor viaja en un input oculto para que el submit lo lea
                  del FormData igual que el resto de los campos. */}
              <input
                type="hidden"
                name="githubRepoFullName"
                value={repoElegido ?? ""}
              />
              {errorRepos ? (
                <Input
                  id="githubRepoFullName"
                  value={repoElegido ?? ""}
                  onChange={(e) => setRepoElegido(e.target.value || null)}
                  placeholder="usuario/repositorio"
                />
              ) : (
                <EnumSelect
                  id="githubRepoFullName"
                  className="w-full"
                  placeholder={
                    cargandoRepos ? "Cargando repos…" : "Sin repositorio"
                  }
                  value={repoElegido}
                  onValueChange={setRepoElegido}
                  opciones={repos.map((repo) => ({
                    label: repo.fullName,
                    value: repo.fullName,
                  }))}
                />
              )}
              <FieldDescription>
                {errorRepos
                  ? `No se pudieron cargar tus repos (${errorRepos}). Podés escribirlo a mano.`
                  : "Opcional. Habilita los commits y el heatmap de este proyecto."}
              </FieldDescription>
              {errores.githubRepoFullName ? (
                <FieldError>{errores.githubRepoFullName[0]}</FieldError>
              ) : null}
            </Field>

            <Field data-invalid={errores.color ? true : undefined}>
              <FieldLabel htmlFor="color">Color</FieldLabel>
              <Input
                id="color"
                name="color"
                type="color"
                className="h-9 w-20 p-1"
                defaultValue={proyecto?.color ?? "#6366f1"}
              />
              <FieldDescription>
                Se usa para identificar el proyecto de un vistazo.
              </FieldDescription>
              {errores.color ? (
                <FieldError>{errores.color[0]}</FieldError>
              ) : null}
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
            <Button type="submit" disabled={guardando}>
              {guardando ? <Spinner data-icon="inline-start" /> : null}
              {editando ? "Guardar" : "Crear proyecto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
