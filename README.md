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

Aplica todas las migraciones de [drizzle/](./drizzle) en orden. Las que hay que
conocer:

- `0000_inicial` — extensiones, enums, 14 tablas e índices (incluido el HNSW de pgvector).
- `0001_rls_y_triggers` — Row Level Security en todas las tablas, triggers de `updated_at` e índices de búsqueda por texto.
- `0010_areas_y_adjuntos` — áreas por proyecto, y el **bucket privado `adjuntos`** de Supabase Storage con sus políticas. No hace falta crear nada a mano en el panel de Supabase.

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

**Con las fotos de los problemas es al revés: ahí RLS sí es la barrera.** El
navegador sube la imagen directo al bucket `adjuntos` con la `anon key` —no pasa
por el servidor de Next— así que lo único que decide qué puede escribir y leer
cada cuenta son las políticas de `storage.objects` que crea la migración 0010.
Están armadas sobre la primera carpeta de la ruta (`<user_id>/<issue_id>/…`), y
el bucket es privado: las imágenes se muestran con URLs firmadas que caducan a
la hora. La server action que registra la foto vuelve a verificar la ruta antes
de guardar la fila.

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
| Todos los días 07:00 | `/api/cron/usage` | piso del monitor de consumo; el reloj real es GitHub Actions (ver abajo) |

Vercel manda `Authorization: Bearer $CRON_SECRET` en cada disparo, que es lo que valida el handler del resumen.

> En el plan **Hobby** los crons corren como mucho una vez por día y con una precisión de ±59 minutos: el resumen del viernes sale en algún momento entre las 18:00 y las 18:59.

### Plan requerido

**Hobby alcanza.** Las dos restricciones que se notan son el timeout de 60 s por función —de ahí el presupuesto de tiempo del colector de consumo— y que cada cron corre como mucho una vez por día.

### Migraciones

No se corren desde el Worker. Aplicalas como paso explícito antes de desplegar, desde tu máquina contra `DIRECT_URL`:

```bash
bun run db:migrate
```

### Cron del resumen semanal

Está declarado en [vercel.json](./vercel.json) y corre los viernes a las 18:00 UTC. Para probarlo sin esperar:

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
bun run dev          # servidor de desarrollo
bun run build        # next build
bun run start        # servir el build
bun run typecheck    # tsc --noEmit
bun run lint         # eslint
bun run format       # prettier
bun run db:generate  # generar migración desde el esquema
bun run db:migrate   # aplicar migraciones
bun run db:studio    # explorador de la base
bun run sondear:uso  # sondear las APIs del monitor de consumo
```

El deploy no tiene comando: Vercel corre `next build` con cada push a `main`.

El ping diario a `/api/health` existe porque **Supabase pausa los proyectos del
plan gratuito tras 7 días sin actividad de base de datos**, y sólo cuentan las
consultas reales: entrar al panel no alcanza. Corre a diario y no semanal para
que una corrida fallida no deje el proyecto al borde de pausarse.

Para probar cualquiera de los crons sin esperar al horario:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/weekly-summary
```

También hay un botón «Generar resumen ahora» en la página Resúmenes.

---

## Monitor de consumo

La página **/consumo** junta en un solo lugar lo que están gastando todos los
proyectos de las cuentas de Vercel y Supabase más el estado de la cuenta de
OpenRouter, guarda la serie histórica y avisa por Telegram al cruzar un umbral.

### Qué se puede leer y qué no

Los planes gratuitos no exponen todo, y el monitor prefiere decirlo antes que
estimarlo: un número aproximado se ve igual de convincente que uno correcto.

| Fuente | Se lee | No se puede leer |
|---|---|---|
| **Vercel** | inventario de proyectos, plan de la cuenta, despliegues por día | **facturación y uso**: `/v1/billing/charges` devuelve `404 costs_not_found` en Hobby, y `/v2/observability/query` exige Observability Plus |
| **Supabase** | plan de la organización, estado del proyecto, tamaño de la base, disco usado y aprovisionado, peticiones diarias por servicio | **egress** y **usuarios activos**: no hay endpoint público, viven en la facturación de la organización |
| **OpenRouter** | gasto del mes, saldo, cuota diaria de modelos gratuitos | — (el desglose por modelo ya está en Ajustes, desde `ai_usage_log`) |

El colector de Vercel intenta la facturación primero y cae a contar despliegues
si no está disponible; eso mide actividad, no costo, y la página lo aclara.

### Cuotas, planes y excedentes

El plan **se detecta**, no se declara: Supabase lo expone en
`/v1/organizations/{slug}` y Vercel en `/v2/teams`. Un plan mal escrito a mano
haría que todas las barras mientan sin que nadie lo note.

Los topes de cada plan viven en la tabla `plan_quotas`, no en el código, y están
verificados contra las páginas de precios el 2026-09-17. Un toggle en /consumo
permite mirar el mismo consumo contra las cuotas de otro plan —para ver cuánto
costaría antes de pagarlo—; cuando el plan de la vista no es el real, la tarjeta
lo dice. **Las alertas se evalúan siempre contra el plan real**, porque una
alerta tiene que dispararse contra la cuota que te van a cobrar.

Cuando el plan factura excedente y el consumo se pasa, la barra muestra cuánto
te pasaste y cuánto cuesta. En Free no se muestra excedente a propósito: el plan
no factura de más, corta.

Tres números de Supabase que **no son el mismo** y cada plan factura uno
distinto — confundirlos es el error caro de este panel:

| Métrica | Qué es | Quién la factura |
|---|---|---|
| Tamaño de la base | lo que ocupan tus datos (14 MB acá) | Free: 500 MB incluidos |
| Disco usado | lo que ocupa el volumen, con WAL y overhead (277 MB acá) | nadie; sirve para saber si te quedás sin lugar |
| Disco aprovisionado | el volumen contratado (1,93 GB acá) | Pro: 8 GB incluidos, USD 0,125 por GB |

Lo que **no** lleva barra, porque no hay tope que mostrar: las peticiones a
Supabase son ilimitadas en todos los planes según su propia página de precios, y
los despliegues de Vercel no tienen cuota. Se muestran como número, con el
motivo al lado.

### Credenciales

Todas opcionales: sin ellas la app arranca igual y el bloque correspondiente de
/consumo explica qué falta. Están documentadas en [.env.example](./.env.example).

| Variable | De dónde sale |
|---|---|
| `VERCEL_TOKEN` | vercel.com/account/settings/tokens |
| `VERCEL_TEAM_ID` | sólo si los proyectos viven en un equipo |
| `SUPABASE_PAT` | supabase.com/dashboard/account/tokens — **da acceso a todos tus proyectos** |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` |
| `TELEGRAM_CHAT_ID` | mandale un mensaje al bot y corré `bun run sondear:uso --fuente=telegram` |
| `TELEGRAM_WEBHOOK_SECRET` | `openssl rand -hex 32` |

Antes de tocar nada conviene sondear, porque lo que responde tu plan no siempre
es lo que documenta el proveedor:

```bash
bun run sondear:uso                    # todo
bun run sondear:uso --fuente=vercel    # una fuente
bun run sondear:uso --registrar-webhook  # alta del webhook de Telegram (una vez)
```

### Los dos relojes

En Hobby, cada cron de Vercel corre **como mucho una vez por día** y con ±59 min
de imprecisión. Para un monitor de cuotas eso no alcanza: una alerta de «estás
tocando el límite» que llega al día siguiente no sirve. Entonces:

- **GitHub Actions**, cada hora ([.github/workflows/usage.yml](./.github/workflows/usage.yml)).
  Es el reloj real. Necesita dos secretos en el repo: `CRON_SECRET` y `APP_URL`.
- **Vercel Cron**, una vez al día. Es el piso que no se apaga: GitHub deshabilita
  los workflows programados tras 60 días sin commits, y cuando eso pasa esta
  corrida es la que dispara la alerta de «hace rato que no se recolecta».

La recolección es idempotente —los snapshots se upsertean por (recurso, métrica,
día)— así que correrla de más no duplica nada.

### Alertas

Las reglas se editan en /consumo y vienen sembradas cinco por la migración: disco
de Supabase al 80 %, proyecto pausado, gasto de OpenRouter, cargos de Vercel y la
antigüedad de la propia recolección.

Cada alerta se manda **una sola vez por período y por recurso**: el candado es un
UNIQUE en `alert_events`, no una variable en memoria. El evento nace `pendiente` y
pasa a `enviada` sólo cuando Telegram lo aceptó, así un fallo del bot se reintenta
en la corrida siguiente en vez de quemar el período. Si Telegram nunca contesta,
la alerta igual queda visible en /consumo: la página es la fuente de verdad, el
bot es el canal.

Comandos del bot: `/consumo`, `/limites`, `/silencio 24h` (o `7d`, o `off`).

