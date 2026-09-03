# DevTracker

Dashboard personal para registrar y seguir los problemas, bugs e ideas que aparecen mientras desarrollás — el reemplazo del cuaderno de papel. Integrado con GitHub y con una capa de IA sobre OpenRouter.

El plan completo de implementación, con las decisiones de arquitectura y sus porqués, está en [PLAN.md](./PLAN.md).

## Stack

| Capa | Herramienta |
|---|---|
| Framework | Next.js 16 (App Router, Server Actions) |
| UI | shadcn/ui sobre Base UI (estilo `base-nova`) + Tailwind v4 |
| Base de datos | Supabase Cloud (Postgres + pgvector) |
| ORM | Drizzle (esquema, migraciones y consultas) |
| Auth | Supabase Auth con GitHub como proveedor OAuth |
| GitHub | Octokit |
| IA | OpenRouter (`/chat/completions`, sólo servidor) |
| Embeddings | OpenRouter (`openai/text-embedding-3-small`, recortado a 1024 dims) |
| Deploy | Vercel (+ Vercel Cron) |

## Estado

- ✅ **Fase 1** — proyecto, esquema con RLS, login con GitHub y protección de rutas
- ✅ **Fase 2** — CRUD de problemas y proyectos (tabla + kanban)
- ✅ **Fase 3** — dashboard de métricas
- ✅ **Fase 4** — integración con GitHub
- ✅ **Fase 5** — capa de IA, Ajustes y captura en lenguaje natural
- ✅ **Fase 6** — duplicados, vinculación de commits, resumen semanal, insights y consumo

---

## Puesta en marcha

### 1. Crear el proyecto en Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com) (el plan gratuito alcanza).
2. Guardá la contraseña de la base: aparece una sola vez.
3. **Project Settings → Data API**: copiá el *Project URL* y la *anon public key*.
4. **Connection strings**: necesitás **las dos**, y no son intercambiables.

   | Cuál | Variable | Para qué | Dónde |
   |---|---|---|---|
   | **Transaction pooler** (`…pooler.supabase.com:6543`) | `DATABASE_URL` | la app | Connect → *Transaction pooler* |
   | **Session pooler** (`…pooler.supabase.com:5432`) | `DIRECT_URL` | `drizzle-kit`: migraciones | Connect → *Session pooler* |

   > ⚠️ **Por qué dos.** La app corre en funciones serverless, que aparecen y desaparecen todo el tiempo: sin un pooler del lado del servidor la base se queda sin conexiones. El **modo transacción** (6543) es el indicado para eso. No soporta prepared statements con nombre, pero drizzle sólo los usa si se pide `.prepare()` explícitamente, y en este proyecto no se usa en ningún lado.
   >
   > Las **migraciones** son otra cosa: hacen DDL y necesitan una sesión de verdad, así que van por el **modo sesión** (5432).
   >
   > La connection string **directa** (`db.<ref>.supabase.co`) no sirve para ninguna de las dos: desde enero de 2024 resuelve **sólo a IPv6** y desde una red IPv4 tira `getaddrinfo ENOTFOUND`.

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

### 6. Configurar la IA

Sacá una API key en [openrouter.ai](https://openrouter.ai) y ponela en `OPENROUTER_API_KEY`. Es **una sola credencial para todo**: OpenRouter sirve el chat con tool calling por `/chat/completions` y los embeddings por `/embeddings`.

Sin ella la app arranca igual y todo lo que no es IA funciona normal; las funciones de IA fallan con un mensaje que dice qué falta.

Qué modelo usa cada tarea no se configura por variable de entorno: sale de la tabla `user_ai_settings` y se elige desde la página de **Ajustes**.

### 7. Levantar la app

```bash
bun run dev
```

En `http://localhost:3000` deberías caer en `/login` y poder entrar con GitHub.

---

## Sobre buscadores

La app está **entera detrás del login**, así que no hay nada que posicionar:
los metadatos declaran `noindex, nofollow`. Que la instancia aparezca en
buscadores no aportaría nada y expondría su existencia.

Lo que sí está cuidado es el resto del paquete: título de pestaña, favicon,
color de la barra del navegador y un `manifest.webmanifest` que hace que
«agregar a pantalla de inicio» funcione bien en el celular — que es
justamente el caso de uso de anotar un problema en el momento.

## Sobre la seguridad de los datos

**Row Level Security no es lo que te aísla de otros usuarios en esta app.** Vale la pena entender por qué:

- La app consulta con **Drizzle**, conectándose con el rol dueño de la base, que **bypassea RLS**. El aislamiento real lo garantiza el código: cada consulta arranca por `requireUser()` ([lib/auth/require-user.ts](./lib/auth/require-user.ts)) y filtra por el `user_id` de la sesión verificada en el servidor.
- **RLS es defensa en profundidad.** La `anon key` de Supabase es pública y llega al navegador; sin políticas, cualquiera podría leer las tablas por la API REST de Supabase. Con ellas, no. Además se revoca todo acceso del rol `anon` a las tablas de dominio.
- El **proxy** ([proxy.ts](./proxy.ts)) protege las rutas, pero tampoco es la barrera: un cambio en el `matcher` puede dejar una ruta afuera sin que se note, y una server action se puede invocar directamente. Por eso la autorización se verifica **también** dentro de cada server action.

Las tres capas están a propósito. Ninguna sola alcanza.

---

## Despliegue en Vercel

Desplegado en: **https://devtracker.maxherr.com**

El deploy es automático con cada push a `main`. No hay comando: Vercel corre `next build` por su cuenta.

> Hasta septiembre de 2026 esto corría en **Cloudflare Workers** con vinext, Hyperdrive, KV y Workers AI. El porqué de aquella arquitectura está en [PLAN.md](./PLAN.md); la nota del principio de ese archivo explica qué quedó superado.

### Variables de entorno

Van en el panel de Vercel (Project Settings → Environment Variables), no en el repo:

`DATABASE_URL`, `ENCRYPTION_KEY`, `OPENROUTER_API_KEY`, `CRON_SECRET` y, para que la instancia sea de uso personal, `ALLOWED_GITHUB_LOGINS`.

> Sin `ALLOWED_GITHUB_LOGINS` ni `ALLOWED_EMAILS`, cualquiera con una cuenta de GitHub puede entrar a la instancia desplegada y crear sus propios datos.

Las **`NEXT_PUBLIC_*` son distintas**: se hornean en el bundle del cliente durante `next build`, así que tienen que estar cargadas **antes** de buildear. Cambiarlas exige un redeploy, no alcanza con guardarlas.

> ⚠️ Al cambiar de dominio, agregá la URL de producción en Supabase:
> **Authentication → URL Configuration → Redirect URLs** →
> `https://devtracker.maxherr.com/auth/callback`.
> Sin eso el login falla, porque Supabase rechaza el redirect.

### Tareas programadas

Las declara [vercel.json](./vercel.json) y las corre Vercel Cron:

| Cuándo | Qué | Por qué |
|---|---|---|
| Viernes 18:00 | `/api/cron/weekly-summary` | el resumen de la semana |
| Todos los días 09:00 | `/api/health` | Supabase pausa los proyectos gratuitos a los 7 días sin actividad de base |

Vercel manda `Authorization: Bearer $CRON_SECRET` en cada disparo, que es lo que valida el handler del resumen.

> En el plan **Hobby** los crons corren como mucho una vez por día y con una precisión de ±59 minutos: el resumen del viernes sale en algún momento entre las 18:00 y las 18:59.

### Plan requerido

**Workers Paid ($5/mes).** En el plan Free el límite de 10 ms de CPU por request hace inviable el SSR, y el bundle tiene tope de 3 MiB comprimido (10 MiB en Paid). El tiempo de espera de I/O —las llamadas de inferencia— no cuenta como CPU, así que el streaming de resúmenes no es problema.

### Migraciones

No se corren desde el Worker. Aplicalas como paso explícito antes de desplegar, desde tu máquina contra `DIRECT_URL`:

```bash
bun run db:migrate
```

### Cron del resumen semanal

Ya está declarado en `wrangler.jsonc` y se activa al desplegar:

```jsonc
"triggers": { "crons": ["0 18 * * 5"] }
```

Corre los viernes a las 18:00 UTC. Para probarlo sin esperar:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-summary
```

Es idempotente por semana: si el resumen ya existe no lo regenera, así un
reintento no duplica ni gasta tokens. También hay un botón "Generar resumen
ahora" en la página Resúmenes.

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

### Tareas programadas

Viven en un **Worker aparte** (`workers/cron`), no en el de la app:

```bash
bun run deploy:cron
```

> **Por qué separado.** vinext expone únicamente un handler de `fetch`
> (`vinext/server/fetch-handler`), no uno de `scheduled`. Un `triggers.crons`
> declarado en el Worker de la app haría que Cloudflare dispare el evento
> contra un Worker que no sabe atenderlo, y la tarea nunca correría. El Worker
> de cron no tiene lógica propia: sólo llama a los endpoints de la app.

Dos horarios:

| Cron | Qué hace |
|---|---|
| `0 18 * * 5` | Resumen semanal, viernes 18:00 UTC |
| `0 12 * * *` | Ping diario a `/api/health` para que Supabase no pause el proyecto |

El ping existe porque **Supabase pausa los proyectos del plan gratuito tras 7
días sin actividad de base de datos**, y sólo cuentan las consultas reales:
entrar al panel no alcanza. `/api/health` hace un `select 1` a través de
Hyperdrive, así que sirve como señal de vida. Corre a diario y no semanal para
que una corrida fallida no deje el proyecto al borde de pausarse.

Necesita su propio `CRON_SECRET`, el mismo que la app:

```bash
wrangler secret put CRON_SECRET --config workers/cron/wrangler.jsonc --cwd workers/cron
```

Para probar sin esperar al horario:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "https://devtracker-cron.max-herr-88.workers.dev/?tarea=ping"
```

Cambiá `tarea=ping` por `tarea=resumen` para disparar el resumen semanal.
También hay un botón «Generar resumen ahora» en la página Resúmenes.

