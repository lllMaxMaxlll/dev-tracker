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

// Monitor de consumo. Los valores van en inglés porque nunca se renderizan
// crudos: la etiqueta que ve el usuario sale de lib/monitor/metrics.ts.
export const usageSourceEnum = pgEnum("usage_source", [
  "vercel",
  "supabase",
  "openrouter",
  // El monitor como fuente de datos sobre sí mismo: es lo que permite que la
  // regla de "hace rato que no se recolecta" viva en la misma tabla que las
  // demás en vez de ser un caso aparte.
  "monitor",
])

// Cómo se combinan los valores de varios días. `maximo` existe para el disco:
// en un mes lo que importa es el pico, no el último valor ni la suma.
export const usageAggregationEnum = pgEnum("usage_aggregation", [
  "suma",
  "ultimo",
  "maximo",
])

export const alertWindowEnum = pgEnum("alert_window", ["dia", "mes"])

export const alertThresholdKindEnum = pgEnum("alert_threshold_kind", [
  "absoluto",
  "porcentaje_cuota",
])

// `pendiente` no es sólo el estado inicial: es al que se vuelve cuando
// Telegram no aceptó el mensaje, para que la corrida siguiente reintente.
export const alertEventStatusEnum = pgEnum("alert_event_status", [
  "pendiente",
  "enviada",
  "fallida",
])

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
    // Texto y no el enum a propósito: el historial es un registro de lo que
    // pasó. Si un estado se saca de la app, las filas viejas tienen que poder
    // seguir diciendo la verdad en vez de reescribirse.
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
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
  // Modelos de Workers AI con function calling: glm-4.7-flash es barato y
  // rápido para estructurar, gpt-oss-120b razona mejor para los resúmenes.
  defaultModel: text("default_model")
    .notNull()
    .default("@cf/zai-org/glm-4.7-flash"),
  fastModel: text("fast_model"),
  reasoningModel: text("reasoning_model").default("@cf/openai/gpt-oss-120b"),
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
// Monitor de consumo.
//
// Estas cinco tablas son las únicas del esquema SIN `user_id`, a propósito: no
// describen a un usuario sino a la infraestructura de la instancia — los
// proyectos de las cuentas de Vercel y Supabase, cuyas credenciales son
// variables de entorno. Una columna `user_id` acá sería decorativa y peor que
// no tenerla: invitaría a filtrar por ella y a creer que hay aislamiento donde
// no lo hay. Quién puede ver la página lo decide `requireUser()` más la
// whitelist, no una columna.
//
// La contracara está en la migración 0005: RLS habilitado, sin policies y sin
// FORCE. Ahí está explicado el porqué de cada mitad.
// ─────────────────────────────────────────────────────────────────────────────

// monitored_resources — un proyecto de Vercel, uno de Supabase, o la cuenta
// entera de OpenRouter. El catálogo se descubre solo en cada recolección.
export const monitoredResources = pgTable(
  "monitored_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: usageSourceEnum("source").notNull(),
    // projectId de Vercel, ref de Supabase, o "cuenta" cuando el recurso no es
    // un proyecto sino la cuenta completa.
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    organization: text("organization"),
    // Tal cual lo devuelve el proveedor (ACTIVE_HEALTHY, INACTIVE, PAUSING…).
    // No lo mapeamos a un enum propio: la lista la maneja ellos y cambia.
    status: text("status"),
    // Plan del proveedor, detectado en cada recolección: Supabase lo expone en
    // /v1/organizations/{slug} y Vercel en /v2/teams. Se detecta en vez de
    // preguntarse porque un plan mal declarado a mano haría que las barras y
    // los excedentes mientan sin que nadie lo note.
    plan: text("plan"),
    metadata: jsonb("metadata"),
    active: boolean("active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncOk: boolean("last_sync_ok"),
    // Alimenta el cartel de la UI: sin esto, una fuente rota es
    // indistinguible de una fuente sin consumo.
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("monitored_resources_source_external_idx").on(
      t.source,
      t.externalId
    ),
  ]
)

// usage_snapshots — la serie histórica, en formato largo.
//
// INVARIANTE: `value` es siempre el valor ABSOLUTO del día, nunca un delta.
// Es lo que vuelve idempotente al cron: corra una vez o veinte, el upsert
// sobre (resource_id, metric, day) deja la misma fila. Un colector que
// devolviera deltas los duplicaría o los perdería según cómo esté escrito el
// ON CONFLICT.
//
// `metric` es text y no un enum porque cada métrica nueva que aparezca en el
// JSONL de Vercel pediría una migración; el tipado lo pone TypeScript con el
// catálogo de lib/monitor/metrics.ts. Mismo criterio que github_cache.cache_key.
//
// La cuota del plan NO vive acá: ninguna API la devuelve, así que sería una
// constante repetida una vez por día y por métrica. Está en
// lib/monitor/quotas.ts.
export const usageSnapshots = pgTable(
  "usage_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => monitoredResources.id, { onDelete: "cascade" }),
    metric: text("metric").notNull(),
    day: date("day").notNull(),
    // numeric y no real: los bytes de disco pasan holgados los 2^53.
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    unit: text("unit").notNull(),
    aggregation: usageAggregationEnum("aggregation").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("usage_snapshots_resource_metric_day_idx").on(
      t.resourceId,
      t.metric,
      t.day
    ),
    index("usage_snapshots_metric_day_idx").on(t.metric, t.day.desc()),
    index("usage_snapshots_resource_day_idx").on(t.resourceId, t.day.desc()),
  ]
)

// alert_rules — los umbrales. La migración siembra un puñado por defecto: un
// monitor que no alerta hasta que alguien entra a configurarlo no sirve.
export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: usageSourceEnum("source").notNull(),
    // null = la regla aplica a todos los recursos de la fuente.
    resourceId: uuid("resource_id").references(() => monitoredResources.id, {
      onDelete: "cascade",
    }),
    metric: text("metric").notNull(),
    thresholdKind: alertThresholdKindEnum("threshold_kind").notNull(),
    // USD, bytes, peticiones… o 0–100 si el tipo es porcentaje_cuota.
    threshold: numeric("threshold", { precision: 20, scale: 6 }).notNull(),
    // `window` a secas es palabra reservada en SQL.
    windowKind: alertWindowEnum("window_kind").notNull().default("mes"),
    label: text("label").notNull(),
    active: boolean("active").notNull().default(true),
    silencedUntil: timestamp("silenced_until", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("alert_rules_source_metric_idx").on(t.source, t.metric)]
)

// alert_events — una fila por regla y período. El UNIQUE es lo que evita que
// el cron horario mande la misma alerta veinte veces.
//
// La fila nace `pendiente` y pasa a `enviada` recién cuando Telegram la
// aceptó. Si se insertara ya como enviada y el envío fallara, el UNIQUE
// impediría reintentar en todo el período: la alerta se perdería sin que nadie
// se entere, que es exactamente lo que un monitor no puede hacer.
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    // "2026-09-17" o "2026-09" según window_kind.
    periodKey: text("period_key").notNull(),
    value: numeric("value", { precision: 20, scale: 6 }).notNull(),
    // El umbral vigente al disparar, no el actual: si después se cambia la
    // regla, el histórico tiene que seguir contando lo que realmente pasó.
    threshold: numeric("threshold", { precision: 20, scale: 6 }).notNull(),
    message: text("message").notNull(),
    status: alertEventStatusEnum("status").notNull().default("pendiente"),
    attempts: integer("attempts").notNull().default(0),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("alert_events_rule_period_idx").on(t.ruleId, t.periodKey),
    index("alert_events_status_idx").on(t.status, t.triggeredAt.desc()),
  ]
)

// plan_quotas — cuánto incluye cada plan y cuánto cuesta pasarse.
//
// Ninguna de las APIs devuelve los topes del plan: sólo el consumo. Sin esta
// tabla no hay contra qué calcular un porcentaje ni un excedente.
//
// Es configurable desde /consumo a propósito. Los precios y los límites de los
// proveedores cambian, y un número codificado en el código envejece en silencio
// mientras la barra sigue mostrándose igual de convincente. Acá al menos queda
// claro que el valor lo declaró alguien y cuándo.
export const planQuotas = pgTable(
  "plan_quotas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: usageSourceEnum("source").notNull(),
    // Texto y no enum: cada proveedor nombra sus planes distinto ("hobby",
    // "free", "pro", "team", "enterprise") y agregan planes nuevos.
    plan: text("plan").notNull(),
    metric: text("metric").notNull(),
    // Incluido en el plan, en la unidad canónica de la métrica (bytes,
    // peticiones…). La UI hace la conversión a GB para escribirlo.
    included: numeric("included", { precision: 20, scale: 6 }).notNull(),
    // Precio del excedente por cada `overage_block` unidades canónicas. Nulo
    // cuando el plan no cobra excedente sino que corta: en el Free de Supabase
    // pasarse del tamaño de base bloquea la escritura, no genera una factura.
    overagePriceUsd: numeric("overage_price_usd", { precision: 12, scale: 6 }),
    // Cuántas unidades canónicas cubre ese precio. Para "$0,125 por GB" son
    // 1073741824. Guardar el precio por byte daría un número ilegible y con
    // pérdida de precisión al redondear.
    overageBlock: numeric("overage_block", { precision: 20, scale: 6 })
      .notNull()
      .default("1"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("plan_quotas_source_plan_metric_idx").on(
      t.source,
      t.plan,
      t.metric
    ),
  ]
)

// monitor_settings — preferencias del panel, clave/valor.
//
// Hoy guarda una sola cosa: con las cuotas de qué plan mirar cada fuente
// ("plan_vista:supabase" → "pro"). Sirve para responder "¿cómo se vería mi
// consumo si estuviera en Pro?" sin cambiar de plan, y por defecto vale el plan
// detectado en `monitored_resources.plan`.
//
// Clave/valor y no una columna por preferencia porque es una tabla de una fila
// por ajuste: una columna nueva por cada toggle sería una migración por toggle.
export const monitorSettings = pgTable("monitor_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// sync_runs — quién vigila al vigilante.
//
// `monitored_resources.last_sync_at` no alcanza: no distingue "corrió y no
// había datos" de "no corrió". Un monitor que deja de recolectar en silencio
// es peor que no tener monitor, porque da confianza falsa. Sobre esta tabla se
// arma la regla `sync_stale`.
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: usageSourceEnum("source").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok").notNull(),
    // La corrida no llegó a pedir nada porque todavía no se cumplió la
    // cadencia del colector. No es un fallo.
    skipped: boolean("skipped").notNull().default(false),
    resources: integer("resources").notNull().default(0),
    rowsWritten: integer("rows_written").notNull().default(0),
    error: text("error"),
  },
  (t) => [
    index("sync_runs_source_started_idx").on(t.source, t.startedAt.desc()),
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

export type AiTaskKind = (typeof aiTaskKindEnum.enumValues)[number]
export type IssueType = (typeof issueTypeEnum.enumValues)[number]
export type IssuePriority = (typeof issuePriorityEnum.enumValues)[number]
export type IssueStatus = (typeof issueStatusEnum.enumValues)[number]

export type MonitoredResource = typeof monitoredResources.$inferSelect
export type NewMonitoredResource = typeof monitoredResources.$inferInsert
export type UsageSnapshot = typeof usageSnapshots.$inferSelect
export type NewUsageSnapshot = typeof usageSnapshots.$inferInsert
export type AlertRule = typeof alertRules.$inferSelect
export type NewAlertRule = typeof alertRules.$inferInsert
export type AlertEvent = typeof alertEvents.$inferSelect
export type SyncRun = typeof syncRuns.$inferSelect
export type PlanQuota = typeof planQuotas.$inferSelect
export type MonitorSetting = typeof monitorSettings.$inferSelect
export type NewPlanQuota = typeof planQuotas.$inferInsert

export type UsageSource = (typeof usageSourceEnum.enumValues)[number]
export type UsageAggregation = (typeof usageAggregationEnum.enumValues)[number]
export type AlertWindow = (typeof alertWindowEnum.enumValues)[number]
export type AlertThresholdKind =
  (typeof alertThresholdKindEnum.enumValues)[number]
export type AlertEventStatus = (typeof alertEventStatusEnum.enumValues)[number]
