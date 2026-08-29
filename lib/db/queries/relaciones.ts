import "server-only"

import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { issueRelations } from "@/lib/db/schema"

export async function getRelacionesDeIssue(userId: string, issueId: string) {
  return db
    .select()
    .from(issueRelations)
    .where(
      and(
        eq(issueRelations.userId, userId),
        eq(issueRelations.issueId, issueId)
      )
    )
}
