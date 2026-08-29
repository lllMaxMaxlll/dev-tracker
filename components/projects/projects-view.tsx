"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ExternalLinkIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import { ProjectFormDialog } from "@/components/projects/project-form-dialog"
import { deleteProject } from "@/actions/projects"
import type { ProjectWithCounts } from "@/lib/db/queries/projects"

export function ProjectsView({
  proyectos,
}: {
  proyectos: ProjectWithCounts[]
}) {
  const router = useRouter()
  const [formAbierto, setFormAbierto] = React.useState(false)
  const [editando, setEditando] = React.useState<ProjectWithCounts | null>(null)
  const [aBorrar, setABorrar] = React.useState<ProjectWithCounts | null>(null)
  const [borrando, setBorrando] = React.useState(false)

  function abrirNuevo() {
    setEditando(null)
    setFormAbierto(true)
  }

  function abrirEdicion(proyecto: ProjectWithCounts) {
    setEditando(proyecto)
    setFormAbierto(true)
  }

  async function confirmarBorrado() {
    if (!aBorrar) return

    setBorrando(true)
    const resultado = await deleteProject(aBorrar.id)
    setBorrando(false)

    if (!resultado.ok) {
      toast.add({ title: resultado.error, type: "error" })

      return
    }

    toast.add({ title: "Proyecto borrado", type: "success" })
    setABorrar(null)
    router.refresh()
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={abrirNuevo}>
          <FolderPlusIcon data-icon="inline-start" />
          Nuevo proyecto
        </Button>
      </div>

      {proyectos.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderPlusIcon />
            </EmptyMedia>
            <EmptyTitle>Todavía no tenés proyectos</EmptyTitle>
            <EmptyDescription>
              Los proyectos agrupan tus problemas y se pueden vincular a un
              repositorio de GitHub.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={abrirNuevo}>Crear el primero</Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {proyectos.map((proyecto) => (
            <Card key={proyecto.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-3 shrink-0 rounded-full bg-muted-foreground"
                      style={
                        proyecto.color
                          ? { backgroundColor: proyecto.color }
                          : undefined
                      }
                    />
                    <CardTitle className="truncate">{proyecto.name}</CardTitle>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Acciones de ${proyecto.name}`}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          onClick={() => abrirEdicion(proyecto)}
                        >
                          <PencilIcon />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setABorrar(proyecto)}
                        >
                          <Trash2Icon />
                          Borrar
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {proyecto.description ? (
                  <CardDescription className="line-clamp-2">
                    {proyecto.description}
                  </CardDescription>
                ) : null}
              </CardHeader>

              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {proyecto.openIssues} abiertos
                  </Badge>
                  <Badge variant="outline">
                    {proyecto.totalIssues} en total
                  </Badge>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Link
                    href={`/problemas?proyecto=${proyecto.slug}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    Ver problemas
                  </Link>

                  {proyecto.githubRepoFullName ? (
                    <a
                      href={`https://github.com/${proyecto.githubRepoFullName}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
                    >
                      {proyecto.githubRepoFullName}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ProjectFormDialog
        open={formAbierto}
        onOpenChange={setFormAbierto}
        proyecto={editando}
      />

      <AlertDialog
        open={aBorrar !== null}
        onOpenChange={(abierto) => !abierto && setABorrar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar «{aBorrar?.name}»?</AlertDialogTitle>
            <AlertDialogDescription>
              {aBorrar && aBorrar.totalIssues > 0
                ? `Sus ${aBorrar.totalIssues} problemas NO se borran: quedan sin proyecto y los podés reasignar.`
                : "Esta acción no se puede deshacer."}
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
