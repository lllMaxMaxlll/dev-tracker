import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSchema,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core"
import { relations, sql } from "drizzle-orm"

// ─────────────────────────────────────────────────────────────────────────────
// Referencia al esquema `auth` de Supabase.
// Sólo lo declaramos para poder crear las foreign keys; drizzle-kit no lo
// gestiona (ver `schemaFilter` en drizzle.config.ts).
// ─────────────────────────────────────────────────────────────────────────────
const authSchema = pgSchema("auth")

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
})

// ─────────────────────────────────────────────────────────────────────────────
// Enums de dominio.
// Los valores van en español porque se muestran directamente en la interfaz.
// ─────────────────────────────────────────────────────────────────────────────
export const issueTypeEnum = pgEnum("issue_type", [
  "bug",
  "feature",
  "mejora",
  "idea",
  "deuda_tecnica",
])

export const issuePriorityEnum = pgEnum("issue_priority", [
  "baja",
  "media",
  "alta",
  "urgente",
])

export const issueStatusEnum = pgEnum("issue_status", [
  "pendiente",
  "en_progreso",
  "bloqueado",
  "resuelto",
  "descartado",
])

export const issueSourceEnum = pgEnum("issue_source", ["manual", "ai_capture"])

export const statusChangeSourceEnum = pgEnum("status_change_source", [
  "manual",
  "ai_suggestion_accepted",
  "system",
])

export const linkKindEnum = pgEnum("link_kind", ["commit", "pr"])

export const relationKindEnum = pgEnum("relation_kind", [
  "duplicado",
  "relacionado",
  "bloquea",
  "bloqueado_por",
])

export const suggestionStatusEnum = pgEnum("suggestion_status", [
  "pendiente",
  "aceptada",
  "rechazada",
])

export const aiTaskKindEnum = pgEnum("ai_task_kind", [
  "capture",
  "commit_link",
  "summary",
  "prioritize",
  "enrich",
  "insights",
  "embedding",
])

export const aiModelRoleEnum = pgEnum("ai_model_role", [
  "fast",
  "reasoning",
  "embedding",
])

export const summarySourceEnum = pgEnum("summary_source", ["cron", "manual"])

// Columnas comunes a todas las tablas de dominio.
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}

const userId = uuid("user_id")
  .notNull()
  .references(() => authUsers.id, { onDelete: "cascade" })

// ─────────────────────────────────────────────────────────────────────────────
// profiles — espejo del usuario de Supabase Auth.
// ─────────────────────────────────────────────────────────────────────────────
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  githubLogin: text("github_login"),
  githubAvatarUrl: text("github_avatar_url"),
  displayName: text("display_name"),
  ...timestamps,
})

// ─────────────────────────────────────────────────────────────────────────────
// github_credentials — provider token de GitHub, cifrado.
// Supabase no persiste `provider_token` más allá de la respuesta inicial de la
// sesión, así que lo guardamos nosotros en el callback de OAuth.
// ─────────────────────────────────────────────────────────────────────────────
export const githubCredentials = pgTable("github_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  scopes: text("scopes")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isValid: boolean("is_valid").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  ...timestamps,
})

// ─────────────────────────────────────────────────────────────────────────────
// user_counters — numeración de issues por usuario ("#8").
// Se incrementa dentro de la misma transacción que el insert del issue, para
// evitar la condición de carrera de un `max(number) + 1`.
// ─────────────────────────────────────────────────────────────────────────────
export const userCounters = pgTable("user_counters", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  nextIssueNumber: integer("next_issue_number").notNull().default(1),
})

// ─────────────────────────────────────────────────────────────────────────────
// projects
// ─────────────────────────────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    color: text("color"),
    githubRepoFullName: text("github_repo_full_name"),
    githubRepoId: integer("github_repo_id"),
    isArchived: boolean("is_archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_user_slug_idx").on(t.userId, t.slug),
    index("projects_user_idx").on(t.userId),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// issues
// ─────────────────────────────────────────────────────────────────────────────
export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    type: issueTypeEnum("type").notNull().default("bug"),
    priority: issuePriorityEnum("priority").notNull().default("media"),
    status: issueStatusEnum("status").notNull().default("pendiente"),
    resolutionUrl: text("resolution_url"),
    resolutionKind: linkKindEnum("resolution_kind"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    firstInProgressAt: timestamp("first_in_progress_at", {
      withTimezone: true,
    }),
    createdVia: issueSourceEnum("created_via").notNull().default("manual"),
    kanbanOrder: real("kanban_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("issues_user_number_idx").on(t.userId, t.number),
    index("issues_user_status_idx").on(t.userId, t.status),
    index("issues_user_project_idx").on(t.userId, t.projectId),
    index("issues_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("issues_user_updated_idx").on(t.userId, t.updatedAt.desc()),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// issue_status_history — fuente de verdad para tiempos de resolución.
// ─────────────────────────────────────────────────────────────────────────────
export const issueStatusHistory = pgTable(
  "issue_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    fromStatus: issueStatusEnum("from_status"),
    toStatus: issueStatusEnum("to_status").notNull(),
    source: statusChangeSourceEnum("source").notNull().default("manual"),
    note: text("note"),
    changedAt: timestamp("changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("status_history_issue_idx").on(t.issueId, t.changedAt),
    index("status_history_user_changed_idx").on(t.userId, t.changedAt),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// issue_embeddings — pgvector. 1024 dims = @cf/baai/bge-m3 (Workers AI).
// ─────────────────────────────────────────────────────────────────────────────
export const issueEmbeddings = pgTable(
  "issue_embeddings",
  {
    issueId: uuid("issue_id")
      .primaryKey()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId,
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    contentHash: text("content_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("issue_embeddings_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops")
    ),
    index("issue_embeddings_user_idx").on(t.userId),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// issue_relations
// ─────────────────────────────────────────────────────────────────────────────
export const issueRelations = pgTable(
  "issue_relations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    relatedIssueId: uuid("related_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    kind: relationKindEnum("kind").notNull().default("relacionado"),
    similarity: real("similarity"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("issue_relations_unique_idx").on(
      t.userId,
      t.issueId,
      t.relatedIssueId
    ),
    index("issue_relations_issue_idx").on(t.issueId),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// issue_links — commits y PRs vinculados a un problema.
// ─────────────────────────────────────────────────────────────────────────────
export const issueLinks = pgTable(
  "issue_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    kind: linkKindEnum("kind").notNull(),
    url: text("url").notNull(),
    repoFullName: text("repo_full_name"),
    sha: text("sha"),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("issue_links_issue_idx").on(t.issueId)]
)

// ─────────────────────────────────────────────────────────────────────────────
// commit_link_suggestions — propuestas de la IA, nunca aplicadas solas.
// ─────────────────────────────────────────────────────────────────────────────
export const commitLinkSuggestions = pgTable(
  "commit_link_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    repoFullName: text("repo_full_name").notNull(),
    commitSha: text("commit_sha").notNull(),
    commitUrl: text("commit_url").notNull(),
    commitMessage: text("commit_message"),
    confidence: real("confidence").notNull(),
    rationale: text("rationale"),
    status: suggestionStatusEnum("status").notNull().default("pendiente"),
    model: text("model"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("commit_suggestions_unique_idx").on(
      t.userId,
      t.issueId,
      t.commitSha
    ),
    index("commit_suggestions_status_idx").on(t.userId, t.status),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// weekly_summaries
// ─────────────────────────────────────────────────────────────────────────────
export const weeklySummaries = pgTable(
  "weekly_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    weekStart: date("week_start").notNull(),
    weekEnd: date("week_end").notNull(),
    contentMd: text("content_md").notNull(),
    stats: jsonb("stats"),
    model: text("model"),
    generatedBy: summarySourceEnum("generated_by").notNull().default("cron"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("weekly_summaries_user_week_idx").on(t.userId, t.weekStart),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// insights_cache — como mucho una regeneración por día.
// ─────────────────────────────────────────────────────────────────────────────
export const insightsCache = pgTable(
  "insights_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    kind: text("kind").notNull().default("dashboard_insights"),
    contentMd: text("content_md").notNull(),
    inputFingerprint: text("input_fingerprint"),
    model: text("model"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("insights_cache_user_kind_idx").on(t.userId, t.kind)]
)

// ─────────────────────────────────────────────────────────────────────────────
// user_ai_settings — una fila por usuario.
// `null` en fastModel/reasoningModel significa "heredar de defaultModel".
// ─────────────────────────────────────────────────────────────────────────────
export const userAiSettings = pgTable("user_ai_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => authUsers.id, { onDelete: "cascade" }),
  openrouterApiKeyEncrypted: text("openrouter_api_key_encrypted"),
  defaultModel: text("default_model")
    .notNull()
    .default("anthropic/claude-3.5-haiku"),
  fastModel: text("fast_model"),
  reasoningModel: text("reasoning_model"),
  embeddingProvider: text("embedding_provider").notNull().default("workers-ai"),
  embeddingModel: text("embedding_model").notNull().default("@cf/baai/bge-m3"),
  embeddingDimensions: integer("embedding_dimensions").notNull().default(1024),
  fastTemperature: real("fast_temperature").notNull().default(0.2),
  fastMaxTokens: integer("fast_max_tokens").notNull().default(1024),
  reasoningTemperature: real("reasoning_temperature").notNull().default(0.7),
  reasoningMaxTokens: integer("reasoning_max_tokens").notNull().default(2048),
  requireToolCalling: boolean("require_tool_calling").notNull().default(true),
  ...timestamps,
})

// ─────────────────────────────────────────────────────────────────────────────
// ai_usage_log — alimenta el panel de consumo mensual.
// `neurons` existe porque Workers AI factura en Neurons y no en dólares por
// token: sin esta columna el panel mezclaría unidades distintas.
// ─────────────────────────────────────────────────────────────────────────────
export const aiUsageLog = pgTable(
  "ai_usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    task: aiTaskKindEnum("task").notNull(),
    provider: text("provider").notNull().default("openrouter"),
    model: text("model").notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    neurons: real("neurons"),
    estimatedCostUsd: numeric("estimated_cost_usd", {
      precision: 12,
      scale: 6,
    }),
    latencyMs: integer("latency_ms"),
    success: boolean("success").notNull().default(true),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ai_usage_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("ai_usage_user_task_idx").on(t.userId, t.task),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// github_cache — respuestas de la API de GitHub, cacheadas por usuario.
//
// Va en Postgres y no en KV a propósito: el aislamiento por user_id sale
// gratis (con RLS como el resto), no suma un binding más que configurar, y se
// puede inspeccionar cuando algo no cuadra. Los payloads son chicos.
// ─────────────────────────────────────────────────────────────────────────────
export const githubCache = pgTable(
  "github_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId,
    cacheKey: text("cache_key").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("github_cache_user_key_idx").on(t.userId, t.cacheKey),
    index("github_cache_expires_idx").on(t.expiresAt),
  ]
)

// ─────────────────────────────────────────────────────────────────────────────
// Relaciones (para las queries relacionales de Drizzle).
// ─────────────────────────────────────────────────────────────────────────────
export const projectsRelations = relations(projects, ({ many }) => ({
  issues: many(issues),
}))

export const issuesRelations = relations(issues, ({ one, many }) => ({
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
  statusHistory: many(issueStatusHistory),
  links: many(issueLinks),
  embedding: one(issueEmbeddings, {
    fields: [issues.id],
    references: [issueEmbeddings.issueId],
  }),
}))

export const issueStatusHistoryRelations = relations(
  issueStatusHistory,
  ({ one }) => ({
    issue: one(issues, {
      fields: [issueStatusHistory.issueId],
      references: [issues.id],
    }),
  })
)

export const issueLinksRelations = relations(issueLinks, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLinks.issueId],
    references: [issues.id],
  }),
}))

// ─────────────────────────────────────────────────────────────────────────────
// Tipos inferidos.
// ─────────────────────────────────────────────────────────────────────────────
export type Profile = typeof profiles.$inferSelect
export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
export type Issue = typeof issues.$inferSelect
export type NewIssue = typeof issues.$inferInsert
export type IssueStatusHistoryEntry = typeof issueStatusHistory.$inferSelect
export type IssueLink = typeof issueLinks.$inferSelect
export type UserAiSettings = typeof userAiSettings.$inferSelect
export type AiUsageLogEntry = typeof aiUsageLog.$inferSelect
export type WeeklySummary = typeof weeklySummaries.$inferSelect

export type IssueType = (typeof issueTypeEnum.enumValues)[number]
export type IssuePriority = (typeof issuePriorityEnum.enumValues)[number]
export type IssueStatus = (typeof issueStatusEnum.enumValues)[number]
