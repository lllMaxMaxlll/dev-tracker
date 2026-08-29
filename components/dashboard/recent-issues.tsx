import Link from "next/link"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  EstadoBadge,
  PrioridadBadge,
  ProyectoBadge,
} from "@/components/issues/issue-badges"
import { haceCuanto } from "@/lib/utils/fechas"
import type { IssueListItem } from "@/lib/db/queries/issues"

export function RecentIssues({ issues }: { issues: IssueListItem[] }) {
  if (issues.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin actividad todavía</EmptyTitle>
          <EmptyDescription>
            Cargá tu primer problema con la tecla C.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col divide-y">
      {issues.map((issue) => (
        <li key={issue.id} className="flex flex-col gap-1 py-3 first:pt-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              #{issue.number}
            </span>
            <Link
              href={`/problemas/${issue.number}`}
              className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
            >
              {issue.title}
            </Link>
            <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
              {haceCuanto(issue.updatedAt)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EstadoBadge estado={issue.status} />
            <PrioridadBadge prioridad={issue.priority} />
            <ProyectoBadge
              nombre={issue.projectName}
              color={issue.projectColor}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
