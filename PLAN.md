# DevTracker — Plan de implementación

> Dashboard personal para registrar problemas, bugs e ideas de desarrollo, integrado con GitHub y con una capa de IA sobre OpenRouter.
> Documento de planificación. **No incluye código**: define arquitectura, esquema, orden de trabajo y criterios de verificación por fase.

**Decisiones tomadas** (29/08/2026):
- **Hosting: Coolify** en servidor propio (sección 10). Cloudflare Workers queda documentado como alternativa en la sección 11, descartado por ahora.
- Como corremos en un proceso Node de larga vida, se usa **`proxy.ts`** (la convención nueva de Next 16) y conexión directa a Postgres, sin los workarounds que exigiría Workers.
- **Supabase self-hosted** en el mismo equipo que Coolify (Supabase en el puerto 8000, Coolify en el 8001). Ver sección 1.10.
- **Embeddings: Cloudflare Workers AI (`@cf/baai/bge-m3`) por REST** (sección 1.5) — es independiente del hosting, así que probamos Workers AI sin atarnos a desplegar en Workers.
- Workers AI queda además disponible como **proveedor secundario para las tareas `fast`** de la capa de IA, con OpenRouter como principal (sección 11.4).

---

## 0. Estado de la base actual

Lo que ya existe en el repo (verificado):

| Elemento | Estado |
|---|---|
| Next.js | `16.2.6` (App Router) |
| React | `19.2.4` |
| TypeScript | `^5`, `strict: true`, alias `@/*` → raíz |
| Tailwind | v4 (vía `@tailwindcss/postcss`, sin `tailwind.config`) |
| shadcn/ui | `components.json` con estilo **`base-nova`** → los componentes se generan sobre **Base UI** (`@base-ui/react`), no Radix |
| Tema | `next-themes` + `components/theme-provider.tsx` ya instalados |
| Componentes | sólo `components/ui/button.tsx` |
| Gestor de paquetes | **bun** (`bun.lock`) |
| Scripts | `dev`, `build`, `start`, `lint`, `format`, `typecheck` |

### Advertencias de la versión de Next instalada (importantes)

`AGENTS.md` avisa que esta versión de Next tiene *breaking changes* respecto de lo conocido. Verificado en `node_modules/next/dist/docs/`:

1. **`middleware.ts` está deprecado y se renombró a `proxy.ts`.** El archivo va en la raíz, exporta una función `proxy` (default o nombrada) y su `config.matcher`. Todo lo que el pedido llama "middleware de sesión" se implementa en `proxy.ts`.
2. **Modelo de caché nuevo**: con `cacheComponents: true` en `next.config.ts` se usa la directiva `'use cache'` + `cacheLife(...)` en lugar de `export const revalidate`. Es el mecanismo que vamos a usar para cachear GitHub y la lista de modelos de OpenRouter.
3. Antes de escribir código de cada fase se leen los docs locales correspondientes en `node_modules/next/dist/docs/` (proxy, use-cache, route handlers, server actions).

---

## 1. Decisiones de arquitectura (y sus porqués)

### 1.1 Dos caminos de acceso a datos, a propósito

- **Supabase JS (`@supabase/ssr`)** → **sólo autenticación**: intercambio de código OAuth, sesión en cookies, `getUser()`, logout. Nunca se usa para leer/escribir tablas de dominio.
- **Drizzle ORM sobre Postgres** → **todas las consultas de dominio**. Conexión directa a la base de Supabase con el driver `postgres` (postgres-js).
  - Runtime: al correr en Coolify el proceso de Node es **largo y único** (no serverless), así que se usa **conexión directa** con un pool chico (`max: 10`) y prepared statements activos. La variable `DATABASE_URL` apunta a la conexión directa (`:5432`).
  - Si en algún momento se escala a varias réplicas o se vuelve a un entorno serverless, se cambia `DATABASE_URL` al **transaction pooler** (`:6543`, `prepare: false`) sin tocar código: la decisión vive en `lib/db/index.ts` leyendo la URL.
  - Migraciones (`drizzle-kit`): siempre conexión directa (`DIRECT_URL`).

### 1.2 RLS: para qué sirve realmente acá

Drizzle se conecta con el rol `postgres` / usuario de la base, que **bypassea RLS**. Por lo tanto:

- **La barrera real de aislamiento es la aplicación**: *toda* consulta de dominio filtra por el `user_id` de la sesión verificada en el servidor. Se centraliza en un helper `requireUser()` que devuelve el usuario o redirige a `/login`, y en un patrón de repositorio donde ninguna query se escribe sin `eq(tabla.userId, userId)`.
- **RLS es defensa en profundidad**: protege la superficie PostgREST/anon de Supabase (la `anon key` es pública y llega al navegador). Sin RLS, cualquiera con la anon key podría leer las tablas por la API REST de Supabase. Con RLS y políticas `auth.uid() = user_id`, no.
- Las políticas se versionan como SQL dentro de `drizzle/` (archivos de migración propios), no se aplican a mano desde el panel de Supabase.
- Se revoca el acceso del rol `anon` a las tablas de dominio como capa extra.

> Esto se documenta explícitamente en el README para que quede claro que "tengo RLS" no reemplaza el filtro por `user_id` en cada query.

### 1.3 Tokens y secretos

| Secreto | Dónde vive | Cómo |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | env de servidor | nunca `NEXT_PUBLIC_`, nunca importada en un componente cliente |
| Provider token de GitHub | tabla `github_credentials`, **cifrado** | AES-256-GCM con `ENCRYPTION_KEY` (32 bytes, base64) vía `node:crypto`; se guarda en el callback de OAuth porque Supabase no persiste `provider_token` más allá de la respuesta inicial de la sesión |
| API key propia de OpenRouter (por usuario) | tabla `user_ai_settings`, **cifrada** | mismo esquema de cifrado; fallback a `OPENROUTER_API_KEY` global |
| `CRON_SECRET` | env | validado en el route handler del cron (`Authorization: Bearer`) |

Módulo único `lib/crypto.ts` con `encrypt()` / `decrypt()`; el ciphertext guarda `iv:authTag:data` en base64 para poder rotar el formato después.

### 1.4 Expiración del token de GitHub

Los tokens OAuth de GitHub App expiran; los de OAuth App clásica no, pero pueden ser revocados. Estrategia:

- Se guarda `expires_at` (si viene) y `scopes` concedidos.
- Wrapper de Octokit que ante `401`/`403 bad credentials` marca la credencial como inválida (`is_valid = false`) y la UI muestra un banner "Reconectá tu cuenta de GitHub" que reinicia el flujo OAuth con `scopes: 'read:user repo'`.
- Los flujos de IA que dependen de commits degradan a "sin datos de GitHub" en vez de romper.

### 1.5 Embeddings: OpenRouter no tiene ese endpoint → Cloudflare Workers AI

**Riesgo detectado en el pedido.** OpenRouter es una API de *chat completions*; no ofrece `/v1/embeddings`. La detección de duplicados (punto 9) necesita embeddings reales.

**Opción elegida — Cloudflare Workers AI (`@cf/baai/bge-m3`)**

- **1024 dimensiones**, multilingüe de verdad (100+ idiomas), ventana de 60.000 tokens. Que sea multilingüe es clave: tus notas están en español y los modelos tipo `all-MiniLM-L6-v2` son sólo inglés y degradan bastante.
- **Gratis en la práctica**: 10.000 Neurons por día sin cargo, que se reinician a las 00:00 UTC. Pasado eso, $0,012 por millón de tokens de entrada. Un issue tuyo son ~50 tokens: el uso real queda muy por debajo del piso gratuito.
- **Se consume por REST**, con `CLOUDFLARE_ACCOUNT_ID` + un API token con permiso de Workers AI. Esto es importante: **no hace falta desplegar en Cloudflare para usarlo**. Funciona igual desde el server de Coolify que desde un Worker (donde además se usaría el binding `env.AI`, sin token).
- Cero infraestructura propia: nada de pesos en la imagen, nada de RAM extra, nada de descargas en el build.

**Alternativas contempladas**

| Opción | Veredicto |
|---|---|
| `@huggingface/transformers` local (`Xenova/multilingual-e5-small`, 384 dims) | Gratis y totalmente offline, pero +120 MB de imagen y ~350 MB de RAM. Queda como proveedor `local` para el caso "no quiero depender de nadie". **No funciona en Workers** (onnxruntime-node es binario nativo) |
| Ollama en contenedor aparte (`bge-m3`, 1024 dims) | Misma calidad que Workers AI y totalmente local, pero +2 GB de imagen y ~1 GB de RAM ociosa. Ventaja: mismas 1024 dims → **intercambiable sin migración** |
| Gemini / Cohere / Voyage free tier | Gratis con rate limits, pero otra cuenta más |
| OpenAI `text-embedding-3-small` | Barato, no gratis, y suma una segunda cuenta paga |
| Sólo `pg_trgm` (léxico) | Cero infraestructura, pero no detecta "el login falla con mayúsculas" ≈ "problema de case sensitivity al iniciar sesión". Queda como **fallback automático** si el proveedor no responde |

`lib/ai/embeddings.ts` expone `embed(texts: string[]): Promise<number[][]>` detrás de `EMBEDDINGS_PROVIDER` (`workers-ai` | `ollama` | `local` | `openai`). Como `workers-ai` y `ollama` comparten las 1024 dims de bge-m3, se puede saltar entre ambos sin tocar el esquema.

### 1.6 pgvector: dimensiones e índices

- La dimensión de una columna `vector` es **fija a nivel esquema**: cambiar de modelo con otra dimensión es una migración, no un setting. Por eso la dimensión vive en un solo lugar (`lib/ai/embeddings.ts` + la migración) y Ajustes avisa en vez de romper.
- Columna **`vector(1024)`** (bge-m3) + índice **HNSW** con `vector_cosine_ops` (`m=16, ef_construction=64`), más columnas `embedding_model` y `embedding_dimensions` en la tabla para saber con qué se generó cada fila.
- 1024 dims entra cómodo en el límite de índice de pgvector y permite mover el proveedor entre Workers AI y Ollama (mismo modelo) sin migrar nada.
- Los índices HNSW/IVFFlat de pgvector soportan hasta **2000 dimensiones** sobre el tipo `vector`; si algún día se pasa a un modelo de 3072 hay que usar `halfvec` o reducir dimensiones.
- Si en Ajustes se elige un modelo con otra dimensión: se avisa con un mensaje claro, se genera la migración correspondiente y se ofrece **"Regenerar embeddings"** (job por lotes con progreso). Nunca se mezclan vectores de modelos distintos en la misma columna.

### 1.7 Tareas programadas en Coolify (no Vercel Cron)

Coolify tiene **Scheduled Tasks** por recurso: un cron que ejecuta un comando dentro del contenedor de la aplicación. Reemplaza a Vercel Cron sin cambiar nada del diseño:

- Tarea programada con expresión `0 18 * * 5` (viernes 18:00) que hace un `curl` al route handler `/api/cron/weekly-summary` contra `localhost:3000`, con `Authorization: Bearer $CRON_SECRET`.
- Ventaja sobre Vercel: **no hay límite de una ejecución diaria** ni imprecisión de una hora; podés poner la frecuencia que quieras (por ejemplo, un reintento el sábado si el viernes falló).
- El endpoint sigue protegido por `CRON_SECRET` y sigue siendo **idempotente** por `(user_id, week_start)`: si ya existe el resumen de esa semana, no lo duplica.
- Botón "Generar resumen ahora" en la página Resúmenes (mismo código, disparo manual), para poder probarlo sin esperar al viernes.
- Alternativa equivalente si preferís no usar Scheduled Tasks: un contenedor `ofelia`/`cron` aparte en el mismo proyecto de Coolify pegándole al mismo endpoint.

### 1.8 Streaming

Server Actions no son el mejor camino para streaming de texto. Los resúmenes y los insights usan **route handlers** (`/api/ai/summary/stream`, `/api/ai/insights/stream`) que devuelven un `ReadableStream` desde el SDK de OpenAI en modo `stream: true`, consumidos desde el cliente. El resto de las operaciones de IA (estructuradas, con tool calling) son Server Actions normales.

### 1.9 shadcn con `base-nova`

Los componentes se agregan con `npx shadcn@latest add <componente>` y salen sobre Base UI. A tener en cuenta:

- **Charts**: el bloque `chart` de shadcn trae Recharts. Se verifica compatibilidad al agregarlo en Fase 3; si el registry `base-nova` no lo trae, se instala Recharts y se adapta el wrapper `ChartContainer`.
- **Drag & drop del kanban**: no hay componente shadcn para esto → **`@dnd-kit/core` + `@dnd-kit/sortable`**.
- **Tablas**: `@tanstack/react-table` + el `data-table` de shadcn.

### 1.10 Dónde vive Supabase: self-hosted, junto a Coolify

**Decidido**: Supabase corre **self-hosted en el mismo equipo que Coolify**.

| Servicio | Puerto |
|---|---|
| Supabase (gateway Kong) | **8000** |
| Coolify | **8001** |

El código de la app es idéntico al que usaría contra Supabase Cloud — sólo cambian variables de entorno. Pero hay cuatro diferencias operativas que no se ven desde el código y que conviene tener presentes:

**1. El proveedor de GitHub se configura por variables de entorno, no por dashboard.**
En Cloud es un toggle en Authentication → Providers. En self-hosted, GoTrue lee su configuración del `.env` del stack de Supabase:

```
GOTRUE_EXTERNAL_GITHUB_ENABLED=true
GOTRUE_EXTERNAL_GITHUB_CLIENT_ID=...
GOTRUE_EXTERNAL_GITHUB_SECRET=...
GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI=http://<host>:8000/auth/v1/callback
SITE_URL=https://devtracker.tu-dominio.com
ADDITIONAL_REDIRECT_URLS=http://localhost:3000/auth/callback,https://devtracker.tu-dominio.com/auth/callback
```

Hay que reiniciar el contenedor de `auth` después de cambiarlas.

**2. La callback del OAuth App de GitHub apunta al Supabase propio**, no a `*.supabase.co`:
`http://<host>:8000/auth/v1/callback`.

**3. ⚠️ `NEXT_PUBLIC_SUPABASE_URL` tiene que ser alcanzable desde el NAVEGADOR**, no sólo desde el contenedor de la app. `@supabase/ssr` usa la misma URL en el servidor y en el cliente, y el cliente la necesita para el redirect de OAuth y el refresco de token.

Esto choca de frente con un requisito del pedido: **anotar problemas desde el celular**. Si la URL es `http://192.168.x.x:8000`, la app sólo funciona dentro de la LAN. Para usarla desde afuera hace falta exponer Supabase con un dominio y TLS (Coolify puede ponerle un proxy con Let's Encrypt adelante, igual que a la app). **Recomendación**: darle a Supabase un subdominio propio (`https://supabase.tu-dominio.com`) desde el principio, en vez de usar `IP:8000`.

Detalle relacionado: sobre HTTP plano, las cookies de sesión no pueden ir con el flag `Secure`. Un dominio con TLS resuelve eso también.

**4. Sin pooler de Supabase Cloud**: `DATABASE_URL` apunta directo al Postgres del stack. Es justo lo que ya asume el plan (conexión directa, pool chico, prepared statements activos — sección 1.1).

Las extensiones `vector` y `pg_trgm` vienen en la imagen de Postgres de Supabase y las habilita la primera migración; en self-hosted el usuario de la base es superusuario, así que el `CREATE EXTENSION` funciona sin permisos extra.

---

## 2. Dependencias a instalar

```
# datos
@supabase/supabase-js @supabase/ssr
drizzle-orm postgres
drizzle-kit -D

# github
octokit

# ia
openai
zod
# embeddings: Workers AI se consume por REST, sin SDK (ver 1.5)
# @huggingface/transformers  — sólo si se elige el proveedor `local`

# ui / interacción
@tanstack/react-table
@dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
recharts            # si el registry no lo instala con el chart
sonner
cmdk                # command palette para la captura rápida
date-fns
react-markdown      # render de descripciones markdown (con sanitización)
```

Componentes shadcn a agregar (lista objetivo): `button card dialog dropdown-menu input textarea select label badge table tabs sheet skeleton sonner separator avatar tooltip popover command form checkbox switch slider scroll-area alert alert-dialog chart`.

---

## 3. Esquema de base de datos

Schema `public`, extensiones `vector` y `pg_trgm`. Todas las tablas de dominio: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `created_at`, `updated_at` con trigger.

### 3.1 Enums

| Enum | Valores |
|---|---|
| `issue_type` | `bug`, `feature`, `mejora`, `idea`, `deuda_tecnica` |
| `issue_priority` | `baja`, `media`, `alta`, `urgente` |
| `issue_status` | `pendiente`, `en_progreso`, `bloqueado`, `resuelto`, `descartado` |
| `ai_task_kind` | `capture`, `commit_link`, `summary`, `prioritize`, `enrich`, `insights`, `embedding` |
| `ai_model_role` | `fast`, `reasoning`, `embedding` |
| `link_kind` | `commit`, `pr` |
| `relation_kind` | `duplicado`, `relacionado`, `bloquea`, `bloqueado_por` |
| `suggestion_status` | `pendiente`, `aceptada`, `rechazada` |

### 3.2 Tablas

**`profiles`** — espejo del usuario de Auth
`id` (= `auth.users.id`, PK) · `email` · `github_login` · `github_avatar_url` · `display_name` · `created_at`
Se crea/actualiza (upsert) en el callback de OAuth.

**`github_credentials`**
`user_id` (PK) · `access_token_encrypted` · `refresh_token_encrypted` (nullable) · `scopes text[]` · `expires_at` (nullable) · `is_valid boolean default true` · `last_checked_at` · `updated_at`

**`projects`**
`id` · `user_id` · `name` · `slug` (único por usuario) · `description` · `color` · `github_repo_full_name` (`owner/repo`, nullable) · `github_repo_id` (nullable) · `is_archived` · timestamps
Índice único `(user_id, slug)`.

**`issues`**
`id` · `user_id` · `project_id` (nullable, `on delete set null`) · `number` (secuencial **por usuario**, para poder decir "#8") · `title` · `description` (markdown) · `type` · `priority` · `status` (default `pendiente`) · `resolution_url` (nullable) · `resolution_kind` (`link_kind`, nullable) · `resolved_at` (nullable) · `first_in_progress_at` (nullable) · `created_via` (`manual` | `ai_capture`) · `kanban_order` (numérico, para el orden dentro de la columna) · timestamps
Índices: `(user_id, status)`, `(user_id, project_id)`, `(user_id, created_at desc)`, GIN `pg_trgm` sobre `title`.
`number` se resuelve con una tabla `user_counters(user_id, next_issue_number)` actualizada dentro de la misma transacción del insert (evita race conditions de `max()+1`).

**`issue_status_history`**
`id` · `user_id` · `issue_id` · `from_status` (nullable) · `to_status` · `changed_at` · `note` (nullable) · `source` (`manual` | `ai_suggestion_accepted` | `system`)
Es la fuente de verdad para tiempos de resolución y para el resumen semanal. Se escribe **siempre** desde una única función de dominio `changeIssueStatus()`, nunca con un update suelto.

**`issue_embeddings`**
`issue_id` (PK) · `user_id` · `embedding vector(1024)` · `embedding_model` · `embedding_dimensions` · `content_hash` (para no regenerar si el texto no cambió) · `updated_at`
Índice HNSW `vector_cosine_ops` (`m=16, ef_construction=64`).

**`issue_relations`**
`id` · `user_id` · `issue_id` · `related_issue_id` · `kind` (`relation_kind`) · `similarity` (real, nullable) · `created_at`
Único `(user_id, issue_id, related_issue_id)`; check `issue_id <> related_issue_id`.

**`issue_links`** — commits/PRs vinculados (un issue puede tener varios)
`id` · `user_id` · `issue_id` · `kind` (`link_kind`) · `url` · `repo_full_name` · `sha` (nullable) · `title` (nullable) · `created_at`

**`commit_link_suggestions`**
`id` · `user_id` · `issue_id` · `repo_full_name` · `commit_sha` · `commit_url` · `commit_message` · `confidence` (real 0–1) · `rationale` · `status` (`suggestion_status`) · `model` · `created_at` · `resolved_at`
Único `(user_id, issue_id, commit_sha)` para no re-sugerir lo mismo.

**`weekly_summaries`**
`id` · `user_id` · `week_start` (date, lunes) · `week_end` · `content_md` · `stats jsonb` (conteos crudos usados) · `model` · `generated_at` · `generated_by` (`cron` | `manual`)
Único `(user_id, week_start)`.

**`insights_cache`**
`id` · `user_id` · `kind` (`dashboard_insights`) · `content_md` · `input_fingerprint` · `model` · `generated_at` · `expires_at`
Regeneración máxima 1 vez por día → se sirve el cacheado si `generated_at > now() - 24h`.

**`user_ai_settings`** — 1 fila por usuario
`user_id` (PK) · `openrouter_api_key_encrypted` (nullable) · `default_model` · `fast_model` (nullable = hereda) · `reasoning_model` (nullable = hereda) · `embedding_provider` · `embedding_model` · `embedding_dimensions` · `fast_temperature` · `fast_max_tokens` · `reasoning_temperature` · `reasoning_max_tokens` · `require_tool_calling boolean default true` · `updated_at`

**`ai_usage_log`**
`id` · `user_id` · `task` (`ai_task_kind`) · `model` · `provider` · `prompt_tokens` · `completion_tokens` · `total_tokens` · `estimated_cost_usd` (numeric 12,6) · `latency_ms` · `success boolean` · `error_message` (nullable) · `created_at`
Índices `(user_id, created_at desc)`, `(user_id, task)`. Alimenta el panel de consumo mensual.

**`github_cache`** (opcional, sólo si el caché de Next no alcanza)
`id` · `user_id` · `cache_key` · `payload jsonb` · `fetched_at` · `expires_at`. Se decide en Fase 4 tras medir el rate limit real.

### 3.3 RLS

Para cada tabla de dominio: `enable row level security` + 4 políticas (`select`, `insert`, `update`, `delete`) con `auth.uid() = user_id` (en `profiles`, `auth.uid() = id`). Más `revoke all on <tabla> from anon`.

Los archivos SQL de RLS viven en `drizzle/` con numeración correlativa a las migraciones generadas (`0001_..._rls.sql`) y se aplican con `drizzle-kit migrate`.

### 3.4 Lista blanca de acceso

`ALLOWED_EMAILS` y/o `ALLOWED_GITHUB_LOGINS` (CSV en env). Se valida en el callback de OAuth: si no está en la lista, se cierra la sesión y se redirige a `/login?error=not_allowed`. Si ambas variables están vacías, la instancia es abierta (útil en dev).

---

## 4. Estructura de carpetas objetivo

```
app/
  (auth)/login/page.tsx
  auth/callback/route.ts            # intercambio de code, upsert profile, guardar token GitHub, whitelist
  auth/signout/route.ts
  (app)/
    layout.tsx                      # shell: sidebar + topbar + user menu + captura rápida global
    page.tsx                        # Dashboard
    problemas/page.tsx              # tabla + kanban (tabs)
    problemas/[number]/page.tsx     # detalle
    proyectos/page.tsx
    github/page.tsx
    github/[owner]/[repo]/page.tsx
    resumenes/page.tsx
    ajustes/page.tsx                # modelos, API key, consumo
  api/
    cron/weekly-summary/route.ts
    ai/summary/stream/route.ts
    ai/insights/stream/route.ts
proxy.ts                            # (ex middleware) refresco de sesión + protección de rutas
components/
  ui/                               # shadcn
  layout/{app-sidebar,user-menu,theme-toggle}.tsx
  issues/{issue-table,issue-kanban,issue-form,issue-card,status-badge,...}.tsx
  capture/{quick-capture-dialog,voice-input}.tsx
  dashboard/{summary-cards,line-chart,bar-charts,recent-issues,insights-panel}.tsx
  github/{repo-list,commit-heatmap,pr-list,branch-list}.tsx
  settings/{model-picker,task-model-form,usage-panel}.tsx
lib/
  supabase/{client,server,admin}.ts
  db/{index,schema,queries/*}.ts
  auth/{require-user,whitelist}.ts
  crypto.ts
  github/{client,queries}.ts
  ai/
    client.ts                       # SDK OpenAI → baseURL OpenRouter + headers
    models.ts                       # catálogo cacheado + precios
    settings.ts                     # resolución de modelo por tarea
    embeddings.ts
    usage.ts                        # logging + costo estimado
    tasks/{capture,commit-link,summary,prioritize,enrich,insights}.ts
  schemas/                          # Zod compartido (issue, project, settings, ai-outputs)
  utils/                            # fechas, métricas, formateo
actions/
  issues.ts  projects.ts  ai.ts  settings.ts  github.ts
drizzle/                            # migraciones + SQL de RLS
```

Convención: los archivos en `actions/` son el **único** lugar con `'use server'` para mutaciones; validan con Zod, llaman a `requireUser()`, ejecutan la query filtrada por `user_id` y hacen `revalidatePath`.

---

## 5. Variables de entorno (`.env.example`)

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Base de datos (Drizzle)
DATABASE_URL=            # pooler :6543 ?pgbouncer=true  (runtime)
DIRECT_URL=              # directa :5432                 (migraciones)

# Cifrado de secretos en base (32 bytes base64)
ENCRYPTION_KEY=

# OpenRouter
OPENROUTER_API_KEY=
OPENROUTER_SITE_URL=     # HTTP-Referer
OPENROUTER_APP_NAME=DevTracker   # X-Title

# Embeddings — Cloudflare Workers AI por defecto (ver 1.5)
EMBEDDINGS_PROVIDER=workers-ai       # workers-ai | ollama | local | openai
EMBEDDINGS_MODEL=@cf/baai/bge-m3     # 1024 dims, multilingüe
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=                # permiso: Workers AI (Read)
# OLLAMA_BASE_URL=http://ollama:11434     # si EMBEDDINGS_PROVIDER=ollama
# HF_HOME=/app/.cache/huggingface         # si EMBEDDINGS_PROVIDER=local
# OPENAI_API_KEY=                          # si EMBEDDINGS_PROVIDER=openai

# Cron
CRON_SECRET=

# Acceso restringido (opcional)
ALLOWED_EMAILS=
ALLOWED_GITHUB_LOGINS=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000   # en prod: https://devtracker.tu-dominio.com
                                            # ⚠️ es build-time: Coolify la necesita como build arg
```

---

## 6. Fases

Cada fase termina con: `bun run typecheck` + `bun run lint` + `bun run build` en verde, y una **prueba manual** concreta descrita abajo. No se arranca la fase siguiente sin eso.

---

### Fase 1 — Base, esquema, RLS y login ✅ COMPLETADA

1. Instalar dependencias de datos/auth; agregar los componentes shadcn base (`card input label sonner dropdown-menu avatar skeleton dialog sheet separator`).
2. Configurar `next.config.ts` (`cacheComponents: true`) y el layout raíz en español (`<html lang="es">`), `ThemeProvider` con toggle y `<Toaster />` de sonner.
3. Supabase self-hosted ya corriendo en el puerto 8000 (ver 1.10): crear el GitHub OAuth App con la callback apuntando a ese Supabase, y configurar `GOTRUE_EXTERNAL_GITHUB_*`, `SITE_URL` y `ADDITIONAL_REDIRECT_URLS` en el `.env` del stack. Registrar las **dos** redirect URLs desde el principio (localhost y dominio de producción).
4. Drizzle: `drizzle.config.ts`, `lib/db/schema.ts` completo (sección 3), `bun drizzle-kit generate` + `migrate`. SQL de RLS versionado.
5. `@supabase/ssr`: cliente de navegador, cliente de servidor (con `cookies()`), y **`proxy.ts`** que refresca la sesión y redirige a `/login` si no hay usuario (matcher que excluye `_next/static`, `_next/image`, favicon y assets; `/login` y `/auth/*` públicos).
6. `/login`: pantalla mínima con un botón "Continuar con GitHub" (`signInWithOAuth` con `scopes: 'read:user repo'`, `redirectTo` al callback).
7. `/auth/callback`: `exchangeCodeForSession` → chequeo de whitelist → upsert de `profiles` → guardar el `provider_token` cifrado en `github_credentials` → redirigir a `/`.
8. Shell de la app: sidebar responsive, topbar, menú de usuario (avatar, nombre, cerrar sesión), toggle de tema.

**Verificación**: build ok; entrar sin sesión a `/` redirige a `/login`; login con GitHub crea fila en `profiles` y en `github_credentials`; logout funciona; un usuario B no ve datos de A (probado con la anon key contra PostgREST para confirmar que RLS bloquea).

**Resultado**: `typecheck`, `lint` y `build` en verde. Verificado en el navegador: `/` y `/problemas` sin sesión redirigen a `/login`; la pantalla de login renderiza en tema claro y oscuro y en 375px; los mensajes de error del callback se muestran. **Pendiente de verificar con credenciales reales de Supabase**: el round-trip completo de OAuth, la creación de filas en `profiles`/`github_credentials`, y que RLS bloquee el acceso vía PostgREST.

Desvíos respecto de lo planificado:
- **Toast**: el proyecto usa Base UI (`base: "base"`), así que va el componente `toast` de shadcn en vez de `sonner`.
- **Icono de GitHub**: lucide-react v1 dejó de incluir iconos de marca → componente propio en `components/icons/github.tsx`.
- **`lib/db/index.ts`**: la conexión es perezosa (Proxy sobre `getDb()`) para que `next build` no exija credenciales de base de datos.

---

### Fase 2 — CRUD de problemas y proyectos

1. Zod compartido: `issueSchema`, `projectSchema` (create/update), enums en español.
2. Server actions `actions/projects.ts` y `actions/issues.ts`: crear, editar, borrar, cambiar estado (`changeIssueStatus` escribe en `issue_status_history` en la misma transacción y setea `resolved_at`/`first_in_progress_at`).
3. Página **Proyectos**: lista, alta/edición en dialog, selector de repo de GitHub (en Fase 2 es un input de texto `owner/repo`; en Fase 4 pasa a ser un selector real con autocompletado).
4. Página **Problemas** con dos vistas en tabs, estado persistido en la URL (`?vista=tabla|kanban` + filtros como search params, así los filtros son compartibles y sobreviven al refresh):
   - **Tabla**: TanStack Table + data-table de shadcn, filtros por proyecto/tipo/estado/prioridad, búsqueda por texto, orden, paginación.
   - **Kanban**: 5 columnas por estado, dnd-kit, drag & drop con actualización optimista y server action de cambio de estado; rollback + toast de error si falla.
5. **Detalle** `/problemas/[number]`: markdown renderizado, edición inline, timeline de historial de estados, campo para vincular commit/PR, secciones vacías reservadas para "Relacionados" y IA (Fase 6).
6. Formulario de alta rápida en dialog, accesible desde cualquier página con atajo (`Ctrl/Cmd + K` abre command palette, `C` crea). En esta fase es el formulario manual; en Fase 5 se le suma el campo de lenguaje natural.
7. Skeletons y estados vacíos con copy en español; toasts de error.

**Verificación**: crear proyecto e issues, filtrar, buscar, arrastrar tarjetas entre columnas y ver el estado persistido tras recargar; el historial registra cada cambio; responsive en 375px.

---

### Fase 3 — Dashboard de métricas

1. `lib/db/queries/metrics.ts`: consultas SQL agregadas (no traer todo a JS):
   - abiertos (estado ≠ resuelto/descartado), resueltos en la semana actual, bloqueados;
   - tiempo promedio de resolución = `avg(resolved_at - created_at)` sobre resueltos de los últimos 90 días, expresado en días/horas legibles;
   - serie de 12 semanas: creados vs. resueltos por semana (`generate_series` para no perder semanas vacías);
   - distribución por tipo y por proyecto.
2. Agregar el `chart` de shadcn (verificar compatibilidad con `base-nova`; si hace falta, instalar Recharts y adaptar).
3. Componentes: 4 tarjetas resumen, gráfico de líneas (abiertos vs. resueltos), dos gráficos de barras (tipo, proyecto), lista de últimos problemas tocados (ordenados por `updated_at`).
4. Slots reservados para el bloque de insights de IA y el último resumen semanal (Fase 6).
5. Skeletons por sección con `<Suspense>`.

**Verificación**: build ok; los números coinciden con lo cargado a mano; los gráficos se leen bien en dark y light y en móvil.

---

### Fase 4 — Integración con GitHub

1. `lib/github/client.ts`: Octokit creado con el token descifrado del usuario; wrapper que detecta `401/403`, marca `is_valid = false` y lanza un error tipado que la UI traduce a "Reconectá GitHub".
2. Funciones de datos con `'use cache'` + `cacheLife` de ~10–15 min, con clave por usuario y repo: lista de repos, commits recientes, PRs abiertos/cerrados, issues del repo, ramas.
3. Página **GitHub**: lista de repos (buscable, con lenguaje, stars, última actualización, y marca de si ya está vinculado a un proyecto). Al seleccionar uno → `/github/[owner]/[repo]`:
   - commits recientes (mensaje, autor, fecha, link),
   - **heatmap** de frecuencia de commits estilo contribution graph (componente propio en SVG/grid con Tailwind, 53 semanas × 7 días, con tooltip),
   - PRs abiertos/cerrados,
   - issues del repo,
   - ramas activas con última actividad.
4. El selector de repo en el formulario de proyecto pasa a usar la lista real.
5. Mostrar el rate limit restante en un rincón de la página (útil para diagnosticar).

**Verificación**: build ok; los datos de un repo real cargan; segunda visita dentro de la ventana de caché no consume rate limit; revocar el token en GitHub muestra el banner de reconexión en vez de romper.

---

### Fase 5 — Capa de IA, Ajustes y captura en lenguaje natural

1. `lib/ai/client.ts`: SDK de OpenAI con `baseURL` de OpenRouter, `apiKey` = key del usuario (descifrada) o la global, y `defaultHeaders` con `HTTP-Referer` y `X-Title`. Timeout por request y reintento acotado.
2. `lib/ai/models.ts`: catálogo desde el endpoint de modelos de OpenRouter, cacheado (`'use cache'`, ~1 h), normalizado a `{ id, name, provider, contextLength, pricePerMTokenIn, pricePerMTokenOut, supportsTools }`.
3. `lib/ai/settings.ts`: lee `user_ai_settings`, resuelve el modelo efectivo por tarea (`fast` / `reasoning`, con herencia del default), temperatura y `max_tokens`.
4. `lib/ai/usage.ts`: envuelve cada llamada, mide latencia, lee `usage` de la respuesta, calcula costo estimado con los precios del catálogo y escribe en `ai_usage_log` (también cuando falla).
5. Contrato de salida estructurada: **siempre tool calling** + validación Zod del `arguments`. Si el modelo no soporta tools → error tipado `MODEL_NO_TOOL_SUPPORT` con mensaje claro y sugerencia de cambiar de modelo en Ajustes. Sin parseo de texto libre en ningún caso.
6. Página **Ajustes**:
   - selector de modelo con buscador (command), mostrando nombre, proveedor, contexto y precio in/out por millón de tokens;
   - filtro "sólo modelos con tool calling" y aviso si el elegido no lo soporta;
   - modelo por tarea (rápidas / razonamiento) con opción "heredar del default";
   - sliders de temperatura y máximo de tokens por tarea, con defaults razonables (rápidas: 0.2 / 1024; razonamiento: 0.7 / 2048);
   - API key propia de OpenRouter (input tipo password, se guarda cifrada, se muestra sólo como `sk-or-…últimos 4`, botón para borrarla);
   - configuración de embeddings (proveedor + modelo + dimensiones).
7. **Captura rápida en lenguaje natural** (funcionalidad prioritaria):
   - dialog global con atajo de teclado, un `textarea` único;
   - botón de dictado con Web Speech API (`webkitSpeechRecognition`), en español (`es-AR`), con degradación silenciosa si el navegador no la soporta;
   - server action que manda el texto + la lista de proyectos del usuario + los valores válidos de tipo/prioridad/estado, y recibe vía tool call `{ title, description, projectSlug|null, newProjectName|null, type, priority, status, confidence }` validado con Zod;
   - el resultado **precarga el formulario de alta** y no guarda nada hasta que confirmes;
   - si el proyecto mencionado no existe → chip "Crear proyecto «fischer»" que lo crea al confirmar;
   - estados de carga claros y manejo de error con toast + posibilidad de guardar igual a mano.

**Verificación**: build ok; frase del ejemplo ("el login se rompe cuando el mail tiene mayúsculas, es urgente, es del proyecto fischer") produce el formulario correcto; cambiar de modelo en Ajustes cambia el modelo usado; elegir un modelo sin tools muestra el aviso; cada llamada deja fila en `ai_usage_log` con tokens y costo.

---

### Fase 6 — IA avanzada, cron y consumo

**6.1 Duplicados y relacionados**
- Generación de embedding (título + descripción) al crear/editar, con `content_hash` para no regenerar de más.
- Antes de confirmar el alta: búsqueda por similitud de coseno (top 5, umbral configurable ~0.80) y aviso "esto se parece a #8, que descartaste hace un mes", con acciones: abrir / vincular como relacionado / ignorar y crear igual.
- Sección "Relacionados" en el detalle.
- Si cambia la dimensión del modelo de embeddings: aviso + acción "Regenerar embeddings" por lotes con barra de progreso.
- Fallback `pg_trgm` si no hay proveedor de embeddings configurado.

**6.2 Vinculación automática de commits**
- Acción que toma commits recientes de los repos vinculados + issues abiertos y pide pares `{ issueNumber, commitSha, confidence, rationale }` vía tool call.
- Se guardan en `commit_link_suggestions` como **propuestas**; UI de revisión (aceptar / rechazar).
- Al aceptar: se crea el `issue_link` con la URL del commit y se **ofrece** pasar a "resuelto" — nunca automático.

**6.3 Resumen semanal**
- `/api/cron/weekly-summary` protegido con `CRON_SECRET`; **Scheduled Task de Coolify** con `0 18 * * 5` haciendo `curl` a `localhost:3000` (ver 1.7).
- Itera los usuarios habilitados, junta los datos de la semana (creados, resueltos, bloqueados, cambios de estado, commits) y pide el resumen en prosa: qué avanzaste, qué quedó bloqueado, qué se estanca, qué atacar la semana que viene.
- Guarda en `weekly_summaries` (idempotente por semana), página **Resúmenes** con historial y el último destacado en el dashboard. Botón de generación manual con streaming.

**6.4 Priorización asistida**
- Botón "¿Qué hago hoy?": manda issues abiertos con antigüedad, prioridad, estado y proyecto; devuelve 3–5 ítems ordenados con justificación breve. **Sólo visual**, no toca datos.

**6.5 Enriquecimiento**
- En el detalle, "Ayudame a completarlo": sugiere información faltante (pasos, entorno, datos de ejemplo) y posibles causas, en un panel aparte, con botón para insertar cada bloque en la descripción.

**6.6 Insights del dashboard**
- Párrafo con observaciones sobre patrones de trabajo, con streaming; cacheado en `insights_cache` y regenerado como máximo 1 vez por día.

**6.7 Panel de consumo (Ajustes)**
- Consumo del mes: llamadas, tokens de entrada/salida y costo estimado, desglosado **por tarea** y **por modelo**, con tabla + gráfico de barras y comparación con el mes anterior.

**Verificación final**: build ok; recorrido completo (crear por voz → aviso de duplicado → resolver vinculando un commit sugerido → ver el cambio reflejado en dashboard, insights y resumen semanal); cron probado con `curl` + `CRON_SECRET`; `.env.example` y README completos.

---

## 7. Documentación de cierre

- **`.env.example`** con todas las variables de la sección 5, comentadas.
- **`README.md`** reescrito con: crear el proyecto en Supabase, habilitar `vector` y `pg_trgm`, obtener las connection strings (pooler vs. directa), crear el GitHub OAuth App con las callback URLs de dev (`http://localhost:3000/auth/callback`) y prod, configurar el provider GitHub en Supabase (incluida la callback de Supabase `https://<ref>.supabase.co/auth/v1/callback`), generar `ENCRYPTION_KEY`, correr migraciones, y desplegar en Coolify (sección 10: Dockerfile, env vars build-time vs runtime, dominio + TLS, Scheduled Task del cron, dominios permitidos en Supabase Auth → Redirect URLs).
- Nota explícita sobre RLS vs. filtro por `user_id` (sección 1.2) y sobre el proveedor de embeddings (1.5).

---

## 8. Riesgos y decisiones abiertas

| # | Tema | Estado |
|---|---|---|
| 1 | **OpenRouter no tiene endpoint de embeddings** | **Resuelto**: Cloudflare Workers AI `@cf/baai/bge-m3` (1024 dims, multilingüe), gratis hasta 10k Neurons/día, por REST desde cualquier host (1.5) |
| 2 | Workers AI es una dependencia externa más | Mitigada: misma dimensión que `bge-m3` en Ollama → se cambia de proveedor sin migrar; `pg_trgm` como fallback si la API falla |
| 2b | Cambiar de modelo de embeddings implica migración de esquema (dimensión fija) | Mitigado: dimensión centralizada + job de regeneración por lotes |
| 3 | shadcn `base-nova` (Base UI) puede no traer el bloque `chart` tal cual | Se valida en Fase 3; fallback a Recharts + wrapper propio |
| 4 | Sin Vercel Cron | **Resuelto**: Scheduled Tasks de Coolify, sin límite de frecuencia (1.7) + disparo manual |
| 5 | El `provider_token` de GitHub no lo persiste Supabase | Mitigado: se guarda cifrado en el callback + flujo de reconexión |
| 6 | Web Speech API no existe en Firefox y es parcial en iOS | Degradación silenciosa: el textarea siempre funciona |
| 7 | Costo de las llamadas de IA | Todo queda logueado en `ai_usage_log`; insights cacheados 24 h; los duplicados caen dentro del piso gratuito de Workers AI |
| 8 | El caché de Next (`'use cache'`) es por instancia | Con una sola réplica no es problema. Si algún día hay varias, hace falta un cache handler compartido (Redis) — se documenta, no se implementa ahora |
| 9b | Supabase self-hosted expuesto por IP:8000 impide usar la app desde el celular fuera de la LAN | Recomendación: subdominio con TLS para Supabase desde el principio (1.10) |
| 9 | Builds de Next consumen bastante RAM en el server | Si el server es chico, buildear en GitHub Actions y que Coolify despliegue la imagen del registry |

---

## 9. Convenciones

- Interfaz **íntegramente en español** (labels, estados, mensajes de error, toasts, vacíos).
- Código, nombres de variables, tablas y commits en inglés; los **valores** de los enums de dominio en español porque se muestran al usuario.
- Server Components por defecto; `'use client'` sólo donde hay interacción real.
- Zod como fuente única de verdad de los tipos de entrada; los tipos de la base salen de `drizzle-zod`/inferencia.
- Sin `any`; `strict` ya está activo.
- Cada fase se commitea por separado con el build en verde.

---

## 10. Despliegue en Coolify

### 10.1 Imagen

- `next.config.ts` con **`output: 'standalone'`** → imagen final chica, sin `node_modules` completo.
- **Dockerfile multi-stage** (build pack "Dockerfile" en Coolify, no Nixpacks: necesitamos control sobre el paso que descarga el modelo de embeddings):
  1. *deps*: `bun install --frozen-lockfile`.
  2. *builder*: `bun run build`.
  3. *runner*: `node:22-alpine`, usuario no root, copia `.next/standalone`, `.next/static` y `public`. `EXPOSE 3000`, `CMD ["node", "server.js"]`.
  (Con `EMBEDDINGS_PROVIDER=workers-ai` no hay que hornear ningún modelo; sólo si se elige el proveedor `local` se agrega un paso que descarga los pesos a `HF_HOME`.)
- `.dockerignore` con `node_modules`, `.next`, `.git`, `.env*`.

### 10.2 Variables de entorno: build-time vs runtime

Distinción que rompe deploys si se pasa por alto:

- **Build-time** (van como *build args* en Coolify, quedan horneadas en el bundle del cliente): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
- **Runtime** (sólo variables del contenedor, nunca en el cliente): `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`, `ENCRYPTION_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET`, `ALLOWED_*`.

Cambiar una `NEXT_PUBLIC_*` exige **rebuild**, no sólo restart.

### 10.3 Recurso en Coolify

1. Nueva aplicación → *Public/Private Repository* → rama `main`, build pack **Dockerfile**, puerto expuesto `3000`.
2. Dominio (`https://devtracker.tu-dominio.com`); Coolify emite el certificado con Let's Encrypt vía su proxy (Traefik/Caddy). **Sin HTTPS el OAuth no funciona.**
3. **Health check**: route handler `/api/health` que responde 200 y hace un `select 1` contra la base. Configurado en Coolify para que un deploy roto no reemplace al que funciona.
4. **Scheduled Task**: `0 18 * * 5` → `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-summary`.
5. Migraciones: **no** correrlas en el arranque del contenedor (con varias réplicas se pisan). Se corren como paso explícito — comando manual en Coolify o `drizzle-kit migrate` desde tu máquina contra `DIRECT_URL` antes de desplegar.
6. Volumen persistente opcional montado en `HF_HOME` si preferís no hornear el modelo en la imagen.

### 10.4 URLs a registrar en los servicios externos

| Dónde | Valor |
|---|---|
| GitHub OAuth App → *Authorization callback URL* | `https://supabase.tu-dominio.com/auth/v1/callback` (el Supabase propio del puerto 8000) |
| Stack de Supabase → `SITE_URL` | `https://devtracker.tu-dominio.com` |
| Stack de Supabase → `ADDITIONAL_REDIRECT_URLS` | `https://devtracker.tu-dominio.com/auth/callback,http://localhost:3000/auth/callback` |
| App → `NEXT_PUBLIC_SUPABASE_URL` | `https://supabase.tu-dominio.com` — **alcanzable desde el navegador**, ver 1.10 |
| OpenRouter → `HTTP-Referer` | `https://devtracker.tu-dominio.com` |

Los dos servicios conviven en el mismo equipo (Supabase 8000, Coolify 8001), así que el contenedor de la app también podría hablarle a Supabase por la red interna de Docker. **No lo hacemos**: `@supabase/ssr` usa una sola URL para servidor y navegador, y partirla en dos complica más de lo que ahorra.

### 10.5 Recursos del servidor

- **Mínimo**: 1 GB de RAM (Next ~400 MB + margen). Si se usa el proveedor `local` de embeddings, 2 GB.
- **Cómodo**: 4 GB, si además buildeás en la misma máquina.
- Si el server es chico: buildear la imagen en GitHub Actions, publicarla en `ghcr.io` y que Coolify sólo la despliegue.

### 10.6 Fase de trabajo

El despliegue se hace **al final de la Fase 1**, no al final del proyecto: tener la app en el dominio real desde temprano valida el OAuth con HTTPS, las variables build-time y el health check cuando todavía hay poco que depurar. Cada fase siguiente cierra con un deploy a ese mismo entorno.

---

## 11. Opción alternativa: desplegar en Cloudflare Workers

Coolify (sección 10) y Workers son **destinos alternativos**, no complementarios. Pero **Workers AI sí es independiente del hosting**: se consume por REST desde donde sea, así que se puede usar el modelo de embeddings de Cloudflare aunque la app viva en Coolify (es lo que asume la sección 1.5).

### 11.1 ¿Hace falta bajar de versión de Next? **No**

`@opennextjs/cloudflare` (el adaptador OpenNext, no el viejo `next-on-pages`) **soporta todas las minor y patch de Next.js 16**. La 16.2.6 que ya está instalada entra. El soporte de Next 14 se discontinúa en Q1 2026, así que estar en 16 es justamente el lado bueno de la ventana.

### 11.2 El problema real: `proxy.ts` todavía no está soportado

Este es el punto que hay que mirar antes de decidir, y es un choque directo con el diseño de la Fase 1:

- En Next 16, `middleware.ts` se renombró a `proxy.ts`, y **Proxy corre siempre en Node.js runtime**: la opción `runtime` no existe en archivos Proxy y setearla **tira error** (verificado en los docs locales, `proxy.md`).
- El adaptador de Cloudflare **no soporta Node middleware** todavía, y falla al buildear con `proxy.ts` (issues abiertos: `opennextjs-cloudflare#962` con la versión 1.11.0 del adaptador, y `workers-sdk#13755` / `#13937`). El error típico es `Node.js middleware is not currently supported` o intentos de importar `async_hooks`.
- Es un catch-22: no se puede forzar `proxy.ts` a edge, y el adaptador sólo acepta edge.

**Workaround**: seguir usando **`middleware.ts`** (deprecado en 16 pero funcional, corre en Edge runtime por defecto) y no correr el codemod a `proxy.ts` hasta que el adaptador lo soporte. El refresco de sesión de `@supabase/ssr` funciona en Edge sin problema: es todo `fetch` y cookies. Es una deuda técnica acotada y con fecha de vencimiento.

### 11.3 Qué más cambia respecto del plan de Coolify

| Tema | En Workers |
|---|---|
| **Base de datos** | Los Workers no abren TCP como Node. Se usa **Hyperdrive** (incluido en el plan Free desde 2025, con tope de 100.000 queries/día; sin tope en Paid) con el driver `postgres`/`pg` y la connection string **directa** de Supabase — no la pooled, porque Hyperdrive ya poolea. Drizzle sigue igual |
| **Embeddings** | Binding nativo `env.AI` en vez de REST: sin API token y sin salto de red |
| **Cron** | **Cron Triggers** nativos de Workers (`scheduled` handler). Mejor que Vercel y que Coolify: sin límite de frecuencia y sin `curl` de por medio |
| **Caché (`'use cache'`/ISR)** | Se apoya en **Workers KV o R2** vía el incremental cache de OpenNext. Hay que configurarlo, no viene gratis |
| **Cifrado (`node:crypto`, AES-256-GCM)** | Requiere `nodejs_compat`; **verificar en Fase 1** que `createCipheriv('aes-256-gcm')` esté soportado. Si no, se reimplementa con WebCrypto (`AES-GCM` nativo), que en Workers está garantizado — y de hecho es la opción más segura de arranque |
| **Tamaño del bundle** | Límite de **3 MiB comprimido en Free / 10 MiB en Paid**. Con Next + Octokit + SDK de OpenAI + Drizzle, el plan Free queda muy justo |
| **CPU por request** | Free: 10 ms de CPU — inviable para SSR real. Paid: 30 s. El tiempo de espera de I/O (las llamadas a OpenRouter) **no cuenta** como CPU, así que el streaming de resúmenes no es problema |
| **Embeddings locales** | Imposible: `onnxruntime-node` es un binario nativo. En Workers el único camino es Workers AI (o una API externa) |
| **Modelo `local`/Ollama** | No aplica |

**Conclusión práctica: en Workers hace falta el plan Paid ($5/mes)** — por el límite de CPU y por el tamaño del bundle. Sigue siendo más barato que un VPS, pero deja de ser "gratis".

### 11.4 Bonus: Workers AI para las tareas rápidas

Más allá de los embeddings, Workers AI puede cubrir parte de la capa de IA:

- Modelos con **function calling** (familia Llama) sirven para las tareas `fast` del plan: la captura en lenguaje natural y la vinculación de commits, que son estructuración con tool calling y no necesitan un modelo grande.
- Se suma como un **proveedor más** en `lib/ai/settings.ts` (`provider: 'openrouter' | 'workers-ai'`), sin romper el requisito de que OpenRouter sea el proveedor principal: el selector de Ajustes muestra ambos catálogos y el resto del código no se entera.
- **AI Gateway** de Cloudflare puede además ponerse **adelante de OpenRouter** (cambiando sólo el `baseURL`) y dar caché de respuestas, rate limiting, reintentos y logs de cada request — útil justo para el panel de consumo.
- Ojo con el logging de tokens: la respuesta de Workers AI reporta el uso en **Neurons**, no en dólares por token. `ai_usage_log` necesita una columna/normalización para que el panel de consumo pueda mezclar ambas unidades sin mentir.

### 11.5 Recomendación

**Hostear en Coolify y usar Workers AI por REST.** Te da lo que querés probar (bge-m3 para duplicados, y los modelos de Llama para la captura si querés compararlos contra OpenRouter) sin heredar los límites de bundle, de CPU y el bloqueo de `proxy.ts`. Migrar a Workers después es acotado: `middleware.ts`, Hyperdrive, cache handler y el binding `env.AI`.

**Si el objetivo es probar el deploy en Workers en sí**, es viable hoy con la 16.2.6 y sin downgrade, aceptando: plan Paid, quedarse en `middleware.ts`, WebCrypto en lugar de `node:crypto`, y configurar KV para el caché. En ese caso conviene hacer el deploy de prueba **al final de la Fase 1**, cuando hay poco código, para que el diagnóstico sea barato.
