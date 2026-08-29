# DevTracker

Dashboard personal para registrar y seguir los problemas, bugs e ideas que aparecen mientras desarrollás — el reemplazo del cuaderno de papel. Integrado con GitHub y con una capa de IA sobre OpenRouter.

El plan completo de implementación, con las decisiones de arquitectura y sus porqués, está en [PLAN.md](./PLAN.md).

## Stack

| Capa | Herramienta |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions, Cache Components) |
| UI | shadcn/ui sobre Base UI (estilo `base-nova`) + Tailwind v4 |
| Base de datos | Supabase Cloud (Postgres + pgvector) |
| ORM | Drizzle (esquema, migraciones y consultas) |
| Auth | Supabase Auth con GitHub como proveedor OAuth |
| GitHub | Octokit |
| IA | OpenRouter vía SDK de OpenAI (sólo servidor) |
| Embeddings | Cloudflare Workers AI (`@cf/baai/bge-m3`) |
| Deploy | Coolify (contenedor Docker), en el mismo equipo que Supabase |

## Estado

- ✅ **Fase 1** — proyecto, esquema con RLS, login con GitHub y protección de rutas
- ⬜ Fase 2 — CRUD de problemas y proyectos (tabla + kanban)
- ⬜ Fase 3 — dashboard de métricas
- ⬜ Fase 4 — integración con GitHub
- ⬜ Fase 5 — capa de IA, Ajustes y captura en lenguaje natural
- ⬜ Fase 6 — duplicados, vinculación de commits, resumen semanal, insights y consumo

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. Guardá la contraseña de la base: aparece una sola vez.
3. **Project Settings → Data API**: copiá el *Project URL* y la *anon public key*.
4. **Project Settings → API Keys**: copiá la *service_role key*.
5. **Project Settings → Database → Connection string → URI**: copiá la cadena del puerto **5432**, la **conexión directa**, no la pooled. Hyperdrive hace el pooling por su cuenta.

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

`ENCRYPTION_KEY` cifra el provider token de GitHub y tu API key de OpenRouter antes de guardarlos en la base. **Si la perdés o la rotás, esos secretos quedan ilegibles** y hay que reconectar GitHub y volver a cargar la API key.

### 5. Migraciones

```bash
bun run db:migrate
```

Aplica dos migraciones:

- `0000_inicial` — extensiones, enums, 14 tablas e índices (incluido el HNSW de pgvector).
- `0001_rls_y_triggers` — Row Level Security en todas las tablas, triggers de `updated_at` e índices de búsqueda por texto.

### 6. Levantar la app

```bash
bun run dev
```

En `http://localhost:3000` deberías caer en `/login` y poder entrar con GitHub.

---

## Sobre la seguridad de los datos

**Row Level Security no es lo que te aísla de otros usuarios en esta app.** Vale la pena entender por qué:

- La app consulta con **Drizzle**, conectándose con el rol dueño de la base, que **bypassea RLS**. El aislamiento real lo garantiza el código: cada consulta arranca por `requireUser()` ([lib/auth/require-user.ts](./lib/auth/require-user.ts)) y filtra por el `user_id` de la sesión verificada en el servidor.
- **RLS es defensa en profundidad.** La `anon key` de Supabase es pública y llega al navegador; sin políticas, cualquiera podría leer las tablas por la API REST de Supabase. Con ellas, no. Además se revoca todo acceso del rol `anon` a las tablas de dominio.
- El **proxy** ([proxy.ts](./proxy.ts)) protege las rutas, pero tampoco es la barrera: un cambio en el `matcher` puede dejar una ruta afuera sin que se note, y una server action se puede invocar directamente. Por eso la autorización se verifica **también** dentro de cada server action.

Las tres capas están a propósito. Ninguna sola alcanza.

---

## Despliegue en Coolify

### Recurso

1. Nueva aplicación → repositorio Git → rama `main` → build pack **Dockerfile** → puerto `3000`.
2. Dominio con HTTPS (Coolify emite el certificado con Let's Encrypt). **Sin HTTPS el OAuth no funciona.**
3. Health check apuntando a `/api/health`.

### Variables: build-time vs runtime

Esta distinción rompe deploys si se pasa por alto.

**Build args** (se hornean en el bundle del cliente — cambiarlas exige *rebuild*, no un restart):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_APP_URL
```

**Runtime** (nunca llegan al navegador):

```
DATABASE_URL  DIRECT_URL  SUPABASE_SERVICE_ROLE_KEY  ENCRYPTION_KEY
OPENROUTER_API_KEY  CLOUDFLARE_ACCOUNT_ID  CLOUDFLARE_API_TOKEN
CRON_SECRET  ALLOWED_EMAILS  ALLOWED_GITHUB_LOGINS
```

### Migraciones

**No** las corras en el arranque del contenedor: con varias réplicas se pisan. Corrélas como paso explícito antes de desplegar, desde tu máquina o como comando manual en Coolify:

```bash
bun run db:migrate
```

### Tarea programada (Fase 6)

Coolify → *Scheduled Tasks* → `0 18 * * 5` (viernes 18:00):

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-summary
```

### Recursos del servidor

Mínimo 1 GB de RAM; 4 GB si además buildeás en la misma máquina. Si el server es chico, buildeá la imagen en GitHub Actions, publicala en `ghcr.io` y que Coolify sólo la despliegue.

---

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
bun run dev          # servidor de desarrollo
bun run build        # build de producción
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run format       # prettier
bun run db:generate  # generar migración desde el esquema
bun run db:migrate   # aplicar migraciones
bun run db:studio    # explorador de la base
```
