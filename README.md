# DevTracker

Dashboard personal para registrar y seguir los problemas, bugs e ideas que aparecen mientras desarrollás — el reemplazo del cuaderno de papel. Integrado con GitHub y con una capa de IA sobre Cloudflare Workers AI.

El plan completo de implementación, con las decisiones de arquitectura y sus porqués, está en [PLAN.md](./PLAN.md).

## Stack

| Capa | Herramienta |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) sobre **vinext** (Vite) |
| UI | shadcn/ui sobre Base UI (estilo `base-nova`) + Tailwind v4 |
| Base de datos | Supabase Cloud (Postgres + pgvector) |
| ORM | Drizzle (esquema, migraciones y consultas) |
| Auth | Supabase Auth con GitHub como proveedor OAuth |
| GitHub | Octokit |
| IA | Cloudflare Workers AI, binding `AI` (sólo servidor) |
| Embeddings | Cloudflare Workers AI (`@cf/baai/bge-m3`), binding `AI` |
| Deploy | Cloudflare Workers (+ Hyperdrive, KV, Workers AI) |

## Estado

- ✅ **Fase 1** — proyecto, esquema con RLS, login con GitHub y protección de rutas
- ✅ **Fase 2** — CRUD de problemas y proyectos (tabla + kanban)
- ✅ **Fase 3** — dashboard de métricas
- ✅ **Fase 4** — integración con GitHub
- ✅ **Fase 5** — capa de IA (Workers AI), Ajustes y captura en lenguaje natural
- ⬜ Fase 6 — duplicados, vinculación de commits, resumen semanal, insights y consumo

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. Guardá la contraseña de la base: aparece una sola vez.
3. **Project Settings → Data API**: copiá el *Project URL* y la *anon public key*.
4. **Project Settings → API Keys**: copiá la *service_role key*.
5. **Connection strings**: necesitás **las dos**, y no son intercambiables.

   | Cuál | Para qué | Dónde |
   |---|---|---|
   | **Directa** (`db.<ref>.supabase.co:5432`) | crear el binding de Hyperdrive (producción) | Connect → *Direct connection* |
   | **Session pooler** (`aws-N-<region>.pooler.supabase.com:5432`) | `.env.local`: desarrollo y migraciones | Connect → *Session pooler* |

   > ⚠️ **Por qué dos.** Desde enero de 2024 la conexión directa resuelve **sólo a IPv6**. Desde una red IPv4 tira `getaddrinfo ENOTFOUND`, así que no sirve para trabajar localmente ni para correr las migraciones desde tu máquina. Cloudflare sí la alcanza, y Hyperdrive pide explícitamente la directa porque el pooling lo hace él.
   >
   > Del pooler usá el puerto **5432** (session mode), no el **6543** (transaction mode): ese último no soporta bien los prepared statements ni el DDL de las migraciones.
   >
   > Si preferís una sola string, Supabase vende un add-on de IPv4 que hace la directa alcanzable por IPv4.

> Las extensiones `vector` y `pg_trgm` las habilita la primera migración; no hace falta tocarlas a mano.

### 2. Crear el GitHub OAuth App

1. GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. *Homepage URL*: `http://localhost:3000` (o tu dominio en producción).
3. *Authorization callback URL*: **la de Supabase, no la de tu app**:
   ```
   https://<ref-del-proyecto>.supabase.co/auth/v1/callback
   ```
4. Generá un *Client secret* y guardá ambos valores.

### 3. Configurar el proveedor en Supabase

1. **Authentication → Sign In / Providers → GitHub**: activalo y pegá el Client ID y el Client Secret.
2. **Authentication → URL Configuration**:
   - *Site URL*: `http://localhost:3000` en desarrollo, tu dominio en producción.
   - *Redirect URLs*: agregá **las dos** desde el principio, así no hay que volver acá al desplegar:
     ```
     http://localhost:3000/auth/callback
     https://devtracker.tu-dominio.com/auth/callback
     ```

### 4. Variables de entorno

```bash
cp .env.example .env.local
```

Completá los valores de Supabase y generá las claves propias:

```bash
openssl rand -base64 32   # → ENCRYPTION_KEY
```

```bash
openssl rand -hex 32      # → CRON_SECRET
```

`ENCRYPTION_KEY` cifra el provider token de GitHub antes de guardarlo en la base. **Si la perdés o la rotás, ese token queda ilegible** y hay que reconectar GitHub.

### 5. Migraciones

```bash
bun run db:migrate
```

Aplica dos migraciones:

- `0000_inicial` — extensiones, enums, 14 tablas e índices (incluido el HNSW de pgvector).
- `0001_rls_y_triggers` — Row Level Security en todas las tablas, triggers de `updated_at` e índices de búsqueda por texto.

### 6. Crear los bindings de Cloudflare

```bash
npx wrangler kv namespace create VINEXT_KV_CACHE
```

```bash
npx wrangler hyperdrive create devtracker-db --connection-string="<la connection string directa de Supabase>"
```

Copiá los dos ids que devuelven a `wrangler.jsonc`, reemplazando `<your-kv-namespace-id>` y `<your-hyperdrive-id>`. Después regenerá los tipos:

```bash
bun run cf-typegen
```

### 7. Levantar la app

```bash
bun run dev
```

Corre sobre **workerd** (el mismo runtime que producción), no sobre Node. En `http://localhost:3000` deberías caer en `/login` y poder entrar con GitHub.

---

## Sobre la seguridad de los datos

**Row Level Security no es lo que te aísla de otros usuarios en esta app.** Vale la pena entender por qué:

- La app consulta con **Drizzle**, conectándose con el rol dueño de la base, que **bypassea RLS**. El aislamiento real lo garantiza el código: cada consulta arranca por `requireUser()` ([lib/auth/require-user.ts](./lib/auth/require-user.ts)) y filtra por el `user_id` de la sesión verificada en el servidor.
- **RLS es defensa en profundidad.** La `anon key` de Supabase es pública y llega al navegador; sin políticas, cualquiera podría leer las tablas por la API REST de Supabase. Con ellas, no. Además se revoca todo acceso del rol `anon` a las tablas de dominio.
- El **proxy** ([proxy.ts](./proxy.ts)) protege las rutas, pero tampoco es la barrera: un cambio en el `matcher` puede dejar una ruta afuera sin que se note, y una server action se puede invocar directamente. Por eso la autorización se verifica **también** dentro de cada server action.

Las tres capas están a propósito. Ninguna sola alcanza.

---

## Despliegue en Cloudflare Workers

### Por qué Workers y no Pages

- **Pages Functions no soporta cron triggers**: el resumen semanal de los viernes no podría correr.
- Cloudflare absorbió Pages dentro de Workers; las features nuevas salen sólo ahí.
- Para Next.js, Cloudflare recomienda hoy **vinext**. OpenNext quedó como legacy.

### Desplegar

```bash
bun run build && bun run deploy
```

Para probar el Worker buildeado localmente antes de desplegar:

```bash
bun run preview
```

### Secretos

Las variables de runtime van como secretos del Worker, no en el repo:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Lo mismo con `ENCRYPTION_KEY`, `DATABASE_URL`, `CRON_SECRET`, `ALLOWED_EMAILS` y `ALLOWED_GITHUB_LOGINS`.

> No hay API key de IA: Workers AI se accede por el binding `AI` declarado en `wrangler.jsonc`.

Las **`NEXT_PUBLIC_*` son distintas**: se hornean en el bundle del cliente durante `vinext build`, así que tienen que estar en el entorno **al buildear**. Cambiarlas exige rebuild, no basta con redesplegar.

### Plan requerido

**Workers Paid ($5/mes).** En el plan Free el límite de 10 ms de CPU por request hace inviable el SSR, y el bundle tiene tope de 3 MiB comprimido (10 MiB en Paid). El tiempo de espera de I/O —las llamadas de inferencia— no cuenta como CPU, así que el streaming de resúmenes no es problema.

### Migraciones

No se corren desde el Worker. Aplicalas como paso explícito antes de desplegar, desde tu máquina contra `DIRECT_URL`:

```bash
bun run db:migrate
```

### Cron (Fase 6)

En `wrangler.jsonc`:

```jsonc
"triggers": { "crons": ["0 18 * * 5"] }
```

## Acceso restringido (opcional)

Para que la instancia desplegada sea de uso personal, definí alguna de estas variables:

```
ALLOWED_EMAILS=vos@ejemplo.com
ALLOWED_GITHUB_LOGINS=tu-usuario
```

Se validan en el callback de OAuth: si el usuario no está en la lista, se cierra la sesión antes de crear ninguna fila. Con ambas vacías, la instancia es abierta.

---

## Comandos

```bash
bun run dev          # servidor de desarrollo (vinext, sobre workerd)
bun run build        # build del Worker
bun run preview      # correr el Worker buildeado con wrangler
bun run deploy       # desplegar a Cloudflare
bun run cf-typegen   # regenerar los tipos de los bindings
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run format       # prettier
bun run db:generate  # generar migración desde el esquema
bun run db:migrate   # aplicar migraciones
bun run db:studio    # explorador de la base
```

> No hay `next dev` ni `next build`: el build lo hace Vite vía vinext. Mantener los de Next daría una verificación falsa, porque pueden pasar mientras el build del Worker falla.
