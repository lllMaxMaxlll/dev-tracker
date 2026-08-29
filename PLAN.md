# DevTracker — Plan de implementación

> Dashboard personal para registrar problemas, bugs e ideas de desarrollo, integrado con GitHub y con una capa de IA sobre Cloudflare Workers AI.
> Documento de planificación. **No incluye código**: define arquitectura, esquema, orden de trabajo y criterios de verificación por fase.

**Decisiones tomadas** (29/08/2026):
- **Hosting: Cloudflare Workers** con el adaptador **vinext** (sección 10). Se descartaron Coolify y Cloudflare Pages; el porqué está en 10.1.
- **Supabase Cloud**, plan gratuito (sección 1.10). Postgres se alcanza vía **Hyperdrive** con el driver `pg`.
- Se usa **`proxy.ts`**, la convención nueva de Next 16: vinext la soporta.
- **`cacheComponents` DESACTIVADO**: vinext lo marca como experimental e incompleto. El caché va con ISR + el adaptador de KV de Cloudflare.
- **IA: Cloudflare Workers AI** por el binding `AI`, tanto para chat como para embeddings (secciones 1.5 y 1.11). Reemplaza a OpenRouter, que era el proveedor del pedido original.

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
2. **Modelo de caché nuevo**: Next 16 ofrece `cacheComponents: true` con la directiva `'use cache'` + `cacheLife(...)`. **No lo usamos**: vinext marca `cacheComponents` como soporte experimental con comportamiento incompleto. El caché de GitHub y del catálogo de modelos va con `revalidate` de ISR sobre el adaptador de KV de Cloudflare, que vinext soporta por completo.
3. Antes de escribir código de cada fase se leen los docs locales correspondientes en `node_modules/next/dist/docs/` (proxy, use-cache, route handlers, server actions).

---

## 1. Decisiones de arquitectura (y sus porqués)

### 1.1 Dos caminos de acceso a datos, a propósito

- **Supabase JS (`@supabase/ssr`)** → **sólo autenticación**: intercambio de código OAuth, sesión en cookies, `getUser()`, logout. Nunca se usa para leer/escribir tablas de dominio.
- **Drizzle ORM sobre Postgres** → **todas las consultas de dominio**, vía **Hyperdrive**.
  - Los Workers **no pueden abrir sockets TCP crudos** a Postgres. Hyperdrive es el puente, y además poolea del lado del servidor.
  - Driver: **node-postgres (`pg`)**, el recomendado por Cloudflare por su compatibilidad con el caché de Hyperdrive (mínimo 8.16.3). `postgres-js` **no corre** nativamente en Workers.
  - La connection string que se le da a Hyperdrive es la **directa** de Supabase (`:5432`), no la pooled: el pooling ya lo hace Hyperdrive.
  - ⚠️ Pero la directa (`db.<ref>.supabase.co`) resuelve **sólo a IPv6** desde enero de 2024. Desde una red IPv4 da `getaddrinfo ENOTFOUND`. Por eso el desarrollo local y `drizzle-kit` usan el **session pooler** (`aws-N-<region>.pooler.supabase.com:5432`, IPv4), y la directa queda sólo para el binding de Hyperdrive, que sí la alcanza desde la red de Cloudflare. Del pooler va el puerto 5432 (session mode), no el 6543: transaction mode no soporta bien prepared statements ni el DDL de las migraciones.
  - En runtime la URL sale del binding (`env.HYPERDRIVE.connectionString`); `DATABASE_URL` queda como fallback y para `drizzle-kit`, que corre fuera del Worker.
  - El `Pool` vive a nivel de módulo, o sea uno por isolate, con `max: 5`. Hyperdrive hace que abrir conexiones sea barato, así que no hace falta crear y cerrar un cliente por request.

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
| ~~API key de OpenRouter~~ | — | Ya no aplica: Workers AI se accede por binding, sin keys (ver 1.11). La columna cifrada queda para un eventual proveedor externo |
| `CRON_SECRET` | env | validado en el route handler del cron (`Authorization: Bearer`) |

Módulo único `lib/crypto.ts` con `encrypt()` / `decrypt()`; el ciphertext guarda `iv:authTag:data` en base64 para poder rotar el formato después.

### 1.4 Expiración del token de GitHub

Los tokens OAuth de GitHub App expiran; los de OAuth App clásica no, pero pueden ser revocados. Estrategia:

- Se guarda `expires_at` (si viene) y `scopes` concedidos.
- Wrapper de Octokit que ante `401`/`403 bad credentials` marca la credencial como inválida (`is_valid = false`) y la UI muestra un banner "Reconectá tu cuenta de GitHub" que reinicia el flujo OAuth con `scopes: 'read:user repo'`.
- Los flujos de IA que dependen de commits degradan a "sin datos de GitHub" en vez de romper.

### 1.5 Embeddings: `@cf/baai/bge-m3` por el binding `AI`

La detección de duplicados (punto 9 del pedido) necesita embeddings reales. Nota histórica: esto fue lo primero que obligó a mirar más allá de OpenRouter, que es una API de *chat completions* y no ofrece `/v1/embeddings`. Con el cambio a Workers AI (1.11) el problema desapareció: el mismo binding sirve para chat y para embeddings.

**Opción elegida — Cloudflare Workers AI (`@cf/baai/bge-m3`)**

- **1024 dimensiones**, multilingüe de verdad (100+ idiomas), ventana de 60.000 tokens. Que sea multilingüe es clave: tus notas están en español y los modelos tipo `all-MiniLM-L6-v2` son sólo inglés y degradan bastante.
- **Gratis en la práctica**: 10.000 Neurons por día sin cargo, que se reinician a las 00:00 UTC. Pasado eso, $0,012 por millón de tokens de entrada. Un issue tuyo son ~50 tokens: el uso real queda muy por debajo del piso gratuito.
- Al correr **sobre Workers** se usa el **binding `AI`** (`env.AI.run("@cf/baai/bge-m3", …)`): sin API token, sin account id y sin salto de red. También existe la API REST, que es lo que se usaría desde fuera de Cloudflare.
- Cero infraestructura propia: nada de pesos en la imagen, nada de RAM extra, nada de descargas en el build.

**Alternativas contempladas**

| Opción | Veredicto |
|---|---|
| `@huggingface/transformers` local (`Xenova/multilingual-e5-small`, 384 dims) | **Imposible en Workers**: `onnxruntime-node` es un binario nativo. Quedó descartado al dejar Coolify |
| Ollama en contenedor aparte (`bge-m3`, 1024 dims) | Misma calidad y mismas 1024 dims, pero necesita un servidor propio. Descartado junto con Coolify |
| Gemini / Cohere / Voyage free tier | Gratis con rate limits, pero otra cuenta más |
| OpenAI `text-embedding-3-small` | Barato, no gratis, y suma una segunda cuenta paga |
| Sólo `pg_trgm` (léxico) | Cero infraestructura, pero no detecta "el login falla con mayúsculas" ≈ "problema de case sensitivity al iniciar sesión". Queda como **fallback automático** si el proveedor no responde |

`lib/ai/embeddings.ts` expone `embed(texts: string[]): Promise<number[][]>` detrás de `EMBEDDINGS_PROVIDER` (`workers-ai` | `openai`), para no quedar atados a un proveedor.

### 1.6 pgvector: dimensiones e índices

- La dimensión de una columna `vector` es **fija a nivel esquema**: cambiar de modelo con otra dimensión es una migración, no un setting. Por eso la dimensión vive en un solo lugar (`lib/ai/embeddings.ts` + la migración) y Ajustes avisa en vez de romper.
- Columna **`vector(1024)`** (bge-m3) + índice **HNSW** con `vector_cosine_ops` (`m=16, ef_construction=64`), más columnas `embedding_model` y `embedding_dimensions` en la tabla para saber con qué se generó cada fila.
- 1024 dims entra cómodo en el límite de índice de pgvector y permite mover el proveedor entre Workers AI y Ollama (mismo modelo) sin migrar nada.
- Los índices HNSW/IVFFlat de pgvector soportan hasta **2000 dimensiones** sobre el tipo `vector`; si algún día se pasa a un modelo de 3072 hay que usar `halfvec` o reducir dimensiones.
- Si en Ajustes se elige un modelo con otra dimensión: se avisa con un mensaje claro, se genera la migración correspondiente y se ofrece **"Regenerar embeddings"** (job por lotes con progreso). Nunca se mezclan vectores de modelos distintos en la misma columna.

### 1.7 Tareas programadas: Cron Triggers de Workers

Cloudflare Workers tiene **Cron Triggers** nativos. Se declaran en `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 18 * * 5"] }   // viernes 18:00 UTC
```

- Sin límite de una ejecución diaria (a diferencia de Vercel Hobby) y sin el `curl` de por medio que hacía falta con Coolify.
- **Esto es lo que descartó Cloudflare Pages**: las Pages Functions no soportan cron triggers ni el handler `scheduled`. El resumen semanal (requisito 11) no podría correr ahí.
- El endpoint sigue protegido por `CRON_SECRET` y sigue siendo **idempotente** por `(user_id, week_start)`.
- Botón "Generar resumen ahora" en la página Resúmenes (mismo código, disparo manual), para poder probarlo sin esperar al viernes.

⚠️ **A verificar en la Fase 6**: la documentación de vinext no cubre el handler `scheduled`. Si su worker no lo expone, el plan B es un **Worker aparte de diez líneas** con sólo el cron, que le pega al endpoint `/api/cron/weekly-summary` de la app. Funciona igual y es trivial de desplegar.

### 1.8 Streaming

Server Actions no son el mejor camino para streaming de texto. Los resúmenes y los insights usan **route handlers** (`/api/ai/summary/stream`, `/api/ai/insights/stream`) que devuelven un `ReadableStream` desde el SDK de OpenAI en modo `stream: true`, consumidos desde el cliente. El resto de las operaciones de IA (estructuradas, con tool calling) son Server Actions normales.

### 1.9 shadcn con `base-nova`

Los componentes se agregan con `npx shadcn@latest add <componente>` y salen sobre Base UI. A tener en cuenta:

- **Charts**: el bloque `chart` de shadcn trae Recharts. Se verifica compatibilidad al agregarlo en Fase 3; si el registry `base-nova` no lo trae, se instala Recharts y se adapta el wrapper `ChartContainer`.
- **Drag & drop del kanban**: no hay componente shadcn para esto → **`@dnd-kit/core` + `@dnd-kit/sortable`**.
- **Tablas**: `@tanstack/react-table` + el `data-table` de shadcn.

### 1.11 El proveedor de IA: Workers AI en lugar de OpenRouter

El pedido original especificaba **OpenRouter**, consumido con el SDK de OpenAI. Se cambió a **Workers AI**, y no es una concesión: desde el **7 de agosto de 2026 Cloudflare unificó Workers AI y AI Gateway**, así que el mismo binding `env.AI.run()` y la misma REST API alcanzan tanto los modelos alojados en Workers AI como los de **proveedores externos soportados**, con un solo saldo de facturación y un catálogo de modelos unificado.

Qué gana el proyecto:

| | Con OpenRouter | Con Workers AI |
|---|---|---|
| Autenticación | API key en variable de entorno, más la key propia por usuario cifrada en la base | **binding `AI`**: sin keys, sin cifrado, sin rotación |
| Latencia | salto de red a un tercero | dentro del mismo runtime |
| Facturación | tarjeta en OpenRouter | **10.000 Neurons/día gratis**, después $0,011 por 1.000 |
| Modelos externos | su razón de ser | siguen disponibles vía AI Gateway, con el mismo binding |

**Tool calling**: sigue siendo obligatorio para toda salida estructurada (requisito transversal del pedido), y Workers AI lo soporta en modelos grandes — Kimi K2.5, DeepSeek V4, Qwen 3.8, GLM-4.7-Flash, Gemma-4. No hay que bajar de categoría de modelo para conservar el contrato de "tool calling + validación con Zod, nunca parseo de texto libre".

**Costo real**: Llama 3.1 70B cuesta ~26.700 Neurons por millón de tokens de entrada y ~205.000 por millón de salida. Un resumen semanal de ~4.000 tokens de entrada y 800 de salida son **unos 270 Neurons**. Con 10.000 gratis por día, el uso de un tablero personal no llega a rozar el piso.

**Lo que se cae del pedido**: la opción de que cada usuario cargue su propia API key de OpenRouter (punto 7). Con un binding no hay ninguna key que cargar. La columna `openrouter_api_key_encrypted` queda en el esquema por si algún día se habilita un proveedor externo que la necesite, pero no tiene interfaz.

**Lo que se conserva**: la abstracción por proveedor en `lib/ai/settings.ts` (`provider: 'workers-ai' | 'openrouter'`). Volver a OpenRouter, o sumarlo en paralelo, es implementar una función más, no rehacer la capa.

### 1.10 Dónde vive Supabase: Supabase Cloud

**Decidido**: Supabase Cloud, plan gratuito. Se descartó el self-hosted que estaba corriendo junto a Coolify.

Con el deploy en Cloudflare, Cloud es además la opción claramente mejor:

- `NEXT_PUBLIC_SUPABASE_URL` queda en `https://<ref>.supabase.co`, **alcanzable desde cualquier navegador**. Con el self-hosted en `IP:8000` la app sólo funcionaba dentro de la LAN, lo que chocaba de frente con el requisito de anotar problemas desde el celular. Ese problema desaparece.
- El proveedor de GitHub vuelve a configurarse desde el dashboard (Authentication → Providers), en vez de por variables de entorno de GoTrue y recreando el contenedor `auth`.
- TLS, backups y actualizaciones dejan de ser tarea nuestra.
- El plan gratuito pausa el proyecto tras ~1 semana sin actividad; con uso diario no molesta, y el cron semanal lo mantiene despierto.

Las extensiones `vector` y `pg_trgm` las habilita la primera migración; en Supabase Cloud el rol de la base tiene permisos suficientes para el `CREATE EXTENSION`.

**Conexión desde Cloudflare Workers**: se usa la connection string **directa** de Supabase (puerto 5432), no la pooled — Hyperdrive ya hace el pooling y la documentación de Cloudflare lo pide explícitamente. Ver sección 11.

---

## 2. Dependencias a instalar

```
# plataforma (las instala `vinext init --platform=cloudflare`)
vinext @vinext/cloudflare react-server-dom-webpack
vite @vitejs/plugin-react @vitejs/plugin-rsc @cloudflare/vite-plugin wrangler -D

# datos
@supabase/supabase-js @supabase/ssr
drizzle-orm pg          # pg, NO postgres-js: postgres-js no corre en Workers
drizzle-kit @types/pg -D

# github
octokit

# ia
zod
# El SDK de OpenAI ya no hace falta: Workers AI se usa por el binding `AI`.
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
`user_id` (PK) · `openrouter_api_key_encrypted` (nullable, sin interfaz; ver 1.11) · `default_model` · `fast_model` (nullable = hereda) · `reasoning_model` (nullable = hereda) · `embedding_provider` · `embedding_model` · `embedding_dimensions` · `fast_temperature` · `fast_max_tokens` · `reasoning_temperature` · `reasoning_max_tokens` · `require_tool_calling boolean default true` · `updated_at`

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
vite.config.ts                      # vinext + @cloudflare/vite-plugin
wrangler.jsonc                      # bindings HYPERDRIVE / KV / AI y cron triggers
worker-configuration.d.ts           # generado por `bun run cf-typegen`
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
    client.ts                       # binding AI: chat con tool calling
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
# En runtime la conexión sale del binding HYPERDRIVE (ver 1.1 y 10.3); estas
# son el fallback y lo que usa drizzle-kit, que corre fuera del Worker.
DATABASE_URL=            # directa :5432, NO la pooled
DIRECT_URL=              # directa :5432, migraciones
CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=   # sólo desarrollo

# Cifrado de secretos en base (32 bytes base64). AES-GCM vía WebCrypto.
ENCRYPTION_KEY=

# IA — Workers AI vía el binding `AI` de wrangler.jsonc.
# No hay API keys: ni para chat ni para embeddings (ver 1.11).
EMBEDDINGS_MODEL=@cf/baai/bge-m3     # 1024 dims, multilingüe

# Cron
CRON_SECRET=

# Acceso restringido (opcional)
ALLOWED_EMAILS=
ALLOWED_GITHUB_LOGINS=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
# ⚠️ build-time: se hornea en el bundle del cliente durante `vinext build`.
```

---

## 6. Fases

Cada fase termina con: `bun run typecheck` + `bun run lint` + `bun run build` en verde, y una **prueba manual** concreta descrita abajo. No se arranca la fase siguiente sin eso.

---

### Fase 1 — Base, esquema, RLS y login ✅ COMPLETADA

1. Instalar dependencias de datos/auth; agregar los componentes shadcn base (`card input label sonner dropdown-menu avatar skeleton dialog sheet separator`).
2. Configurar `next.config.ts` (`cacheComponents: true`) y el layout raíz en español (`<html lang="es">`), `ThemeProvider` con toggle y `<Toaster />` de sonner.
3. Proyecto en Supabase Cloud (ver 1.10): habilitar el proveedor de GitHub desde el dashboard y crear el GitHub OAuth App con la callback apuntando a Supabase. Registrar las **dos** redirect URLs desde el principio (localhost y dominio de producción).
4. Drizzle: `drizzle.config.ts`, `lib/db/schema.ts` completo (sección 3), `bun drizzle-kit generate` + `migrate`. SQL de RLS versionado.
5. `@supabase/ssr`: cliente de navegador, cliente de servidor (con `cookies()`), y **`proxy.ts`** que refresca la sesión y redirige a `/login` si no hay usuario (matcher que excluye `_next/static`, `_next/image`, favicon y assets; `/login` y `/auth/*` públicos).
6. `/login`: pantalla mínima con un botón "Continuar con GitHub" (`signInWithOAuth` con `scopes: 'read:user repo'`, `redirectTo` al callback).
7. `/auth/callback`: `exchangeCodeForSession` → chequeo de whitelist → upsert de `profiles` → guardar el `provider_token` cifrado en `github_credentials` → redirigir a `/`.
8. Shell de la app: sidebar responsive, topbar, menú de usuario (avatar, nombre, cerrar sesión), toggle de tema.

**Verificación**: build ok; entrar sin sesión a `/` redirige a `/login`; login con GitHub crea fila en `profiles` y en `github_credentials`; logout funciona; un usuario B no ve datos de A (probado con la anon key contra PostgREST para confirmar que RLS bloquea).

**Resultado**: `typecheck`, `lint` y `build` en verde. Verificado en el navegador: `/` y `/problemas` sin sesión redirigen a `/login`; la pantalla de login renderiza en tema claro y oscuro y en 375px; los mensajes de error del callback se muestran. **Verificado con Supabase real (29/08/2026)**: el round-trip completo de OAuth funciona. El login con GitHub crea el perfil, guarda el provider token cifrado con los scopes `read:user` y `repo`, y siembra las filas de `user_ai_settings` y `user_counters`. RLS ya se había verificado en la Fase 2.

Ese primer login destapó un **bug de producción** que ninguna verificación previa podía encontrar: el `Pool` de `pg` vivía a nivel de módulo, y workerd aísla el I/O por request. La primera request funcionaba y la segunda colgaba el Worker sin lanzar excepción. La conexión pasó a crearse **por request**, memoizada con `cache()` de React.

Desvíos respecto de lo planificado:
- **Toast**: el proyecto usa Base UI (`base: "base"`), así que va el componente `toast` de shadcn en vez de `sonner`.
- **Icono de GitHub**: lucide-react v1 dejó de incluir iconos de marca → componente propio en `components/icons/github.tsx`.
- **`lib/db/index.ts`**: la conexión es perezosa (Proxy sobre `getDb()`) para que `next build` no exija credenciales de base de datos.

---

### Fase 2 — CRUD de problemas y proyectos ✅ COMPLETADA

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

**Resultado**: `typecheck`, `lint` y `build` en verde.

Se levantó un **Postgres real con pgvector** (instancia temporal, aislada) para verificar contra base de verdad, con un stub del esquema `auth` de Supabase. Ambas migraciones aplicaron limpias: 14 tablas, 56 políticas de RLS, RLS activo en las 14, 5 triggers de `updated_at`, índice HNSW y los dos trigram.

20/20 comprobaciones del dominio en verde: numeración correlativa por usuario (y que cada usuario arranque en 1), historial escrito en el alta y en cada cambio, `resolvedAt`, agregados `count(...) filter`, filtros por estado/proyecto/texto (con acentos y buscando también en la descripción), orden por prioridad con el CASE, trigger de `updated_at`, y que borrar un proyecto deje sus problemas huérfanos en vez de borrarlos.

**RLS verificado** (lo que quedó pendiente de la Fase 1): con el rol `authenticated`, cada usuario ve sólo sus filas; un insert a nombre de otro usuario es rechazado por la política; un `update` masivo afecta 0 filas ajenas; y el rol `anon` recibe *permission denied*.

En la interfaz se verificó el render de las dos vistas, el formulario, los selects, el atajo `C` y el responsive a 375px.

Desvíos respecto de lo planificado:
- **Sin TanStack Table**: la v9 reescribió la API (`useReactTable` y `getCoreRowModel` ya no existen). Como el filtrado y el orden se resuelven en SQL —que además usa los índices— la tabla se armó con el `Table` de shadcn y cabeceras ordenables por URL. Menos código y una dependencia menos.
- **`ClientOnly`**: dnd-kit y los diálogos de Base UI generan ids con contadores que arrancan distinto en servidor y cliente, y rompían la hidratación. Se envuelven en un helper que los renderiza sólo después de hidratar.

---

### Fase 3 — Dashboard de métricas ✅ COMPLETADA

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

**Resultado**: `typecheck`, `lint` y `build` en verde.

El SQL de métricas se verificó contra Postgres real con datos sembrados a fechas conocidas: 16/16 comprobaciones. Cubre que el promedio de resolución use sólo los últimos 90 días (y descarte lo viejo), que la serie devuelva 12 semanas **incluidas las vacías** gracias al `generate_series`, que los agregados por tipo y proyecto agrupen bien (con los problemas sin proyecto juntos), y que un usuario sin datos devuelva 0 y `null` en vez de `NaN`.

En el navegador se verificaron las tarjetas, los tres gráficos, la lista de recientes y el **estado vacío** completo, en tema claro y oscuro y a 375px.

Dos problemas encontrados y corregidos:
- **La paleta de gráficos del preset era inservible**: `base-nova` define `--chart-1..5` como la misma rampa de grises en ambos temas. En tema claro `--chart-1` es `oklch(0.87 0 0)`, casi blanco sobre fondo blanco: las series eran **invisibles**. Y en oscuro, dos grises no se distinguen cuando las líneas se cruzan. Se reemplazó por una paleta categórica de cinco tonos, con la luminosidad ajustada por tema.
- **Animación de montaje de recharts**: el dashboard se re-renderiza en cada navegación y las series se volvían a dibujar cada vez, mostrando el gráfico vacío durante el primer segundo. Desactivada con `isAnimationActive={false}`.

Nota sobre `shadcn/chart`: el bloque **sí** existe para `base-nova` (era un riesgo abierto del plan, punto 3 de la tabla) y trae recharts 3.8.0.

---

### Fase 4 — Integración con GitHub ✅ COMPLETADA

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

**Resultado**: `typecheck`, `lint` y `build` en verde.

La capa de GitHub se verificó **contra la cuenta real**, descifrando el token guardado en la base con el mismo algoritmo que usa la app: 79 repos, commits, ramas, PRs, issues, cuota 4999/5000, y un token inválido devolviendo 401. Los scopes que reporta GitHub son `read:user, repo, user:email`.

Decisión de caché: se descartó el caché de Next (`revalidate`/ISR) porque estas páginas son **privadas y dependen del usuario**, y una entrada compartida filtraría datos de una cuenta a otra. Se usa una tabla `github_cache` con `user_id` en la clave, TTL de 12–15 min y RLS como el resto. Va en Postgres y no en KV para no sumar otro binding que configurar.

Dos bugs encontrados y corregidos durante la verificación:
- **El estado "calculando" se cacheaba.** GitHub calcula las estadísticas de commits de forma diferida y devuelve 202 con el cuerpo vacío; guardarlo dejaba el heatmap en blanco durante todo el TTL aunque GitHub ya hubiera terminado. Ahora `conCache` acepta un predicado `cachearSi` y ese estado no se guarda.
- **Base UI avisaba por los botones que renderizan enlaces.** Cuatro `Button` con `render={<Link>}` o `render={<a>}` necesitaban `nativeButton={false}`.

También se corrigió un antipatrón que marcó el linter: construir JSX dentro de un `try/catch` da falsa sensación de seguridad, porque React no renderiza en el momento de crear el elemento y los errores de render no se atrapan ahí. La carga se separó en `cargarSeguro()`, que devuelve un resultado en vez de lanzar.

---

### Fase 5 — Capa de IA, Ajustes y captura en lenguaje natural

1. `lib/ai/client.ts`: envoltorio del binding `env.AI.run(modelo, { messages, tools })`, con timeout por request y reintento acotado. Sin API keys ni cabeceras de identificación: no aplican con un binding (ver 1.11).
2. `lib/ai/models.ts`: catálogo de modelos de Workers AI, cacheado con ISR sobre KV (~1 h), normalizado a `{ id, name, provider, contextLength, neuronsPerMTokenIn, neuronsPerMTokenOut, supportsTools }`.
3. `lib/ai/settings.ts`: lee `user_ai_settings`, resuelve el modelo efectivo por tarea (`fast` / `reasoning`, con herencia del default), temperatura y `max_tokens`.
4. `lib/ai/usage.ts`: envuelve cada llamada, mide latencia, lee `usage` de la respuesta, calcula costo estimado con los precios del catálogo y escribe en `ai_usage_log` (también cuando falla).
5. Contrato de salida estructurada: **siempre tool calling** + validación Zod del `arguments`. Si el modelo no soporta tools → error tipado `MODEL_NO_TOOL_SUPPORT` con mensaje claro y sugerencia de cambiar de modelo en Ajustes. Sin parseo de texto libre en ningún caso.
6. Página **Ajustes**:
   - selector de modelo con buscador (command), mostrando nombre, proveedor, contexto y precio in/out por millón de tokens;
   - filtro "sólo modelos con tool calling" y aviso si el elegido no lo soporta;
   - modelo por tarea (rápidas / razonamiento) con opción "heredar del default";
   - sliders de temperatura y máximo de tokens por tarea, con defaults razonables (rápidas: 0.2 / 1024; razonamiento: 0.7 / 2048);
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
- `/api/cron/weekly-summary` protegido con `CRON_SECRET`; **Cron Trigger de Workers** con `0 18 * * 5` en `wrangler.jsonc` (ver 1.7).
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
- **`README.md`** reescrito con: crear el proyecto en Supabase, habilitar `vector` y `pg_trgm`, obtener la connection string directa, crear el GitHub OAuth App con las callback URLs de dev (`http://localhost:3000/auth/callback`) y prod, configurar el provider GitHub en Supabase (incluida la callback de Supabase `https://<ref>.supabase.co/auth/v1/callback`), generar `ENCRYPTION_KEY`, correr migraciones, crear los bindings de Hyperdrive y KV, y desplegar en Cloudflare Workers (sección 10).
- Nota explícita sobre RLS vs. filtro por `user_id` (sección 1.2) y sobre el proveedor de embeddings (1.5).

---

## 8. Riesgos y decisiones abiertas

| # | Tema | Estado |
|---|---|---|
| 1 | ~~OpenRouter no tiene endpoint de embeddings~~ | **Obsoleto**: toda la IA pasó a Workers AI (1.11). Embeddings con `@cf/baai/bge-m3` por el binding |
| 2 | Cambiar de modelo de embeddings implica migración de esquema (dimensión fija) | Mitigado: dimensión centralizada + job de regeneración por lotes; `pg_trgm` como fallback si la API falla |
| 3 | shadcn `base-nova` puede no traer el bloque `chart` | **Resuelto**: existe y trae recharts 3.8.0. Lo que sí hubo que corregir es su paleta `--chart-*`, gris e invisible en tema claro (ver Fase 3) |
| 4 | Cron | **Resuelto**: Cron Triggers nativos de Workers (1.7). ⚠️ Falta verificar que vinext exponga el handler `scheduled`; si no, un Worker aparte de diez líneas |
| 5 | El `provider_token` de GitHub no lo persiste Supabase | Mitigado: se guarda cifrado en el callback + flujo de reconexión |
| 6 | Web Speech API no existe en Firefox y es parcial en iOS | Degradación silenciosa: el textarea siempre funciona |
| 7 | Costo de las llamadas de IA | Todo queda logueado en `ai_usage_log`; insights cacheados 24 h; los duplicados caen dentro del piso gratuito de Workers AI |
| 8 | `cacheComponents` incompleto en vinext | **Resuelto**: desactivado; el caché va con ISR sobre el adaptador de KV, soportado por completo |
| 9 | Workers exige plan Paid ($5/mes) por CPU y tamaño de bundle | Asumido. Sigue siendo más barato que un VPS |
| 10 | vinext es joven: reimplementa la API de Next (94%), no la ejecuta | Es la vía que recomienda Cloudflare. `vinext check` da 92% sobre este proyecto con 0 problemas; los huecos conocidos están en 10.2 |
| 11 | `next/font/google` carga del CDN, no self-hosted | Cosmético; si molesta, se pasan las fuentes a locales |

---

## 9. Convenciones

- Interfaz **íntegramente en español** (labels, estados, mensajes de error, toasts, vacíos).
- Código, nombres de variables, tablas y commits en inglés; los **valores** de los enums de dominio en español porque se muestran al usuario.
- Server Components por defecto; `'use client'` sólo donde hay interacción real.
- Zod como fuente única de verdad de los tipos de entrada; los tipos de la base salen de `drizzle-zod`/inferencia.
- Sin `any`; `strict` ya está activo.
- Cada fase se commitea por separado con el build en verde.

---

## 10. Despliegue en Cloudflare Workers

### 10.1 Por qué Workers y no Pages

El pedido decía "Cloudflare Pages", pero el destino técnico correcto es **Workers**:

- **Pages Functions no soporta cron triggers ni el handler `scheduled`.** El resumen semanal de los viernes (requisito 11) no puede correr ahí.
- Cloudflare **absorbió Pages dentro de Workers**: las features nuevas salen sólo en Workers, y los assets estáticos ya son gratis también ahí.
- Para Next.js, Cloudflare recomienda hoy **vinext**; OpenNext quedó como opción legacy.

### 10.2 El adaptador: vinext

`vinext check` sobre este proyecto dio **92% compatible, 0 problemas**:

| Área | Resultado |
|---|---|
| `proxy.ts` (Next 16) | ✅ soportado — el bloqueo que tenía OpenNext no aplica |
| Route handlers, layouts, App Router | ✅ |
| next-themes, tailwind, lucide, zod | ✅ |
| `next/font/google` | ⚠️ las fuentes se cargan del CDN, no self-hosted en build |
| `images` | ⚠️ optimización on-the-fly sólo con Cloudflare Images; si no, passthrough |
| `cacheComponents` | ⚠️ **experimental e incompleto → desactivado** |

vinext reimplementa la API de Next sobre **Vite**: el build ya no es `next build`. Los scripts quedaron `dev` / `build` / `preview` / `deploy`, todos vinext. Se eliminaron los de Next a propósito: mantener `next build` daría una verificación falsa, porque puede pasar mientras el build del Worker falla.

### 10.3 Bindings (`wrangler.jsonc`)

Se acceden con `import { env } from "cloudflare:workers"` desde cualquier server component, route handler o server action. **No** se usan `getPlatformProxy()` ni entradas de worker propias: son patrones viejos.

| Binding | Para qué |
|---|---|
| `HYPERDRIVE` | Postgres de Supabase (sección 1.1) |
| `VINEXT_KV_CACHE` | caché de datos de vinext (ISR) |
| `AI` | Workers AI para los embeddings (sección 1.5) |
| `ASSETS` | estáticos, lo pone vinext |

Setup por única vez:

```bash
npx wrangler kv namespace create VINEXT_KV_CACHE
npx wrangler hyperdrive create devtracker-db --connection-string="<directa de Supabase>"
```

Los ids resultantes van a `wrangler.jsonc`. Para desarrollo local, wrangler necesita `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` en el entorno.

### 10.4 Cifrado: WebCrypto, no `node:crypto`

`lib/crypto.ts` usa `crypto.subtle` (AES-256-GCM) en lugar de `node:crypto`. En Workers WebCrypto es nativo y está garantizado; `node:crypto` depende del alcance de `nodejs_compat`, que varía. El mismo código corre en Node 18+, así que también sirve para scripts fuera del Worker.

Consecuencia: `encrypt()` y `decrypt()` son **async**.

### 10.5 Límites a tener en cuenta

| Tema | Detalle |
|---|---|
| **Plan** | **Paid ($5/mes)**. En Free el límite de 10 ms de CPU por request es inviable para SSR, y el bundle tiene tope de 3 MiB comprimido (10 MiB en Paid) |
| CPU | 30 s en Paid. La espera de I/O (las llamadas de inferencia) **no cuenta**, así que el streaming de resúmenes no es problema |
| Hyperdrive | Incluido en Free y Paid; en Free hay tope de 100.000 queries/día |
| Variables build-time | Las `NEXT_PUBLIC_*` se hornean durante `vinext build`: cambiarlas exige rebuild |

### 10.6 Workers AI como única capa de IA

Toda la IA del proyecto pasa por el binding `AI` (ver 1.11): chat con tool calling para las salidas estructuradas, y `@cf/baai/bge-m3` para los embeddings.

Ojo con el registro de consumo: Workers AI factura en **Neurons**, no en dólares por token. Por eso `ai_usage_log` tiene una columna `neurons` además de los tokens — sin eso el panel de consumo mezclaría unidades. La conversión a dólares es $0,011 por cada 1.000 Neurons.

### 10.7 URLs a registrar

| Dónde | Valor |
|---|---|
| GitHub OAuth App → *Authorization callback URL* | `https://<ref>.supabase.co/auth/v1/callback` |
| Supabase Auth → *Site URL* | la URL del Worker o tu dominio |
| Supabase Auth → *Redirect URLs* | `https://<tu-dominio>/auth/callback` y `http://localhost:3000/auth/callback` |

### 10.8 Migraciones

No se corren desde el Worker. Se aplican como paso explícito antes de desplegar, desde tu máquina contra `DIRECT_URL`:

```bash
bun run db:migrate
```
