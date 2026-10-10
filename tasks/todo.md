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
la Tarea 23.

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
que no las tiene hasta la Tarea 23) — intenté regenerarlo apuntando a staging
(`supabase gen types --db-url`), pero también necesita Docker (no disponible aquí). Se
extendió el archivo a mano, siguiendo exactamente el formato que genera el CLI (mismo
orden alfabético de columnas/funciones que ya tiene el resto del archivo): las 5 tablas,
la columna nueva de `product`, y las 9 funciones `bot_*`. Cuando la Tarea 23 corra el
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
Tarea 21, implementada aquí junto al resto de auth).

**Acceptance criteria:**
- [x] `resolveCustomer` devuelve `null` (no lanza) cuando no hay match
- [x] `validateApiKey` nunca compara el key en texto plano, solo su hash (sha256)

**Verification:**
- [x] Vitest (`lib/bot/services/auth.test.ts`, 7 tests): `resolveCustomer` con match/sin match contra el cliente real de la Tarea 1; `hashApiKey` nunca es identidad y es consistente; `validateApiKey` con key inexistente/activa/revocada — `npm run test` en verde, 30/30 tests totales
- [x] `npm run build` y `npm run lint` pasan (59 problemas preexistentes sin cambios)
- [x] Confirmado que `bot_api_key` queda vacío en staging después de la suite (cleanup por `afterEach`)

**Nota:** `hashApiKey` queda exportada desde `auth.ts` — la reutiliza tanto
`validateApiKey` como (Tarea 21) el script que genera una API key nueva, para que el
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
(traduce `BotMessage.buttons` a teclado inline), y `notifyOps` (usado desde la Tarea 20).

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
- [x] Un request sin el header secreto correcto devuelve 401 sin tocar ninguna tabla
- [x] Un `update_id` repetido responde 200 sin reprocesar
- [x] Un `chat_id` no whitelisteado no genera ninguna respuesta visible

**Verification:**
- [x] Vitest (`app/api/bot/telegram/route.test.ts`, 5 tests) llamando al handler real contra staging, con el fetch de Telegram mockeado selectivamente — `npm run test` en verde, 48/48 totales
- [x] Manual en staging, real de punta a punta: webhook registrado con `setWebhook` contra `https://staging-tunnel.jepri.co/api/bot/telegram`, mensaje real enviado desde el chat de prueba, respuesta recibida, fila nueva confirmada en `bot_processed_update`
- [x] Manual: mismo `update_id` reenviado directo al webhook desplegado → `200`, sin fila nueva (2 antes, 2 después)
- [x] Manual: `chat_id` no whitelisteado contra el webhook desplegado → `200`, sin romper

**Hallazgo faltante corregido:** `bot_processed_update` tiene RLS sin policies como toda
tabla del bot — la clave anon no podía insertar ahí directo. Se agregó la función
`bot_mark_update_processed` (`SECURITY DEFINER`), que no estaba en la lista original de
la Tarea 5/6 (migración + pgTAP nuevos, 51/51 asserts totales).

**Bug real encontrado y corregido en staging:** el middleware de auth (`proxy.ts` /
`lib/supabase/proxy.ts`) redirigía con 307 cualquier request sin sesión de Supabase que
no fuera `/`, `/login` o `/auth/*` — Telegram nunca tiene sesión, así que el webhook
quedaba bloqueado *antes* de llegar al handler. Se excluyó todo el prefijo `/api/bot/*`
(no solo `/telegram`, ya que los endpoints de las Tareas 19/21 también usan su propio
mecanismo de auth, nunca sesión de Supabase) — cero impacto en el resto de `/api/*`.

**Infraestructura de staging ajustada:** `jepri-staging.lab.ryumanakano.com` (Tarea 3)
solo resuelve en DNS interno — confirmado con `nslookup` contra `8.8.8.8` (NXDOMAIN).
Telegram no puede resolverlo, así que no sirve para el webhook. Se expuso un segundo
hostname público, `staging-tunnel.jepri.co`, vía Cloudflare Tunnel (túnel administrado
desde el dashboard de Cloudflare, con una ruta scoped exclusivamente a
`^/api/bot/telegram$`) — expone solo el webhook a internet, no el resto de la app ni el
panel admin. El dominio interno (`jepri-staging.lab...`) sigue siendo el que se usa para
probar manualmente el resto de la app.

**Decisión de testabilidad:** probar el route handler real desde Vitest reveló que
`cookies()` de `next/headers` (usada por `lib/supabase/server.ts`) lanza "called outside
a request scope" fuera de un render/handler real de Next.js. Se mockeó `next/headers`
globalmente en `vitest.setup.ts` (cookies() devuelve un jar vacío) — `createClient()`
sigue construyendo un cliente real contra staging real, solo sin sesión, que es
exactamente lo que es un webhook. Y el mock de `fetch` en los tests tuvo que volverse
selectivo (solo intercepta `api.telegram.org`, todo lo demás —incluidas las llamadas
REST de supabase-js— sigue al fetch real), porque supabase-js usa el mismo `fetch`
global que el adaptador de Telegram.

**Dependencies:** Tarea 9, Tarea 11, Tarea 4 (tabla `bot_processed_update`), Tarea 3 (staging)

**Files likely touched:**
- `app/api/bot/telegram/route.ts`
- `app/api/bot/telegram/route.test.ts`
- `lib/bot/services/idempotency.ts` (nuevo, `markUpdateProcessed`)
- `lib/supabase/proxy.ts` (fix del middleware)
- `supabase/migrations/20261008030000_bot_idempotency_function.sql` (nuevo, faltaba de la Tarea 5/6)

**Estimated scope:** M (2 archivos, pero con varias validaciones secuenciales críticas) — terminó siendo L por los 3 hallazgos (función faltante, bug de middleware, DNS interno no resuelve) encontrados durante la verificación en staging

---

## Tarea 13: Flujo "ver pedido" de punta a punta (vertical slice mínimo)

**Descripción:** Mostrar el Menú Principal (§7) tras whitelist + verificación de ventana
activa, y conectar "📋 Ver / modificar mi pedido de hoy" solo para lectura
(`getCurrentOrder`) — primera prueba de que toda la plumbing funciona de punta a punta.

**Acceptance criteria:**
- [x] El Menú Principal se muestra tal cual el guion de §7
- [x] "Ver mi pedido" muestra el pedido actual si existe, o invita a crear uno si no

**Verification:**
- [x] Vitest (`lib/bot/domain.test.ts`, 9 tests) con `getActivePlanStatus`/`getCurrentOrder` mockeados — cubre sin ventana, fuera de cutoff, menú con/sin nombre, ver con/sin pedido, singular/plural, placeholders de crear/cancelar — `npm run test` en verde, 60/60 totales
- [x] Manual, real en staging: mensaje real → Menú Principal con los 3 botones confirmado; "Ver pedido" sin pedido activo → invita a crear uno (confirmado); pedido de prueba insertado directo en staging → "Ver pedido" → "tu pedido 1392 está pendiente" (confirmado), luego limpiado

**Hallazgo faltante corregido:** la verificación inicial de §7 necesita saber si *ahora
mismo* se está dentro del horario de corte, pero `bot_is_within_cutoff` (Tarea 6) no
tiene `GRANT` a `anon` a propósito (solo lo llaman otras funciones `bot_*` del mismo
dueño). Se agregó `bot_get_active_plan_status` (migración + pgTAP, 54/54 asserts
totales) que combina `bot_get_active_plan` + `bot_is_within_cutoff` en un solo booleano
ya calculado — el dominio en TypeScript nunca reimplementa esa fórmula.

**Bug de concurrencia real encontrado y corregido:** Vitest corre los archivos de test
en paralelo por default, y varias suites comparten la misma fila "activa" de
`distribution_plan` en staging vía `lib/bot/test-fixtures.ts` — un archivo le pisaba el
fixture a otro, causando fallos intermitentes (`NO_ACTIVE_PLAN` o un `plan_id`
inesperado). No es una carrera de CPU que valga la pena optimizar: es estado externo
compartido y mutable. Se seteó `fileParallelism: false` en `vitest.config.mts` —
confirmado estable en 4 corridas seguidas tras el fix.

**Nota operativa:** se le puso `cutoff_at = now() + 48h` al plan de prueba de la Tarea 1
en staging (antes tenía `cutoff_at = null`, y hoy no es lunes/miércoles/viernes, así que
el fallback de horario bloqueaba todo) — queda así a propósito para las pruebas
manuales de las Tareas 14-17, que también van a necesitar la ventana abierta.

**Dependencies:** Tarea 8, Tarea 12

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/domain.test.ts`
- `app/api/bot/telegram/route.ts`
- `lib/bot/services/plan.ts`, `lib/bot/services/plan.test.ts` (nuevo)
- `supabase/migrations/20261008040000_bot_active_plan_status_function.sql` (nuevo, faltaba de la Tarea 6)
- `vitest.config.mts` (fix de concurrencia)

**Estimated scope:** M (3 archivos) — terminó siendo L por los 2 hallazgos (función faltante, race condition de tests)

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
- [x] Cada transición de estado persiste con el `context` correcto
- [x] Una conversación con `updated_at` de más de 15 minutos vuelve al Menú Principal
- [x] No hay fugas de estado entre distintos `customer_id`

**Verification:**
- [x] Vitest (`lib/bot/services/conversation.test.ts`, 7 tests) con tiempo simulado (`vi.useFakeTimers({ toFake: ["Date"] })`, solo `Date` — deja `setTimeout`/red reales para no colgar el round-trip a staging dentro del mismo test): transiciones, sobreescritura sin duplicar fila, canales independientes, expira a los 16 min, NO expira a los 14 min (control) — `npm run test` en verde, 70/70 totales
- [x] `lib/bot/domain.test.ts` (3 tests nuevos) confirma que `handleInboundMessage` reinicia a `idle` con el `customer_id`/`channel` correctos en cada turno, incluyendo dos clientes distintos en la misma corrida sin mezclarse (criterio de "no fugas")

**Hallazgo faltante corregido:** mismo patrón de siempre — `bot_conversation_state` tiene
RLS sin policies, así que hicieron falta `bot_get_conversation_state` y
`bot_set_conversation_state` (`SECURITY DEFINER`, migración + pgTAP nuevos, 60/60
asserts totales) antes de poder tocarla desde TypeScript.

**Decisión de diseño:** la expiración de 15 minutos se calcula en TypeScript
(`Date.now() - updatedAtMs`), no en la función SQL — así se puede probar con
`vi.useFakeTimers` sin tener que manipular `now()` dentro de Postgres. La función SQL
solo devuelve el estado crudo tal cual está guardado.

**Alcance real de la integración en `domain.ts`:** todavía no existe ningún flujo de
varios pasos (eso empieza en la Tarea 15), así que no hay nada que "continuar" leyendo
el estado — por ahora `handleInboundMessage` solo llama a `resetConversationState`
incondicionalmente al final de cada turno (extraído a un único punto de salida vía
`computeReply` + reset). Cuando la Tarea 15 agregue estados reales
(`awaiting_quantity`, etc.), esas ramas van a llamar a `setConversationState` en vez de
pasar por este reset — la lectura (`getConversationState`) ya está lista y probada para
que la usen directo.

**Bug de tipos atrapado solo por el build completo:** `Record<string, unknown>` no es
asignable al tipo `Json` generado — Vitest no chequea tipos (usa esbuild, transpile-only),
así que esto solo lo encontró `npm run build`. Se corrigió con un alias
`ConversationContext = Record<string, Json>`. Recordatorio para las próximas tareas:
`npm run test` en verde no garantiza que `npm run build` también lo esté.

**Dependencies:** Tarea 13, Tarea 4 (tabla)

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/domain.test.ts`
- `lib/bot/services/conversation.ts`
- `lib/bot/services/conversation.test.ts`
- `supabase/migrations/20261008050000_bot_conversation_state_functions.sql` (nuevo, faltaba de la Tarea 6)

**Estimated scope:** M (3 archivos)

---

## Tarea 15: Flujo "crear pedido" de punta a punta

**Descripción:** Guion completo de §7 para "🛒 Crear nuevo pedido": frecuentes → búsqueda →
selección de unidad si aplica → cantidad → resumen → confirmación → `createOrder`.

**Acceptance criteria:**
- [x] Los 8 productos frecuentes se muestran cuando existen; se salta a búsqueda si no hay
- [x] La pregunta de unidad solo aparece cuando el grupo tiene más de una variante
- [x] El pedido creado tiene exactamente los productos/cantidades confirmados
- [x] Cada código de error se traduce al mensaje amigable correspondiente

**Verification:**
- [x] Vitest: cada paso del flujo con mocks de servicios, incluyendo los branches de "sin frecuentes" y "una sola variante" — `npm run test` en verde
- [x] Manual, en staging, crítico: crear un pedido real de punta a punta y confirmar en `app/protected/sale-orders` del panel admin (mismo `order_code`, `created_by_customer_id` seteado, `created_by_admin_id` nulo)

**Cambio de alcance pedido en vivo (feedback del usuario, no un bug):** el diseño inicial
creaba un pedido por producto (1 producto → confirmar → si querías otro, usabas
"modificar" después). Probando en vivo contra @Jepridevbot, el usuario pidió "Cebolla
cabezona" y el bot cerró el pedido sin dejarlo agregar más productos (pedido real
`1423`). El usuario fue explícito: *"prefiero que lo hagamos desde este momento, no que
el usuario tenga que modificarlo después para agregar mas pedidos"* — se rediseñó el
flujo para acumular varios items (`PendingItem[]` en el context de la conversación) con
un loop "➕ Agregar otro producto" / "✅ Confirmar pedido" antes de llamar a `createOrder`
una sola vez con todos los items juntos.

**Segundo ajuste pedido en vivo:** el mensaje final de confirmación solo mostraba el
`order_code` y la fecha de entrega. El usuario pidió que incluyera también el resumen de
productos — se agregó `formatItemLines()` al mensaje de éxito.

**Bug real encontrado y corregido en la misma tarea:** `showProductChoices` repetía
"Todavía no tienes productos frecuentes" en *cada* vuelta del loop de "agregar otro
producto" para clientes sin historial — esa frase describe el historial del cliente, no
el pedido en curso. Se corrigió para que solo aparezca cuando el pedido todavía está
vacío (inicio de la charla).

**Dependencies:** Tarea 7, Tarea 8, Tarea 14

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/domain.test.ts`
- `lib/bot/flows/createOrder.ts` (nuevo — el flujo se extrajo de `domain.ts` por tamaño)
- `lib/bot/flows/createOrder.test.ts` (nuevo)

**Estimated scope:** L — se partió como se esperaba: la lógica del flujo vive en su
propio módulo (`lib/bot/flows/createOrder.ts`), `domain.ts` solo despacha hacia él

---

## Tarea 16: Identidad — un número puede representar varios clientes/puntos de entrega

**Descripción:** El diseño original (§2) asumía 1 número de WhatsApp/Telegram = 1
`customer`, reforzado por `customer.whatsapp_id UNIQUE`. Probando en vivo, el usuario
señaló dos casos no contemplados: un mismo número puede operar a nombre de varios
clientes distintos, o de varios puntos de entrega del mismo cliente. Como no existe
ningún concepto de "punto de entrega" en el modelo de datos, cada punto/cliente ya es en
la práctica una fila distinta de `customer` — el fix es a nivel de identidad del canal,
no una entidad nueva. Se decidió resolverlo antes de construir las Tareas 17-18
(modificar/cancelar pedido), que se iban a construir asumiendo un único cliente
resuelto.

**Acceptance criteria:**
- [x] `customer.whatsapp_id` ya no es `UNIQUE` — puede haber varias filas de `customer`
      con el mismo `whatsapp_id`
- [x] `resolveCustomerCandidates` devuelve todas las filas que calcen (antes tomaba
      `data?.[0]` y devolvía como máximo una)
- [x] Con un solo candidato (el caso de siempre), el comportamiento es idéntico al de
      antes — cero regresión
- [x] Con varios candidatos, tocar una acción del Menú Principal (crear/ver/cancelar)
      pregunta primero para cuál cliente es, mostrando `customer.name` como etiqueta
- [x] Un `customer_id` elegido desde el menú de desambiguación que no pertenece a los
      candidatos resueltos para ese número se ignora (nunca se le atribuye el turno a
      alguien fuera de la whitelist de ese número)
- [x] Si alguno de los candidatos está a mitad del flujo de crear pedido, el mensaje se
      despacha a ese sin volver a preguntar (abandonar/continuar el flujo tiene
      prioridad, igual que ya pasa hoy con un solo cliente)
- [x] Terminado o cancelado un pedido, la siguiente acción desde el Menú Principal
      vuelve a preguntar para cuál cliente es (sin persistencia nueva, por decisión
      explícita del usuario)

**Verification:**
- [x] Vitest (`lib/bot/domain.test.ts`, 6 tests nuevos para `handleInboundMessageForChannel`;
      `lib/bot/services/auth.test.ts`, 1 test nuevo contra staging real) — `npm run test`
      en verde, 108/108
- [x] pgTAP (`bot_read_functions.sql`) — nuevo assert: 2 `customer` con el mismo
      `whatsapp_id` → `bot_resolve_customer` devuelve las 2 filas
- [x] `npm run build` y `npm run lint` sin errores nuevos
- [x] Manual, en staging, contra @Jepridevbot: se creó temporalmente un segundo
      `customer` con el mismo `whatsapp_id` que el cliente de prueba — tocar una opción
      del Menú Principal mostró el menú de desambiguación con los dos nombres; cliente
      de prueba temporal borrado al confirmar

**Decisión de diseño (sin estado nuevo):** la desambiguación de "para cuál cliente es
esto" vive enteramente codificada en el `callbackData` del botón que el propio bot
genera (`bot:choose_customer:<action>:<customer_id>`) — no hace falta ninguna tabla ni
columna de "cliente activo". La detección de "¿alguien a mitad de flujo?" reutiliza
`CREATE_FLOW_STATE_VALUES`/`getConversationState`, que ya existían. El `customer_id` del
callback siempre se valida contra la lista de candidatos resueltos para ese número antes
de confiar en él (el payload del webhook es input no confiable).

**Decisión de producto (con el usuario):** la etiqueta para distinguir candidatos es
`customer.name` tal cual (sin columna nueva) — depende de que el admin le dé un nombre
reconocible a cada fila. Sin persistencia: se vuelve a preguntar cada vez que se arranca
una acción nueva desde idle, no solo una vez por conversación.

**Explícitamente fuera de esta tarea (se deja para el final del plan, Tarea 25
pendiente):** permitir varios pedidos el mismo día para el mismo punto de entrega —
hoy `bot_create_order` sigue rechazando con `ORDER_ALREADY_EXISTS` un segundo pedido
para el mismo `customer_id` + plan. Es un cambio aislado (quitar ese chequeo + cambiar
"ver pedido" de uno a una lista) que no se encarece por posponerlo.

**Dependencies:** Tarea 9 (whitelist), Tarea 15

**Files likely touched:**
- `supabase/migrations/20261009000000_bot_allow_shared_whatsapp_id.sql` (nuevo)
- `supabase/tests/database/bot_read_functions.sql`
- `lib/bot/services/auth.ts`, `lib/bot/services/auth.test.ts`
- `lib/bot/domain.ts`, `lib/bot/domain.test.ts`
- `app/api/bot/telegram/route.ts`

**Estimated scope:** M (5 archivos)

---

## Tarea 17: Flujo "modificar pedido" de punta a punta

**Descripción:** Extender "📋 Ver / modificar" para editar cantidades de un pedido
existente, reutilizando selección de producto/unidad/cantidad de la Tarea 15, llamando a
`updateOrder`.

**Acceptance criteria:**
- [x] Editar actualiza exactamente los items confirmados
- [x] `PLAN_NOT_EDITABLE` y `PAST_CUTOFF` se traducen a mensajes distintos y correctos
- [x] Nunca permite editar un pedido con `created_by_admin_id` no nulo

**Verification:**
- [x] Vitest: casos de edición exitosa, los 4 códigos de error, y "cambiar cantidad"/"quitar producto" — `npm run test` en verde, 121/121
- [x] pgTAP: `bot_get_current_order` ahora incluye `product_name`/`unit` por item — en verde
- [x] `npm run build` y `npm run lint` sin errores nuevos
- [ ] Manual, en staging: editar un pedido real y confirmar en el panel admin; forzar `PLAN_NOT_EDITABLE` moviendo el plan a `preparing` a mano

**Decisión de diseño — reutilizar el loop de crear en vez de un flujo nuevo:** en vez de
construir un flujo de edición aparte, "📋 Ver / modificar" (cuando hay un pedido) salta
directo a `REVIEWING_ORDER` con los items existentes precargados (`startEditOrderFlow`),
usando el mismo loop "agregar otro producto / confirmar / cancelar" de la Tarea 15. La
presencia de `order_id`/`order_code` en el context (en vez de su ausencia) es lo único
que distingue "editar" de "crear" en cada paso — así que "editar cantidades" se logra
re-eligiendo el mismo producto con una cantidad nueva.

**Bug latente corregido de paso (afecta también a crear, no solo a editar):**
`handleAwaitingQuantity` siempre agregaba el nuevo item al final de la lista, aunque ya
hubiera uno con el mismo `product_id` — re-elegir "Tomate" dos veces habría dejado dos
líneas de tomate en vez de actualizar la cantidad. Se agregó `upsertItem` (reemplaza por
`product_id` en vez de siempre `push`), necesario para que "editar cantidad" tenga
sentido con este mismo loop.

**Ajuste pedido en vivo tras la primera versión:** probando en staging, el usuario
señaló que la pantalla de revisión solo dejaba *agregar* productos — no había manera de
quitar uno ni de cambiar una cantidad sin saber de antemano que re-elegir el mismo
producto la reemplazaba (no era descubrible). Se agregaron dos botones a la revisión,
"✏️ Cambiar cantidad" y "🗑️ Quitar producto" (el segundo solo si hay más de un item —
quitar el único dejaría el pedido vacío), cada uno abre una pantalla intermedia con un
botón por item ya elegido más "⬅️ Volver". Elegir uno para "cambiar cantidad" entra a
`AWAITING_QUANTITY` con el product_id de ese item precargado (reusa `upsertItem` para
reemplazar, mencionando la cantidad actual en la pregunta); para "quitar" simplemente
filtra ese item de la lista y vuelve a la revisión. Aplica igual en crear y en editar.

**Hallazgo faltante corregido (mismo patrón de siempre):** `bot_get_current_order`
devolvía cada item como `{product_id, required_quantity}` nada más — sin
`product_name`/`unit` no se puede reconstruir un `PendingItem` para precargar el flujo de
editar. Se extendió con un join a `product` (migración nueva,
`20261010000000_bot_current_order_items_with_product_info.sql`, `CREATE OR REPLACE`
aditivo sobre la función de la Tarea 5).

**Dependencies:** Tarea 8, Tarea 15

**Files likely touched:**
- `lib/bot/domain.ts`
- `lib/bot/flows/createOrder.ts`, `lib/bot/flows/createOrder.test.ts`
- `lib/bot/services/orders.ts`, `lib/bot/services/orders.test.ts`
- `supabase/migrations/20261010000000_bot_current_order_items_with_product_info.sql` (nuevo)
- `supabase/tests/database/bot_read_functions.sql`

**Estimated scope:** M (reutiliza lo de la Tarea 15)

---

## Tarea 18: Flujo "cancelar pedido" de punta a punta

**Descripción:** Implementar "❌ Cancelar pedido" de §7: confirmación explícita antes de
llamar `cancelOrder`.

**Acceptance criteria:**
- [x] Requiere confirmación explícita antes de cancelar
- [x] El pedido cancelado queda con `status='cancelled'`, nunca se borra la fila
- [x] `PLAN_NOT_CANCELLABLE` se traduce correctamente

**Verification:**
- [x] Vitest: flujo de confirmación (sí/no/repreguntar) y los 3 códigos de error — `npm run test` en verde, 128/128
- [x] pgTAP (ya cubierto desde la Tarea 6, sin cambios de esquema en esta tarea) — en verde
- [x] `npm run build` y `npm run lint` sin errores nuevos
- [x] Manual, en staging: pedido `1505` cancelado desde el bot, confirmado en staging con `status='cancelled'` y la fila intacta (ownership estricto desde Tarea 6 — nunca se borra)

**Ajustes pedidos en vivo tras probar las Tareas 15-18 juntas (no bugs, feedback de UX):**
- Los mensajes finales de crear/editar/cancelar (éxito, abortar, error) no dejaban claro
  que la charla había terminado — se agregó `CONVERSATION_ENDED_NOTE`, una frase de
  cierre al final de cada uno de esos mensajes.
- Pedir la cantidad escribiendo el número a mano era más fricción de la necesaria para
  el caso común — se agregaron botones de 1 a 5 (`QUICK_QUANTITY_PREFIX`) en las 3
  pantallas que preguntan cantidad, sin quitar la opción de escribir el número para
  cualquier otro valor.
- Esos 5 botones salían uno por fila (`BotMessage.buttons` siempre rendía así) — se
  agregó `BotMessage.buttonRows` (tamaños de fila opcionales) para que el adaptador de
  Telegram pueda agruparlos en una sola fila; sin especificar, sigue un botón por fila
  como antes. Es el único caso que lo usa por ahora.

**Decisión de diseño:** a diferencia de crear/editar, cancelar es un solo paso
("¿seguro?" → sí/no), así que no justificaba un archivo propio como
`lib/bot/flows/createOrder.ts` — vive directo en `domain.ts` con su propio estado
(`cancel:confirming`) y guarda `order_id`/`order_code` en el context mientras espera la
respuesta. Se agregó `MID_FLOW_STATE_VALUES` (antes solo `CREATE_FLOW_STATE_VALUES`) para
que la desambiguación de identidad de la Tarea 16 también reconozca "a mitad de
confirmar una cancelación" como con prioridad, igual que un flujo de crear/editar en
curso.

**Dependencies:** Tarea 8, Tarea 13

**Files likely touched:**
- `lib/bot/domain.ts`, `lib/bot/domain.test.ts`

**Estimated scope:** S

---

## Checkpoint: Fase 4 — PoC funcionalmente completo

- [x] Los 3 flujos funcionan de punta a punta contra el bot real en staging
- [x] Verificado en el panel admin que ninguno rompe o altera el comportamiento existente
- [x] Suite completa de Vitest + pgTAP en verde
- [x] Revisión con el humano antes de pasar a dureza operativa — confirmado: los 3
      flujos funcionan, los pedidos se ven bien en el panel admin, la identidad
      multi-cliente (Tarea 16) es un caso real de negocio (clientes compartiendo número,
      y vendedores a destajo atendiendo muchas empresas), y la Tarea 25 (varios pedidos
      por día) es vital — ver nota ampliada en la Tarea 25 más abajo

---

## Tarea 19: Auditoría — `bot_interaction_log` en cada acción de dominio

**Descripción:** Instrumentar cada servicio de escritura/búsqueda para insertar una fila en
`bot_interaction_log` (§10), sin bloquear la respuesta al cliente si el insert de auditoría
falla.

**Acceptance criteria:**
- [x] Cada `create_order`/`update_order`/`cancel_order`/`search` deja exactamente una fila
- [x] Un fallo al escribir la auditoría no impide responder al cliente

**Verification:**
- [x] Vitest: confirmar la fila de auditoría tras cada acción (éxito y error), y que un
      mock de fallo en el insert no propaga — `npm run test` en verde, 136/136
- [x] pgTAP (`bot_interaction_log_function.sql`, nuevo) — en verde
- [x] `npx tsc --noEmit`, `npm run build` y `npm run lint` sin errores nuevos
- [x] Manual, en staging: pedido `1514` creado desde el bot (2 búsquedas + el create_order
      final) — las 3 quedaron en `bot_interaction_log` con `channel`/`payload`/`result`
      correctos

**Decisión de diseño — dónde vive el `logInteraction`:** en vez de instrumentar
`lib/bot/services/orders.ts`/`products.ts` directamente (como sugería el plan original),
la llamada a `logInteraction` vive en la capa de orquestación
(`lib/bot/flows/createOrder.ts` y `lib/bot/domain.ts`), justo después de cada
`createOrder`/`updateOrder`/`cancelOrder`/`searchCatalog`. Razón: esos servicios no
conocen el `channel` (viene del `inbound` que ya tiene domain.ts/createOrder.ts) y
mezclar logging con el mapeo de errores de negocio de cada servicio los habría
complicado sin necesidad. `logInteraction` en sí nunca lanza — cualquier fallo al
escribir la auditoría queda solo en `console.error`, nunca interrumpe la respuesta.

**Hallazgo faltante corregido (mismo patrón de siempre):** `bot_interaction_log` tenía
RLS sin policies desde la Tarea 4 — hizo falta `bot_log_interaction` (`SECURITY DEFINER`,
migración + pgTAP nuevos) antes de poder insertarle filas desde el bot.

**Dependencies:** Tarea 8, Tarea 15, Tarea 17, Tarea 18

**Files likely touched:**
- `lib/bot/services/audit.ts`, `lib/bot/services/audit.test.ts` (nuevos)
- `lib/bot/flows/createOrder.ts`, `lib/bot/flows/createOrder.test.ts`
- `lib/bot/domain.ts`, `lib/bot/domain.test.ts`
- `supabase/migrations/20261011000000_bot_interaction_log_function.sql` (nuevo)
- `supabase/tests/database/bot_interaction_log_function.sql` (nuevo)
- `database.types.ts`

**Estimated scope:** M (6 archivos)

---

## Tarea 20: Alertas de fallos — `notifyOps` en errores no controlados

**Descripción:** Manejo global de excepciones que distingue errores de negocio esperados
(los 8 códigos de §7) de errores no controlados, y solo estos últimos disparan `notifyOps`.

**Acceptance criteria:**
- [x] Un error no controlado dispara un mensaje en el chat de ops
- [x] Ninguno de los 8 códigos de error de negocio dispara esa alerta
- [x] El cliente igual recibe una respuesta amigable aunque haya ocurrido un error no controlado

**Verification:**
- [x] Vitest: mock de un error no controlado confirma la llamada a `notifyOps`; mock de
      cada uno de los 8 códigos de negocio confirma que NO se llama — `npm run test` en
      verde, 140/140
- [x] `npx tsc --noEmit`, `npm run build` y `npm run lint` sin errores nuevos
- [x] Manual, en staging: se creó el grupo "Jepri Bot - Ops" con @Jepridevbot como
      miembro, se configuró `TELEGRAM_OPS_CHAT_ID` en el `.env` del servidor, y se forzó
      un error real revocando temporalmente `EXECUTE` sobre `bot_get_active_plan_status`
      para `anon`/`authenticated`/`public` (restaurado al terminar) — la alerta llegó al
      grupo de ops y el cliente recibió el mensaje genérico, ambos confirmados en vivo

**Decisión de diseño — dos capas de red de seguridad:**
1. **Capa interna** (`createOrder.ts`/`domain.ts`): los catches que ya existían alrededor
   de `createOrder`/`updateOrder`/`cancelOrder` (Tareas 15/17/18) ahora también llaman
   `notifyOps` cuando `isUnexpectedError(error)` (nuevo helper en `lib/bot/errors.ts`:
   true si no es un `BotServiceError`, o si lo es pero con `code === "UNKNOWN"`) — el
   cliente sigue recibiendo el mismo mensaje amigable de siempre, solo se agrega la
   alerta cuando corresponde.
2. **Capa externa** (`app/api/bot/telegram/route.ts`): un `try/catch` nuevo alrededor de
   todo el cuerpo del webhook (después del chequeo de secreto) atrapa cualquier cosa que
   se escape de la capa interna (ej. `getActivePlanStatus`/`getConversationState`/
   `resolveCustomerCandidates` fallando) — dispara `notifyOps` y le manda al cliente un
   mensaje genérico ("Ocurrió un error inesperado...") en vez de dejarlo sin ninguna
   respuesta. Siempre responde 200 (ya veníamos haciendo esto para no gatillar reintentos
   de Telegram).

**Decisión de diseño — `notifyOps` importado directo en domain.ts/createOrder.ts:** rompe
en principio el desacople de canal (§6), pero es la excepción explícita que ya documenta
§10: las alertas de ops **siempre** van a Telegram sin importar el canal del cliente (a
diferencia de las respuestas al cliente, que sí son 100% channel-agnostic vía
`BotMessage`). No se justificaba una abstracción nueva para un solo destino fijo.

**Dependencies:** Tarea 11, Tarea 12

**Files likely touched:**
- `app/api/bot/telegram/route.ts`, `app/api/bot/telegram/route.errors.test.ts` (nuevo —
  `route.test.ts` se mantiene 100% integración real a propósito, así que la red de
  seguridad externa se probó en un archivo separado que sí mockea servicios)
- `lib/bot/domain.ts`, `lib/bot/domain.test.ts`
- `lib/bot/flows/createOrder.ts`, `lib/bot/flows/createOrder.test.ts`
- `lib/bot/errors.ts` (nuevo: `isUnexpectedError`)
- `lib/bot/adapters/telegram.ts` (comentario desactualizado corregido)

**Estimated scope:** S

---

## Tarea 21: Sistema de API keys + rutas HTTP `/api/bot/orders`, `/api/bot/products/*`

**Descripción:** §4.1: generación de API key (script que la muestra una sola vez), middleware que valida `Authorization: Bearer <key>`, y las rutas HTTP equivalentes de §4 como wrappers sobre los servicios de las Tareas 7-8. No usadas por Telegram (que sigue en proceso).

**Acceptance criteria:**
- [x] Sin `Authorization` o con key inválida/revocada → 401 sin ejecutar nada
- [x] Con key válida ejecuta la acción y devuelve el mismo resultado que la función de servicio
- [x] Revocar una key la invalida inmediatamente

**Verification:**
- [x] Vitest: requests simulados con/sin key válida/revocada/sin parámetros requeridos,
      a cada una de las 5 rutas (incluido el mapeo de `BotServiceError` a 400 y de un
      error no controlado a 500) — `npm run test` en verde, 170/170
- [x] `npx tsc --noEmit`, `npm run build` (las 5 rutas aparecen en el listado de build) y
      `npm run lint` sin errores nuevos
- [x] pgTAP — sin cambios de esquema en esta tarea (`bot_api_key`/`bot_validate_api_key`
      ya existían desde la Tarea 9), en verde igual
- [x] Manual: `node scripts/generate_bot_api_key.mjs` generó una key real contra
      staging; `curl` a `/api/bot/products/search` sin `Authorization` (401), con una key
      inexistente (401), con la key válida (200, catálogo real de staging), y otra vez
      con la misma key ya revocada vía `update bot_api_key set revoked_at=now()` (401
      inmediato) — key de prueba borrada al terminar

**Decisión de diseño:** se agregó `lib/bot/httpApi.ts` (no estaba en el plan original)
para no repetir la validación de `Authorization: Bearer` y el mapeo de errores en cada
una de las 5 rutas — `isAuthorizedRequest`/`unauthorizedResponse`/`apiErrorResponse`,
reutilizando `validateApiKey` de la Tarea 9 tal cual. El script de generación quedó en
`.mjs` (Node puro, sin TypeScript) en vez de `.ts` — reutiliza `pg` (ya es dependencia)
y `node:crypto` directo, sin necesitar agregar `tsx`/`ts-node` solo para un script
puntual que se corre a mano.

**Dependencies:** Tarea 9, Tarea 7, Tarea 8

**Files likely touched:**
- `scripts/generate_bot_api_key.mjs` (nuevo, `.mjs` en vez de `.ts` — ver nota de diseño)
- `lib/bot/httpApi.ts` (nuevo)
- `app/api/bot/orders/route.ts`, `app/api/bot/orders/route.test.ts`
- `app/api/bot/orders/[id]/route.ts`, `app/api/bot/orders/[id]/route.test.ts`
- `app/api/bot/orders/current/route.ts`, `app/api/bot/orders/current/route.test.ts`
- `app/api/bot/products/frequent/route.ts`, `app/api/bot/products/frequent/route.test.ts`
- `app/api/bot/products/search/route.ts`, `app/api/bot/products/search/route.test.ts`
- `lib/bot/test-fixtures.ts` (nuevo: `withApiKey`/`withRevokedApiKey`)
- `package.json` (nuevo script `generate-bot-api-key`)

**Estimated scope:** L — 5 archivos; si crece, separar "generación de key" de "rutas HTTP"

---

## Checkpoint: Fase 5 — Dureza operativa completa

- [x] Auditoría, alertas y API keys verificados (automatizado + manual)
- [ ] Revisión antes de la mejora de catálogo (no bloqueante) y producción

---

## Tarea 22: Agrupación canónica de catálogo asistida por LLM (offline)

**Descripción:** Script puntual (§5.1) que lee `product.name`/`description`/`unit`, le pide
a un LLM que proponga agrupaciones, exporta la propuesta para revisión humana, y aplica el
resultado revisado poblando `product_canonical_group`/`product.canonical_group_id`.

**Acceptance criteria:**
- [x] El script nunca se ejecuta como parte de una request del bot — es manual, offline
- [x] La propuesta se puede revisar/editar antes de aplicarse (CSV en Excel)
- [ ] Tras aplicar, buscar "tomate" en `bot_search_catalog` agrupa sus variantes bajo un
      solo `canonical_group_id` — **pendiente de aplicar**, ver estado abajo

**⏸️ EN PAUSA (2026-10-10):** la propuesta está generada y entregada, pero el usuario
pidió dejarla pendiente de revisión del departamento de ventas antes de aplicarla —
`product.canonical_group_id` sigue en `null` para los 305 productos, confirmado. Los 3
scripts están listos, probados y comiteados; falta únicamente el paso 4 (aplicar) una
vez que ventas apruebe o ajuste el CSV. Para continuar cuando estén listos:
`npm run apply-canonical-groups` (o pasarle una ruta de CSV distinta si ventas lo
reexportó) y después confirmar el agrupamiento con `bot_search_catalog`.

**Verification:**
- [x] `npx tsc --noEmit`, `npm run build`, `npm run test` (170/170) y `npm run lint` sin
      errores nuevos (los 3 scripts son `.mjs`, fuera del alcance de TS/Next — ver nota
      de diseño)
- [ ] Manual: revisar/ajustar la propuesta, aplicar, confirmar el agrupamiento — pendiente
- [ ] Manual: confirmar que el panel admin de productos sigue sin cambios — pendiente
      (no debería verse afectado: ya es aditivo por diseño, nada en `app/protected/products`
      lee `canonical_group_id`)

**Decisión de diseño — "pedirle a un LLM" sin agregar una API key nueva:** en vez de un
script que llama a una API de LLM externa, el catálogo se exportó a CSV
(`export_products_for_canonical_grouping.mjs`) y la propuesta la generé yo mismo
leyendo ese CSV en esta sesión (ya soy el LLM con el que se está trabajando) — cero
credenciales nuevas que gestionar para un paso que se corre una sola vez. El resultado
se escribió a otro CSV (`build_canonical_group_proposal.mjs` combina el export con el
mapeo propuesto) pensado para abrir en Excel, exactamente como ya sugiere el diseño en
§5.1. Un tercer script (`apply_product_canonical_groups.mjs`) aplica el CSV ya revisado:
una fila por nombre de grupo distinto en `product_canonical_group` (reutilizando la
existente si ya se corrió antes — se puede re-correr sin duplicar) y
`product.canonical_group_id` por cada producto listado, todo en una sola transacción.

**Regla aplicada en la propuesta (305 productos, 102 con grupo propuesto):** solo se
agruparon filas que son inequívocamente la misma referencia en distinta unidad de
medida (ej. "Tomate Chonto X Kilo" + "...x libra"). Se dejó TODO lo ambiguo sin agrupar
a propósito — variedades distintas (Hass vs común), tamaños de bulto/canasta/caja
(tier mayorista, no una unidad de medida), y el mismo "atado" en tamaños Hogar/Horeca
(diferenciación real de catálogo que Jepri ya hace, no algo para colapsar). Son
decisiones conservadoras, pensadas para que ventas las revise y corrija, no la
propuesta final.

**Dependencies:** Tarea 4; no depende de las Fases 2-5

**Files likely touched:**
- `scripts/export_products_for_canonical_grouping.mjs` (nuevo)
- `scripts/build_canonical_group_proposal.mjs` (nuevo)
- `scripts/apply_product_canonical_groups.mjs` (nuevo)
- `scripts/output/` (nuevo, gitignored — export, mapeo propuesto, y CSV final)
- `.gitignore`, `package.json` (3 scripts de conveniencia nuevos)

**Estimated scope:** M (1 archivo, revisión humana en el medio)

---

## Tarea 23: Promoción a producción en Vercel

**Descripción:** Aplicar las migraciones de las Tareas 4-6 contra Neptuno (producción) por
primera vez — hasta aquí solo existían en el self-hosted de staging. Configurar
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_OPS_CHAT_ID` en Vercel
(`scripts/use-jepri-cli.sh`), desplegar, y registrar el webhook de producción con
`setWebhook` apuntando a la URL de Vercel — reemplazando el webhook de staging.

**Acceptance criteria:**
- [x] Las migraciones del bot aplicadas en Neptuno, con el mismo resultado que en staging
      (4 tablas `bot_*` con RLS y sin policies, 15 funciones `bot_*`, y
      `customer_whatsapp_id_unique` ya eliminada por la Tarea 16)
- [x] Las 3 variables configuradas en Vercel (solo entorno Production)
- [x] `getWebhookInfo` confirma la URL de producción y `pending_update_count: 0`
- [x] El webhook de staging queda explícitamente documentado como entorno secundario
- [x] Ningún `customer`/`distribution_plan` de prueba de staging existe en Neptuno (datos reales únicamente)

**Verification:**
- [x] Manual: `getWebhookInfo` de @JepriPedidosBot muestra `https://app.jepri.co/api/bot/telegram`
- [x] Manual: POST con el secreto correcto -> 200, con uno incorrecto -> 401 (confirma que el
      secreto de Vercel coincide con el registrado en Telegram); la fila de idempotencia de
      esa prueba se borró de Neptuno

**Cómo se hizo (2026-10-10), por si hay que repetirlo:**
1. **Bot nuevo, no `@Jepridevbot`:** se creó **@JepriPedidosBot** en BotFather con nombre de
   cara al cliente. `@Jepridevbot` queda como bot de pruebas/staging, con su propio webhook
   (`staging-tunnel.jepri.co`) — otro bot, no hay conflicto con producción.
2. **PR #4 -> `main` -> Vercel** (git integration, deploy automático a producción), en vez de
   desplegar la rama de feature directo. La rama se borró de `origin` al mergear.
3. **Variables en Vercel (Production):** `TELEGRAM_BOT_TOKEN` (el del bot nuevo),
   `TELEGRAM_WEBHOOK_SECRET` (generado nuevo con `openssl rand -hex 32`, distinto al de
   staging) y `TELEGRAM_OPS_CHAT_ID` (mismo grupo "Jepri Bot - Ops" que staging — el bot
   nuevo tuvo que agregarse como miembro del grupo para poder escribir ahí).
4. **Migraciones a Neptuno, 11 en total, aplicadas por `psql` en orden** (Neptuno no lleva
   tabla de historial de migraciones, igual que staging).

**Hallazgo — a Neptuno le faltaban 2 migraciones de `main` anteriores al bot:**
`20260926000000_customer_whatsapp_id.sql` y `20260926010000_customer_change_request.sql`
(commit `b684e45`, ya mergeado a `main` pero nunca aplicado a producción ni desplegado). Era
el riesgo ya anticipado en la tabla de riesgos de `plan.md` ("el esquema de staging diverge
del de Neptuno") — se materializó. Hubo que aplicarlas **antes** de las del bot, porque
`bot_resolve_customer` lee `customer.whatsapp_id`.

**Hallazgo — datos de teléfono sucios en producción (175 de 206 clientes):** la migración
de `whatsapp_id` agrega un `CHECK` sobre `customer.phone` que fallaba por datos importados de
Siigo en formato `AAA-NUMERO-EXT`. La propia migración documenta que hay que correr antes
`scripts/fix_customer_phone_format.sql` (se me pasó ese paso y los primeros 3 `ALTER TABLE`
de esa migración ya habían quedado aplicados cuando falló el cuarto — se completó después a
mano, sin re-correr los que ya existían). **El `UPDATE` real modificó 175 filas: 108 se
normalizaron a `+57...` y 67 quedaron en `NULL`** por ser placeholders sin número real
(ej. `000-0000000-000`). Se corrió el PREVIEW primero, se le entregó el reporte completo al
usuario y se aplicó solo con su confirmación explícita. Los 67 clientes sin teléfono quedan
para revisión manual — no es algo que el bot necesite (usa `whatsapp_id`, no `phone`), pero
es información que el panel admin ya no muestra.

**Estado de producción al cerrar esta tarea (el bot está desplegado pero no atiende a
nadie todavía, a propósito):**
- **Whitelist vacía:** 0 de 206 clientes tienen `whatsapp_id`. El bot ignora en silencio a
  cualquier chat que no esté ahí — registrar el webhook es seguro antes de cargarla.
- **Sin plan activo:** no hay ningún `distribution_plan` en `planned` con fecha futura, así
  que aun un cliente whitelisteado recibiría "no hay ventana de pedidos activa".
- Para la Tarea 24 (aceptación) hace falta cargar `whatsapp_id` (el `chat_id` de Telegram)
  de al menos un cliente piloto desde la pantalla de clientes, y que operación cree el plan.

**Dependencies:** Todas las de las Fases 1-5 verificadas en staging

**Files likely touched:** Ninguno en el repo (configuración en Vercel/Telegram y migraciones
aplicadas a Neptuno); solo esta documentación

**Estimated scope:** XS

---

## Tarea 24: Prueba de aceptación manual de punta a punta contra `todo/ChatBot.md`

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
