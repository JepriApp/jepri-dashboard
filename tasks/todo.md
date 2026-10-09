# Tareas: Chatbot de pedidos (Telegram PoC)

Referencia de diseño: `documentacion/chatbot_diseno.md`. Plan narrativo y checklist por
fase: `tasks/plan.md`. Cada tarea abajo sigue la estructura de la skill de planning —
descripción, criterios de aceptación, verificación, dependencias, archivos y tamaño.

---

## Tarea 1: Provisión de credenciales de Telegram y datos de prueba

**Descripción:** Crear el bot de Telegram vía BotFather, obtener su token, y preparar al
menos un `customer` de prueba con `whatsapp_id` apuntando al `chat_id` de una cuenta de
Telegram de prueba — **en el Supabase self-hosted de `10.85.96.51:8000`, nunca en Neptuno**
(producción). Confirmar también que existe (o crear a mano, ahí mismo) un
`distribution_plan` en estado `planned` con `plan_date` futura, y que el esquema de esa
instancia está al día con Neptuno antes de seguir.

**Acceptance criteria:**
- [x] `TELEGRAM_BOT_TOKEN` obtenido y guardado en `.env.local` (no commiteado) — bot `@Jepridevbot`
- [x] Un `customer` de prueba existe en `10.85.96.51:8000` con `whatsapp_id` = chat_id numérico de una cuenta de Telegram de prueba — `id=28679e91-8caa-45f4-b5f5-3ed04f9decf9`, `whatsapp_id=8703567026`
- [x] Existe un `distribution_plan` en `10.85.96.51:8000` con `status='planned'` y `plan_date` mayor a hoy — `id=15dd9d04-d2f8-4cd1-b70a-8f4049ac56bc`, `plan_date=2026-10-09` (recreado en la Tarea 8 — el original `b309a891...` se perdió en un incidente de fixtures de test, ver nota en la Tarea 8)
- [x] El esquema de `10.85.96.51:8000` (tablas/vistas de `sale_order`, `distribution_plan`, `customer`) está al día con Neptuno — confirmado tras restauración, `customer.whatsapp_id` presente

**Verification:**
- [x] Manual: `curl https://api.telegram.org/bot<token>/getMe` respondió con los datos del bot
- [x] Manual, contra `10.85.96.51:8000`: fila de `customer` confirmada vía `docker exec -it supabase-db psql -U postgres`
- [x] Manual, contra `10.85.96.51:8000`: fila de `distribution_plan` confirmada de la misma forma

**Nota de infraestructura (resuelta):** `supabase-db` no tiene puerto propio mapeado al
host, pero `supabase-pooler` (Supavisor, puerto 5432) sí funciona — el tenant no es
`realtime-dev` (ese es solo el nombre del contenedor de `realtime`), es el placeholder por
defecto del self-hosted de Supabase: `your-tenant-id`, nunca personalizado al levantar el
servidor. Conexión directa que funciona:

```bash
PGPASSWORD="$DEV_POSTGRES_PASSWORD" psql "host=10.85.96.51 port=5432 user=postgres.your-tenant-id dbname=postgres"
```

Con esto ya no hace falta relayar por `docker exec` ni exponer un puerto nuevo — las
Tareas 4-6 pueden iterar directo contra esta instancia.

**Dependencies:** None

**Files likely touched:**
- `.env.local` (no versionado)

**Estimated scope:** XS (sin código)

---

## Tarea 2: Harness de pruebas automatizadas (Vitest + pgTAP)

**Descripción:** Montar el sistema de pruebas desde cero (el repo no tiene ninguno hoy).
Dos piezas:
- **Vitest** para la capa TypeScript — `vitest.config.ts` con soporte del alias `@/*`
  (igual que `tsconfig.json`), script `"test": "vitest run"` y `"test:watch": "vitest"` en
  `package.json`.
- **pgTAP** para las funciones de Postgres — habilitar la extensión en el proyecto local de
  Supabase y usar `supabase test db` (el CLI ya es devDependency) para correr archivos
  `.sql` de test contra una instancia local (`supabase start`), con rollback automático por
  test.

Esto es fundación: no prueba nada del bot todavía, solo deja el harness listo para que las
Fases 1-5 lo usen en vez de verificación manual.

**Acceptance criteria:**
- [x] `npm run test` ejecuta Vitest (validado con una suite trivial que se corrió y se borró)
- [x] Las funciones pgTAP corren contra la instancia real (validado con una suite trivial de éxito y una de fallo forzado, ambas borradas)
- [x] Documentado cómo correr ambos (abajo, en esta tarea, y en `scripts/run_pgtap_tests.sh`)

**Verification:**
- [x] `npm run test` salió en verde con la suite de ejemplo (y en rojo con "No test files found" al borrarla — comportamiento esperado hasta la Tarea 5+)
- [x] `npm run test:db` corrió pgTAP contra staging sin errores de configuración, y detectó correctamente una falla forzada (exit code 1)
- [x] `npm run build` sigue pasando

**Desviación del diseño original (documentada):** `supabase test db --db-url` (pensado
originalmente para esto) **fuerza TLS**, y el self-hosted de staging no lo soporta — falla
con `tls error (server refused TLS connection)` incluso en una versión más nueva del CLI.
En vez de depender de `supabase start` (que necesita Docker, no disponible en este entorno)
o de ese flag, se construyó `scripts/run_pgtap_tests.sh`: corre cada archivo
`supabase/tests/database/*.sql` directo con `psql` contra `STAGING_DATABASE_URL` (nueva
variable en `.env.local`/`.env.local.example`), parseando la salida TAP (`not ok` → falla).
Cada archivo de test sigue envuelto en `begin; ... rollback;`, así que el rollback
automático por test se mantiene igual que lo diseñado, solo cambia el runner. La extensión
`pgtap` ya quedó habilitada (`create extension pgtap`) en la base de staging.

**Hallazgo incidental corregido:** al correr `npm run lint` para verificar que nada se
rompiera, apareció con **64,202 problemas** — resultó ser que `eslint.config.mjs` (flat
config de ESLint 9) nunca tuvo un `ignores` explícito, así que no respetaba `/.next/` de
`.gitignore` y lint-eaba el build generado completo. Es un bug preexistente, no causado por
esta tarea, pero bloqueaba verificar el lint real — se corrigió agregando
`{ ignores: [".next/**", "out/**", "build/**", "supabase/.temp/**"] }`. Tras el fix quedan
59 problemas reales, todos en archivos no relacionados con el bot (deuda de lint
preexistente, fuera de alcance).

**Cómo correr localmente:**
```bash
npm run test        # Vitest, una vez (CI-friendly)
npm run test:watch  # Vitest en modo watch
npm run test:db     # pgTAP contra STAGING_DATABASE_URL (supabase/tests/database/*.sql)
```

**Dependencies:** None (puede hacerse en paralelo con la Tarea 1)

**Files likely touched:**
- `vitest.config.mts` (`.mts`, no `.ts` — evita el warning de Vite sobre ESM/CJS)
- `package.json` (scripts `test`/`test:watch`/`test:db`; devDependency `vitest`, vía pnpm)
- `pnpm-lock.yaml`, `pnpm-workspace.yaml` (nuevo, registra los build scripts aprobados: core-js, sharp, supabase, unrs-resolver)
- `scripts/run_pgtap_tests.sh`
- `.env.local` (nueva var `STAGING_DATABASE_URL`, no commiteada) / `.env.local.example` (documentada)
- `eslint.config.mjs` (fix incidental de `ignores`, ver arriba)

**Estimated scope:** M (varios archivos de configuración, cero lógica de negocio)

---

## Tarea 3: Staging con Docker en el servidor propio

**Descripción:** `Dockerfile` multi-stage para la app de Next.js (deps → build → runtime,
usando `output: 'standalone'` en `next.config.ts` para una imagen liviana) y
`docker-compose.yml` para desplegarla en el servidor local del usuario, detrás de su reverse
proxy + HTTPS ya existente. Esto resuelve que Telegram no puede llamar a `localhost`: el
dominio propio del usuario es el entorno donde se prueban los webhooks reales en las Fases
3-5, antes de llegar a Vercel.

**Acceptance criteria:**
- [x] `docker build` produce una imagen que arranca con `docker run` y sirve la app en el puerto configurado
- [x] El contenedor lee toda su configuración de variables de entorno (`.env` en el servidor, no commiteado) — ningún secreto queda horneado en la imagen
- [x] El `.env` de staging apunta `NEXT_PUBLIC_SUPABASE_URL` (y las demás variables de Supabase) al self-hosted `10.85.96.51:8000`, **nunca** a Neptuno
- [x] El dominio propio del usuario, por HTTPS, sirve la app a través del reverse proxy existente apuntando a este contenedor — `https://jepri-staging.lab.ryumanakano.com`
- [x] El build y el deploy a Vercel siguen funcionando igual que antes (el `output: 'standalone'` no rompe nada ahí)

**Verification:**
- [x] Un agente en el servidor propio clonó la rama, construyó la imagen con `docker compose up -d --build` y la conectó a su reverse proxy (Caddy) existente
- [x] `curl -I https://jepri-staging.lab.ryumanakano.com/` → `200`, `via: Caddy`, título "Jepri" confirmado, `/auth/login` → `200`
- [x] `vercel deploy` (preview, no producción) de esta rama → `READY` en ~1 min, confirma que `output: 'standalone'` es inocuo en Vercel

**Automatización del deploy:** `scripts/deploy_staging.sh` (en el servidor, mismo clon):
`git fetch/reset --hard` a la rama + `docker compose up -d --build` + `docker image prune`,
en un solo comando. Documentado en el propio script cómo volverlo 100% automático por
cron si se quiere.

**Dependencies:** None (puede hacerse en paralelo con la Tarea 1/2)

**Files likely touched:**
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.staging.example`
- `scripts/deploy_staging.sh`
- `next.config.ts` (`output: 'standalone'`, y `ALLOW_SELF_HOSTED_SUPABASE_IMAGES` para que las fotos de producto del self-hosted carguen en un build de producción, no solo en `next dev`)

**Estimated scope:** M (4 archivos, infraestructura nueva)

---

## Checkpoint: Fase 0 / 0.5 — Fundaciones listas

- [ ] Credenciales de prueba, harness de tests y staging en Docker, los 3 funcionando
- [ ] Revisión antes de tocar el esquema de base de datos

---

## Tarea 4: Migración — tablas nuevas del bot + RLS sin policies

**Descripción:** Crear la migración de Supabase con las 5 tablas nuevas del diseño:
`product_canonical_group`, `product.canonical_group_id` (columna nueva, nullable, FK),
`bot_conversation_state`, `bot_processed_update`, `bot_interaction_log`, `bot_api_key`. RLS
activado y sin ninguna policy en las 5 (§11 del diseño) — deny-by-default. Se aplica primero
contra el self-hosted `10.85.96.51:8000` (staging) — Neptuno (producción) no se toca hasta
la Tarea 22.

**Acceptance criteria:**
- [x] Las 5 tablas/columna existen con exactamente los campos de §5.1, §8, §9, §10, §4.1 del diseño
- [x] RLS activado en las 5, sin ninguna policy creada
- [x] Ninguna tabla/columna existente se modifica ni se borra (solo `ALTER TABLE product ADD COLUMN`, nullable)

**Verification:**
- [x] Migración aplicada directo con `psql` contra staging (mismo motivo que Tarea 2: `supabase db push` tendría el mismo problema de TLS) — sin errores
- [x] pgTAP (`supabase/tests/database/bot_schema_rls.sql`, 12 asserts): RLS activado + 0 policies en las 5 tablas — `npm run test:db` en verde
- [x] Confirmado también con un cliente anon real vía REST: `SELECT` devuelve `[]` (filtrado por RLS), `INSERT` devuelve `401`/`42501 "new row violates row-level security policy"`
- [x] `npm run build` sigue pasando

**Dependencies:** Tarea 1, Tarea 2 (harness listo para escribir el test de RLS)

**Files likely touched:**
- `supabase/migrations/<timestamp>_bot_schema.sql`
- `supabase/tests/database/bot_schema_rls.sql`

**Estimated scope:** S (1-2 archivos)

---

## Tarea 5: Funciones Postgres `SECURITY DEFINER` — lecturas

**Descripción:** Implementar las 6 funciones de lectura de §5 del diseño:
`bot_resolve_customer`, `bot_validate_api_key`, `bot_get_active_plan`,
`bot_get_frequent_products`, `bot_search_catalog`, `bot_get_current_order`. Todas con
`SET search_path = public` fijo. `bot_get_frequent_products` y `bot_search_catalog` agrupan
por `coalesce(canonical_group_id, product.id)`.

**Acceptance criteria:**
- [x] Las 6 funciones existen, devuelven las columnas exactas especificadas en §5
- [x] `bot_search_catalog` usa `unaccent` si está disponible, con fallback a `ilike` simple si no
- [x] `bot_get_current_order` está acotado al plan activo (§3.1), no a todo el historial

**Verification:**
- [x] Probado manualmente contra los datos de la Tarea 1 antes de escribir la suite — las 6 funciones devuelven lo esperado, incluyendo "no match" para `bot_resolve_customer`/`bot_validate_api_key`
- [x] pgTAP (`supabase/tests/database/bot_read_functions.sql`, 16 asserts) con caso explícito para ambas ramas de `bot_search_catalog` — `npm run test:db` en verde, 28/28 asserts totales junto con `bot_schema_rls.sql`
- [x] Confirmado que ningún test dejó datos filtrados en staging tras el `ROLLBACK` (`bot_api_key` vacío, plan de la Tarea 1 intacto, sin `sale_order` del cliente de prueba, `unaccent` sigue instalada)

**Hallazgo corregido durante la tarea:** el primer `bot_search_catalog` usaba un `CASE`
estático que mencionaba `unaccent(...)` en el texto de la consulta — Postgres necesita
resolver esa función al **planear** la consulta, incluso en la rama que no se toma, así
que la función entera habría fallado si `unaccent` no estuviera instalada (justo el
fallback que el diseño pedía no romper). Se corrigió con SQL dinámico (`EXECUTE
format(...)`): la rama sin `unaccent` nunca menciona esa función en el texto que se
parsea. Verificado con `DROP EXTENSION unaccent` dentro de una transacción de prueba
(revertida al final).

También explícito: las 6 funciones se otorgan (`GRANT EXECUTE`) a `anon` y
`authenticated` — el bot llama vía el cliente Supabase normal (anon key), sin sesión de
`auth.uid()`, así que `SECURITY DEFINER` por sí solo no alcanza para que PostgREST las
exponga como RPC callables sin este grant explícito.

**Dependencies:** Tarea 4

**Files likely touched:**
- `supabase/migrations/<timestamp>_bot_read_functions.sql`
- `supabase/tests/database/bot_read_functions.sql`

**Estimated scope:** M (2 archivos, lógica SQL no trivial)

---

## Tarea 6: Funciones Postgres `SECURITY DEFINER` — escrituras transaccionales

**Descripción:** Implementar `bot_create_order`, `bot_update_order`, `bot_cancel_order` (§5),
con las validaciones exactas de §3.1-§3.4. Cada función es una sola transacción (atómica).

**Acceptance criteria:**
- [x] Las 3 funciones existen y usan los códigos de error exactos de §5/§7
- [x] `bot_create_order` nunca setea `created_by_admin_id`
- [x] `bot_cancel_order` nunca ejecuta `DELETE`, solo `update status='cancelled'`
- [x] Ninguna función permite tocar un `sale_order` con `created_by_admin_id` no nulo (ownership estricto — probado explícitamente contra un pedido creado por un admin real de staging)

**Verification:**
- [x] pgTAP (`bot_write_functions.sql`, 20 asserts): los 8 códigos de error (`NO_ACTIVE_PLAN`, `PAST_CUTOFF` x2, `ORDER_ALREADY_EXISTS`, `ORDER_NOT_FOUND` x3, `ORDER_NOT_EDITABLE`, `PLAN_NOT_EDITABLE`, `PLAN_NOT_CANCELLABLE`, `ORDER_NOT_CANCELLABLE`) + caminos felices de crear/editar/cancelar — `npm run test:db` en verde, 48/48 asserts totales
- [x] pgTAP confirma que `bot_cancel_order` nunca ejecuta `DELETE` (la fila sigue existiendo, `count=1`, tras cancelar) y que cancelar funciona incluso después del cutoff (§3.4, a diferencia de editar)
- [x] Smoke-test manual previo del camino feliz (crear + intento de duplicado) contra datos reales de staging
- [x] Confirmado que ningún test dejó datos filtrados (sin `sale_order` del cliente de prueba, plan de la Tarea 1 intacto)

**Notas de implementación:**
- Helper interno `bot_is_within_cutoff(cutoff_at)` (no expuesto a `anon` — solo lo llaman
  las funciones `bot_create_order`/`bot_update_order`, que ya corren como el dueño) para no
  duplicar la lógica de §3.2 entre las dos.
- Las pruebas de error usan `throws_like()` de pgTAP (captura la excepción en su propia
  sub-transacción, sin abortar el resto del test) y `SAVEPOINT`/`ROLLBACK TO` alrededor de
  cada escenario que rompe estado a propósito (status inválido, plan fuera de `planned`),
  para no afectar los asserts siguientes dentro del mismo archivo.
- El fallback de horario sin `cutoff_at` (§3.2) se probó recalculando la misma fórmula en
  el test en vez de un valor fijo, para no depender de qué día de la semana corra la suite.

**Dependencies:** Tarea 5

**Files likely touched:**
- `supabase/migrations/<timestamp>_bot_write_functions.sql`
- `supabase/tests/database/bot_write_functions.sql`

**Estimated scope:** M (2 archivos, es la lógica más crítica del sistema)

---

## Checkpoint: Fase 1 — Base de datos completa

- [ ] `supabase test db` cubre las 9 funciones en verde
- [ ] `npm run build` pasa
- [ ] Revisión antes de pasar a la capa TypeScript

---

## Tarea 7: Servicio de catálogo (`lib/bot/services/products.ts`)

**Descripción:** Funciones TypeScript `getFrequentProducts(customerId)` y
`searchCatalog(query)` que llaman a `bot_get_frequent_products`/`bot_search_catalog` vía el
cliente Supabase de servidor (`lib/supabase/server.ts`), tipadas con `Database` de
`database.types.ts`.

**Acceptance criteria:**
- [x] Ambas funciones devuelven tipos TS explícitos (no `any`)
- [x] Manejan el caso de 0 resultados sin lanzar

**Verification:**
- [x] Vitest (4 tests, `lib/bot/services/products.test.ts`) contra staging real (anon key, mismo camino que usará el bot en producción) — `npm run test` en verde
- [x] `npm run build` y `npm run lint` pasan (los 59 problemas preexistentes no relacionados siguen igual, ninguno nuevo)

**Decisión de diseño:** se usa el patrón ya establecido en el repo (`listDistributionPlans.tsx`
y similares) de recibir el `SupabaseClient` ya creado como primer parámetro, en vez de
llamar a `createClient()` de `lib/supabase/server.ts` internamente — ese `createClient`
depende de `cookies()` de `next/headers`, que solo existe dentro de un server
component/route handler, no en un test de Vitest. Esto además hace el servicio
channel-agnostic de verdad: el webhook de Telegram (Tarea 12+) crea el cliente una vez y
lo pasa a cada función de servicio.

`database.types.ts` no tenía las funciones/tablas nuevas del bot (se genera desde Neptuno,
que no las tiene hasta la Tarea 22) — intenté regenerarlo apuntando a staging
(`supabase gen types --db-url`), pero también necesita Docker (no disponible aquí). Se
extendió el archivo a mano, siguiendo exactamente el formato que genera el CLI (mismo
orden alfabético de columnas/funciones que ya tiene el resto del archivo): las 5 tablas,
la columna nueva de `product`, y las 9 funciones `bot_*`. Cuando la Tarea 22 corra el
`update-supabase-types` real contra Neptuno (ya migrada), el regenerado automático
coincidirá con esto.

También: `vitest.setup.ts` nuevo (cargado vía `vitest.config.mts` → `test.setupFiles`) usa
`process.loadEnvFile(".env.local")` (Node 24) porque Vitest no carga `.env.local`
automáticamente como sí hace Next.js — sin esto, cualquier test que necesite credenciales
reales vería `process.env` vacío. Y `lib/bot/test-helpers.ts` (`createTestSupabaseClient`)
crea un cliente Supabase plano apuntando a `NEXT_PUBLIC_SUPABASE_URL` (self-hosted de
staging) con la misma anon key que usará el bot — reutilizable en las próximas tareas de
la Fase 2.

**Dependencies:** Tarea 5

**Files likely touched:**
- `lib/bot/services/products.ts`
- `lib/bot/services/products.test.ts`
- `lib/bot/test-helpers.ts` (nuevo, reutilizable)
- `vitest.setup.ts`, `vitest.config.mts` (carga de `.env.local` en tests)
- `database.types.ts` (extendido a mano con el esquema del bot)

**Estimated scope:** S (2 archivos)

---

## Tarea 8: Servicio de pedidos (`lib/bot/services/orders.ts`)

**Descripción:** Funciones `getCurrentOrder`, `createOrder`, `updateOrder`, `cancelOrder`
que llaman a las RPCs de la Tarea 6, parseando el código estable antes de `:` en cada
`RAISE EXCEPTION` hacia un tipo de error TS (`BotServiceError`) en vez de dejar pasar el
mensaje SQL crudo.

**Acceptance criteria:**
- [x] Las 4 funciones existen con las firmas de §4
- [x] Cualquier error de Postgres se traduce a `BotServiceError` con uno de los 8 códigos conocidos, nunca se re-lanza el texto SQL crudo (confirmado también el fallback `UNKNOWN` para mensajes sin ninguno de los 8)

**Verification:**
- [x] Vitest unitario (`lib/bot/errors.test.ts`, 12 tests): los 8 códigos vía `it.each`, más `UNKNOWN`, más que el objeto es `instanceof Error` — sin DB, puro parseo de texto
- [x] Vitest de integración (`lib/bot/services/orders.test.ts`, 7 tests) contra staging real: camino feliz completo (crear→ver→modificar→cancelar) y 5 casos representativos de error de punta a punta (`NO_ACTIVE_PLAN`, `ORDER_ALREADY_EXISTS`, `ORDER_NOT_FOUND` x2, `ORDER_NOT_CANCELLABLE`) — confirma que el error real de Postgres efectivamente llega envuelto como `BotServiceError` con el `.code` correcto, no solo el parseo en aislado
- [x] `npm run build` y `npm run lint` pasan — 23/23 tests en verde, 59 problemas de lint preexistentes sin cambios

**Decisión de alcance:** no se repitió la matriz exhaustiva de las 8 reglas de negocio
aquí — eso ya lo cubre `bot_write_functions.sql` (pgTAP, Tarea 6) a nivel SQL. Esta tarea
prueba la pieza nueva: que el *mapeo* Postgres → `BotServiceError` funciona de punta a
punta, no que cada regla de negocio sea correcta (eso ya está probado).

**Incidente durante la tarea (y su fix):** las primeras corridas de
`orders.test.ts` fallaban porque el fixture de staging (`withSingleActivePlan`,
`lib/bot/test-fixtures.ts`) intentaba borrar el `distribution_plan` temporal antes de
borrar los `sale_order` que todavía lo referenciaban (`bot_cancel_order` nunca hace
`DELETE`, así que la fila cancelada seguía ahí) — fallaba por FK, y como la excepción
interrumpía el `finally` *antes* de reinsertar el plan original guardado, se perdió el
`distribution_plan` de prueba real de la Tarea 1. Se corrigió el orden (borrar
`sale_order` del plan temporal antes de restaurar) y se recreó el plan de prueba
(nuevo id, mismo `plan_date`) — ver nota actualizada en la Tarea 1. Nada de esto tocó las
124 filas de `distribution_plan` reales restauradas del backup, todas intactas.

**Dependencies:** Tarea 6

**Files likely touched:**
- `lib/bot/services/orders.ts`
- `lib/bot/services/orders.test.ts`
- `lib/bot/errors.ts`
- `lib/bot/errors.test.ts`
- `lib/bot/test-fixtures.ts` (nuevo, reutilizable — fixtures privilegiados vía `pg` para las Tareas 9+)

**Estimated scope:** M (3 archivos, mapeo de errores no trivial)

---

## Tarea 9: Servicio de whitelist (`lib/bot/services/auth.ts`)

**Descripción:** Función `resolveCustomer(externalId)` que llama a `bot_resolve_customer`,
y `validateApiKey(rawKey)` que hashea y llama a `bot_validate_api_key` (usada recién en la
Tarea 20, implementada aquí junto al resto de auth).

**Acceptance criteria:**
- [x] `resolveCustomer` devuelve `null` (no lanza) cuando no hay match
- [x] `validateApiKey` nunca compara el key en texto plano, solo su hash (sha256)

**Verification:**
- [x] Vitest (`lib/bot/services/auth.test.ts`, 7 tests): `resolveCustomer` con match/sin match contra el cliente real de la Tarea 1; `hashApiKey` nunca es identidad y es consistente; `validateApiKey` con key inexistente/activa/revocada — `npm run test` en verde, 30/30 tests totales
- [x] `npm run build` y `npm run lint` pasan (59 problemas preexistentes sin cambios)
- [x] Confirmado que `bot_api_key` queda vacío en staging después de la suite (cleanup por `afterEach`)

**Nota:** `hashApiKey` queda exportada desde `auth.ts` — la reutiliza tanto
`validateApiKey` como (Tarea 20) el script que genera una API key nueva, para que el
hash que se guarda en `bot_api_key.key_hash` sea siempre el mismo que se valida acá.
Igual que en la Tarea 8, los errores de Postgres se envuelven con `parsePostgresError`
en vez de dejarlos pasar crudos, por consistencia con el resto de la capa de servicio.

**Dependencies:** Tarea 5

**Files likely touched:**
- `lib/bot/services/auth.ts`
- `lib/bot/services/auth.test.ts`

**Estimated scope:** S (2 archivos)

---

## Checkpoint: Fase 2 — Capa de servicio TypeScript completa

- [ ] `npm run test` cubre las 7 funciones de servicio en verde
- [ ] `npm run build` y `npm run lint` pasan sin warnings nuevos
- [ ] Revisión antes de tocar nada de Telegram

---

## Tarea 10: Tipos de desacoplamiento de canal (`lib/bot/channel.ts`)

**Descripción:** Definir `InboundMessage`, `BotMessage`, `ChannelAdapter` exactamente como en
§6 del diseño. Solo el contrato, sin implementación.

**Acceptance criteria:**
- [x] Los 3 tipos existen con los campos exactos de §6
- [x] No hay ninguna referencia a Telegram en este archivo

**Verification:**
- [x] `npm run build` y `npm run lint` pasan

**Dependencies:** None (puede hacerse en paralelo con Fase 1/2)

**Files likely touched:**
- `lib/bot/channel.ts`

**Estimated scope:** XS (1 archivo, solo tipos)

---

## Tarea 11: Adaptador de Telegram (`lib/bot/adapters/telegram.ts`)

**Descripción:** Implementar `ChannelAdapter` para Telegram: `parseInbound`, `sendMessage`
(traduce `BotMessage.buttons` a teclado inline), y `notifyOps` (usado desde la Tarea 19).

**Acceptance criteria:**
- [x] `parseInbound` maneja mensajes de texto y `callback_query`
- [x] `sendMessage` genera el JSON correcto de `reply_markup.inline_keyboard` cuando hay botones
- [x] `notifyOps(message)` llama a `sendMessage` con el `TELEGRAM_OPS_CHAT_ID`

**Verification:**
- [x] Vitest (`lib/bot/adapters/telegram.test.ts`, 10 tests): `parseInbound` con fixtures reales (texto, callback_query, y 2 casos de update no soportado que deben lanzar); `sendMessage` con `fetch` mockeado (texto plano, botones → `inline_keyboard` un botón por fila, error de la API, token faltante); `notifyOps` (destino correcto, chat id faltante) — `npm run test` en verde, 40/40 tests totales
- [x] Manual, real (no mockeado): corrido vía `tsx` contra la Bot API real, mensaje con 2 botones enviado a `@Jepridevbot` → confirmado recibido en el chat de prueba
- [x] `npm run build` y `npm run lint` pasan (59 problemas preexistentes sin cambios)

**Dependencies:** Tarea 10, Tarea 1 (token)

**Files likely touched:**
- `lib/bot/adapters/telegram.ts`
- `lib/bot/adapters/telegram.test.ts`

**Estimated scope:** M (2 archivos, varias formas de update que traducir)

---

## Tarea 12: Webhook `/api/bot/telegram` — secreto, idempotencia, whitelist

**Descripción:** Ruta `app/api/bot/telegram/route.ts`: valida
`X-Telegram-Bot-Api-Secret-Token` contra `TELEGRAM_WEBHOOK_SECRET` (§9), chequeo de
idempotencia contra `bot_processed_update` (§9) antes de llamar cualquier servicio, resuelve
whitelist e ignora en silencio si no hay match. Todavía sin lógica de menú.

**Acceptance criteria:**
- [ ] Un request sin el header secreto correcto devuelve 401 sin tocar ninguna tabla
- [ ] Un `update_id` repetido responde 200 sin reprocesar
- [ ] Un `chat_id` no whitelisteado no genera ninguna respuesta visible

**Verification:**
- [ ] Vitest: llamar al handler de la ruta directamente (import del `route.ts`) con distintos payloads/headers simulados, cubriendo los 3 criterios de aceptación — `npm run test` en verde
- [ ] Manual, en staging (Tarea 3): registrar el webhook con `setWebhook` contra el dominio propio y enviar un mensaje real desde el chat_id de prueba
- [ ] Manual: reenviar el mismo payload de update dos veces y confirmar una sola fila nueva en `bot_processed_update`

**Dependencies:** Tarea 9, Tarea 11, Tarea 4 (tabla `bot_processed_update`), Tarea 3 (staging)

**Files likely touched:**
- `app/api/bot/telegram/route.ts`
- `app/api/bot/telegram/route.test.ts`

**Estimated scope:** M (2 archivos, pero con varias validaciones secuenciales críticas)

---

## Tarea 13: Flujo "ver pedido" de punta a punta (vertical slice mínimo)

**Descripción:** Mostrar el Menú Principal (§7) tras whitelist + verificación de ventana
activa, y conectar "📋 Ver / modificar mi pedido de hoy" solo para lectura
(`getCurrentOrder`) — primera prueba de que toda la plumbing funciona de punta a punta.

**Acceptance criteria:**
- [ ] El Menú Principal se muestra tal cual el guion de §7
- [ ] "Ver mi pedido" muestra el pedido actual si existe, o invita a crear uno si no

**Verification:**
- [ ] Vitest: lógica de menú en `lib/bot/domain.ts` probada con mocks de los servicios — `npm run test` en verde
- [ ] Manual, en staging: desde el chat de prueba, navegar el menú y confirmar ambos casos

**Dependencies:** Tarea 8, Tarea 12

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/domain.test.ts`
- `app/api/bot/telegram/route.ts`

**Estimated scope:** M (3 archivos)

---

## Checkpoint: Fase 3 — Canal Telegram verificado de punta a punta

- [ ] Mensaje real de un chat_id whitelisteado (en staging) recibe la respuesta correcta
- [ ] Mensaje de un chat_id no whitelisteado es ignorado sin respuesta
- [ ] Reenviar el mismo `update_id` no duplica nada
- [ ] Revisión antes de construir los flujos de escritura

---

## Tarea 14: Estado de conversación (`bot_conversation_state`) en el dominio del bot

**Descripción:** Lógica en `lib/bot/domain.ts` para leer/escribir `bot_conversation_state`
entre pasos (§8): transición de estados, expiración por inactividad (15 min), reinicio a
`idle` al terminar o abandonar un flujo.

**Acceptance criteria:**
- [ ] Cada transición de estado persiste con el `context` correcto
- [ ] Una conversación con `updated_at` de más de 15 minutos vuelve al Menú Principal
- [ ] No hay fugas de estado entre distintos `customer_id`

**Verification:**
- [ ] Vitest: transiciones de estado y expiración, con tiempo simulado (`vi.useFakeTimers`) — `npm run test` en verde

**Dependencies:** Tarea 13, Tarea 4 (tabla)

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/services/conversation.ts`
- `lib/bot/services/conversation.test.ts`

**Estimated scope:** M (3 archivos)

---

## Tarea 15: Flujo "crear pedido" de punta a punta

**Descripción:** Guion completo de §7 para "🛒 Crear nuevo pedido": frecuentes → búsqueda →
selección de unidad si aplica → cantidad → resumen → confirmación → `createOrder`.

**Acceptance criteria:**
- [ ] Los 8 productos frecuentes se muestran cuando existen; se salta a búsqueda si no hay
- [ ] La pregunta de unidad solo aparece cuando el grupo tiene más de una variante
- [ ] El pedido creado tiene exactamente los productos/cantidades confirmados
- [ ] Cada código de error se traduce al mensaje amigable correspondiente

**Verification:**
- [ ] Vitest: cada paso del flujo con mocks de servicios, incluyendo los branches de "sin frecuentes" y "una sola variante" — `npm run test` en verde
- [ ] Manual, en staging, crítico: crear un pedido real de punta a punta y confirmar en `app/protected/sale-orders` del panel admin (mismo `order_code`, `created_by_customer_id` seteado, `created_by_admin_id` nulo)

**Dependencies:** Tarea 7, Tarea 8, Tarea 14

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/domain.test.ts`

**Estimated scope:** L — considerar partir si al implementar resulta tocar más de 5 archivos

---

## Tarea 16: Flujo "modificar pedido" de punta a punta

**Descripción:** Extender "📋 Ver / modificar" para editar cantidades de un pedido
existente, reutilizando selección de producto/unidad/cantidad de la Tarea 15, llamando a
`updateOrder`.

**Acceptance criteria:**
- [ ] Editar actualiza exactamente los items confirmados
- [ ] `PLAN_NOT_EDITABLE` y `PAST_CUTOFF` se traducen a mensajes distintos y correctos
- [ ] Nunca permite editar un pedido con `created_by_admin_id` no nulo

**Verification:**
- [ ] Vitest: casos de edición exitosa y de los 2 códigos de error — `npm run test` en verde
- [ ] Manual, en staging: editar un pedido real y confirmar en el panel admin; forzar `PLAN_NOT_EDITABLE` moviendo el plan a `preparing` a mano

**Dependencies:** Tarea 8, Tarea 15

**Files likely touched:**
- `lib/bot/domain.ts`

**Estimated scope:** M (reutiliza lo de la Tarea 15)

---

## Tarea 17: Flujo "cancelar pedido" de punta a punta

**Descripción:** Implementar "❌ Cancelar pedido" de §7: confirmación explícita antes de
llamar `cancelOrder`.

**Acceptance criteria:**
- [ ] Requiere confirmación explícita antes de cancelar
- [ ] El pedido cancelado queda con `status='cancelled'`, nunca se borra la fila
- [ ] `PLAN_NOT_CANCELLABLE` se traduce correctamente

**Verification:**
- [ ] Vitest: flujo de confirmación y el código de error — `npm run test` en verde
- [ ] Manual, en staging: cancelar un pedido real y confirmar en el panel admin que la fila sigue existiendo con `status='cancelled'`, correctamente excluida de `InvoicingReviewTable`

**Dependencies:** Tarea 8, Tarea 13

**Files likely touched:**
- `lib/bot/domain.ts`

**Estimated scope:** S

---

## Checkpoint: Fase 4 — PoC funcionalmente completo

- [ ] Los 3 flujos funcionan de punta a punta contra el bot real en staging
- [ ] Verificado en el panel admin que ninguno rompe o altera el comportamiento existente
- [ ] Suite completa de Vitest + pgTAP en verde
- [ ] Revisión con el humano antes de pasar a dureza operativa

---

## Tarea 18: Auditoría — `bot_interaction_log` en cada acción de dominio

**Descripción:** Instrumentar cada servicio de escritura/búsqueda para insertar una fila en
`bot_interaction_log` (§10), sin bloquear la respuesta al cliente si el insert de auditoría
falla.

**Acceptance criteria:**
- [ ] Cada `create_order`/`update_order`/`cancel_order`/`search` deja exactamente una fila
- [ ] Un fallo al escribir la auditoría no impide responder al cliente

**Verification:**
- [ ] Vitest: confirmar la fila de auditoría tras cada acción, y que un mock de fallo en el insert no propaga — `npm run test` en verde

**Dependencies:** Tarea 8, Tarea 15, Tarea 16, Tarea 17

**Files likely touched:**
- `lib/bot/services/orders.ts`
- `lib/bot/services/products.ts`
- `lib/bot/services/audit.ts`
- `lib/bot/services/audit.test.ts`

**Estimated scope:** M (4 archivos)

---

## Tarea 19: Alertas de fallos — `notifyOps` en errores no controlados

**Descripción:** Manejo global de excepciones que distingue errores de negocio esperados
(los 8 códigos de §7) de errores no controlados, y solo estos últimos disparan `notifyOps`.

**Acceptance criteria:**
- [ ] Un error no controlado dispara un mensaje en el chat de ops
- [ ] Ninguno de los 8 códigos de error de negocio dispara esa alerta
- [ ] El cliente igual recibe una respuesta amigable aunque haya ocurrido un error no controlado

**Verification:**
- [ ] Vitest: mock de un error no controlado confirma la llamada a `notifyOps`; mock de cada código de negocio confirma que NO se llama — `npm run test` en verde
- [ ] Manual, en staging: forzar un error real y confirmar el mensaje en el chat de ops

**Dependencies:** Tarea 11, Tarea 12

**Files likely touched:**
- `app/api/bot/telegram/route.ts`
- `lib/bot/domain.ts`

**Estimated scope:** S

---

## Tarea 20: Sistema de API keys + rutas HTTP `/api/bot/orders`, `/api/bot/products/*`

**Descripción:** §4.1: generación de API key (script que la muestra una sola vez), middleware que valida `Authorization: Bearer <key>`, y las rutas HTTP equivalentes de §4 como wrappers sobre los servicios de las Tareas 7-8. No usadas por Telegram (que sigue en proceso).

**Acceptance criteria:**
- [ ] Sin `Authorization` o con key inválida/revocada → 401 sin ejecutar nada
- [ ] Con key válida ejecuta la acción y devuelve el mismo resultado que la función de servicio
- [ ] Revocar una key la invalida inmediatamente

**Verification:**
- [ ] Vitest: requests simulados con/sin key válida/revocada a cada ruta — `npm run test` en verde
- [ ] Manual: `curl` a cada ruta con y sin key válida, y con una key revocada

**Dependencies:** Tarea 9, Tarea 7, Tarea 8

**Files likely touched:**
- `scripts/generate_bot_api_key.ts`
- `app/api/bot/orders/route.ts`
- `app/api/bot/orders/[id]/route.ts`
- `app/api/bot/products/frequent/route.ts`
- `app/api/bot/products/search/route.ts`

**Estimated scope:** L — 5 archivos; si crece, separar "generación de key" de "rutas HTTP"

---

## Checkpoint: Fase 5 — Dureza operativa completa

- [ ] Auditoría, alertas y API keys verificados (automatizado + manual)
- [ ] Revisión antes de la mejora de catálogo (no bloqueante) y producción

---

## Tarea 21: Agrupación canónica de catálogo asistida por LLM (offline)

**Descripción:** Script puntual (§5.1) que lee `product.name`/`description`/`unit`, le pide
a un LLM que proponga agrupaciones, exporta la propuesta para revisión humana, y aplica el
resultado revisado poblando `product_canonical_group`/`product.canonical_group_id`.

**Acceptance criteria:**
- [ ] El script nunca se ejecuta como parte de una request del bot — es manual, offline
- [ ] La propuesta se puede revisar/editar antes de aplicarse
- [ ] Tras aplicar, buscar "tomate" en `bot_search_catalog` agrupa sus variantes bajo un solo `canonical_group_id`

**Verification:**
- [ ] `npm run build` pasa (si el script usa TS del repo)
- [ ] Manual: correr contra el catálogo real (o copia), revisar, aplicar, confirmar el agrupamiento
- [ ] Manual: confirmar que el panel admin de productos sigue sin cambios

**Dependencies:** Tarea 4; no depende de las Fases 2-5

**Files likely touched:**
- `scripts/generate_product_canonical_groups.ts`

**Estimated scope:** M (1 archivo, revisión humana en el medio)

---

## Tarea 22: Promoción a producción en Vercel

**Descripción:** Aplicar las migraciones de las Tareas 4-6 contra Neptuno (producción) por
primera vez — hasta aquí solo existían en el self-hosted de staging. Configurar
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OPS_CHAT_ID` en Vercel
(`scripts/use-jepri-cli.sh`), desplegar, y registrar el webhook de producción con
`setWebhook` apuntando a la URL de Vercel — reemplazando el webhook de staging.

**Acceptance criteria:**
- [ ] Las migraciones del bot aplicadas en Neptuno, con el mismo resultado que en staging
- [ ] Las 3 variables configuradas en Vercel
- [ ] `getWebhookInfo` confirma la URL de producción y `pending_update_count: 0`
- [ ] El webhook de staging queda desregistrado o explícitamente documentado como entorno secundario
- [ ] Ningún `customer`/`distribution_plan` de prueba de staging existe en Neptuno (datos reales únicamente)

**Verification:**
- [ ] Manual: `curl https://api.telegram.org/bot<token>/getWebhookInfo` muestra la URL de Vercel

**Dependencies:** Todas las de las Fases 1-5 verificadas en staging

**Files likely touched:** Ninguno en el repo (configuración en Vercel/Telegram)

**Estimated scope:** XS

---

## Tarea 23: Prueba de aceptación manual de punta a punta contra `todo/ChatBot.md`

**Descripción:** Recorrer la spec original punto por punto contra producción, con el o los
clientes de prueba reales.

**Acceptance criteria:**
- [ ] Cada punto de la sección 2-4 de `todo/ChatBot.md` tiene una verificación explícita documentada
- [ ] Ningún hallazgo bloqueante queda sin registrar

**Verification:**
- [ ] Manual, exhaustivo: ejecutar cada escenario contra producción y registrar el resultado

**Dependencies:** Todas las anteriores

**Files likely touched:** Ninguno

**Estimated scope:** M (sin código, cobertura amplia)

---

## Checkpoint: Completo

- [ ] Todos los criterios de aceptación de las 23 tareas cumplidos
- [ ] `npm run test` + `supabase test db` en verde
- [ ] `documentacion/chatbot_diseno.md` actualizado si algo cambió durante la implementación
- [ ] Listo para que el humano decida si el PoC pasa a clientes reales
