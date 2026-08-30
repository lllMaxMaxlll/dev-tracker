"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  GitCommitHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EnumSelect } from "@/components/ui/enum-select"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/toast"
import {
  IssueFormDialog,
  type ProyectoOpcion,
} from "@/components/issues/issue-form-dialog"
import {
  changeIssueStatus,
  deleteIssue,
  linkIssue,
  unlinkIssue,
} from "@/actions/issues"
import { ESTADOS, ETIQUETAS_ESTADO, type Estado } from "@/lib/schemas/enums"
import type { IssueFormValues } from "@/lib/schemas/issue"
import type { IssueLink } from "@/lib/db/schema"

/** Selector de estado del detalle: cada cambio queda en el historial. */
export function CambiarEstado({
  issueId,
  estado,
}: {
  issueId: string
  estado: Estado
}) {
  const router = useRouter()
  const [guardando, setGuardando] = React.useState(false)

  async function cambiar(valor: string | null) {
    if (!valor || valor === estado) return

    setGuardando(true)
    const resultado = await changeIssueStatus({ id: issueId, status: valor })
    setGuardando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({
      title: `Estado: ${ETIQUETAS_ESTADO[valor as Estado]}`,
      type: "success",
    })
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <EnumSelect
        placeholder="Estado"
        value={estado}
        onValueChange={cambiar}
        opciones={ESTADOS.map((e) => ({
          label: ETIQUETAS_ESTADO[e],
          value: e,
        }))}
      />
      {guardando ? <Spinner /> : null}
    </div>
  )
}

export function AccionesIssue({
  issueId,
  numero,
  proyectos,
  valoresIniciales,
}: {
  issueId: string
  numero: number
  proyectos: ProyectoOpcion[]
  valoresIniciales: IssueFormValues
}) {
  const router = useRouter()
  const [editando, setEditando] = React.useState(false)
  const [confirmando, setConfirmando] = React.useState(false)
  const [borrando, setBorrando] = React.useState(false)

  async function confirmarBorrado() {
    setBorrando(true)
    const resultado = await deleteIssue(issueId)
    setBorrando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({ title: `Problema #${numero} borrado`, type: "success" })

    // `push` sola dejaba la tabla mostrando el problema recién borrado: el
    // router del cliente sirve la lista desde su caché de payloads RSC, que la
    // navegación no invalida. `refresh` la descarta y vuelve a pedirla.
    router.push("/problemas")
    router.refresh()
  }

  return (
    <>
      <Button variant="outline" onClick={() => setEditando(true)}>
        <PencilIcon data-icon="inline-start" />
        Editar
      </Button>

      <Button
        variant="outline"
        aria-label="Borrar problema"
        onClick={() => setConfirmando(true)}
      >
        <Trash2Icon />
      </Button>

      <IssueFormDialog
        open={editando}
        onOpenChange={setEditando}
        proyectos={proyectos}
        issueId={issueId}
        valoresIniciales={valoresIniciales}
      />

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar el problema #{numero}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra también su historial de estados. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={borrando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarBorrado} disabled={borrando}>
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function VinculosIssue({
  issueId,
  vinculos,
}: {
  issueId: string
  vinculos: IssueLink[]
}) {
  const router = useRouter()
  const [url, setUrl] = React.useState("")
  const [kind, setKind] = React.useState<"commit" | "pr">("commit")
  const [guardando, setGuardando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function agregar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setGuardando(true)
    setError(null)

    const resultado = await linkIssue({ id: issueId, kind, url })
    setGuardando(false)

    if (!resultado.ok) {
      setError(resultado.fieldErrors?.url?.[0] ?? resultado.error)

      return
    }

    setUrl("")
    toast.add({ title: "Vinculado", type: "success" })
    router.refresh()
  }

  async function quitar(linkId: string) {
    const resultado = await unlinkIssue(linkId)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {vinculos.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {vinculos.map((vinculo) => (
            <li key={vinculo.id} className="flex items-center gap-2 text-sm">
              <GitCommitHorizontalIcon className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={vinculo.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline"
              >
                {vinculo.sha ? vinculo.sha.slice(0, 7) : vinculo.url}
                {vinculo.repoFullName ? ` · ${vinculo.repoFullName}` : ""}
              </a>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Quitar vínculo"
                onClick={() => quitar(vinculo.id)}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <form onSubmit={agregar} className="flex flex-col gap-2">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="url-vinculo" className="sr-only">
            URL del commit o PR
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            <EnumSelect
              placeholder="Tipo"
              value={kind}
              onValueChange={(valor) =>
                setKind((valor as "commit" | "pr") ?? "commit")
              }
              opciones={[
                { label: "Commit", value: "commit" },
                { label: "PR", value: "pr" },
              ]}
            />
            <Input
              id="url-vinculo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/usuario/repo/commit/abc123"
              className="min-w-48 flex-1"
              aria-invalid={error ? true : undefined}
            />
            <Button
              type="submit"
              variant="outline"
              disabled={guardando || !url}
            >
              {guardando ? <Spinner data-icon="inline-start" /> : null}
              Vincular
            </Button>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>
      </form>
    </div>
  )
}
