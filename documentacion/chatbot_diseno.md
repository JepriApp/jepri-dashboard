# Diseño: canal de pedidos autónomo vía chatbot (Telegram PoC / WhatsApp futuro)

Diseño técnico para `todo/ChatBot.md`. Cubre arquitectura, control de acceso, reglas de
negocio, la nueva capa de servicio y el flujo conversacional. Diagrama de componentes en
`documentacion/chatbot_arquitectura.mmd`.

**Estado: solo diseño, nada de esto está implementado todavía.**

---

## 1. Principio de diseño

El bot **no reutiliza ningún endpoint ni función existente de creación/edición de pedidos**
porque no existen como API (el panel admin llama a Supabase directo desde el cliente, en
varias operaciones sueltas, sin transacción — ver `app/protected/components/EditSaleOrderModal.tsx`
y `app/protected/sale-orders/create/page.tsx`). Se construye una capa nueva, aditiva, que:

- No modifica el flujo del panel admin (sigue usando `INSERT`/`UPDATE`/`DELETE` directos).
- Es transaccional (una función Postgres = una operación atómica), algo que el flujo admin
  no tiene hoy.
- Es channel-agnostic: el dominio del bot no sabe si el mensaje vino de Telegram o WhatsApp.

Impacto verificado sobre el código actual: **cero**. Las funciones nuevas son aditivas; el
único estado "nuevo" que empiezan a aparecer en `sale_order.status` es `cancelled` por
actualización (no por `DELETE`), y la UI ya lo contempla — `InvoicingReviewTable.tsx:238`
ya filtra `sale_order` con `.neq("status", "cancelled")`, y el tipo `sale_order_status` con
`"cancelled"` ya está modelado en `SaleOrdersTable.tsx` y `sale-orders/page.tsx`. La vista
`sale_order_with_total_and_status` también documenta ese mapeo en `ciclo_de_vida.md` §6.

---

## 2. Control de acceso (whitelist)

Se reutiliza `customer.whatsapp_id` (ya existe, `unique`, acepta E.164 o alfanumérico de
3-64 caracteres — un `chat_id` numérico de Telegram como `"123456789"` encaja sin tocar el
`CHECK` actual). **No hace falta ninguna migración de esquema para el PoC.**

Flujo en cada mensaje entrante:

1. `external_id = String(update.message.chat.id)`.
2. `bot_resolve_customer(external_id)` → si no hay match, **se ignora el mensaje sin
   responder nada** (tal como pide la spec: nada de interacción con desconocidos).
3. Si hay match, se obtiene `customer_id` y continúa el flujo.

Migración futura a WhatsApp real: cuando ese cliente tenga su `whatsapp_id` en formato
E.164 real, se sobrescribe el valor usado en el PoC de Telegram. El PoC es de un solo canal
activo por cliente a la vez (decisión tomada: no se modela una tabla de identidades por
canal para esta primera fase).

---

## 3. Reglas de negocio y resolución del plan

### 3.1 Plan de operación vigente

`plan_date` en `distribution_plan` es la **fecha de entrega**, no la fecha del pedido. El
pedido se adjunta al plan más próximo que todavía está en estado "creado":

```sql
select id, plan_date, cutoff_at
from distribution_plan
where status = 'planned'
  and plan_date > (now() at time zone 'America/Bogota')::date
order by plan_date asc
limit 1
```

Si no hay ningún resultado → no hay ventana de pedidos activa.

### 3.2 Horario de corte

Por plan resuelto en 3.1:

- Si `cutoff_at` tiene valor → válido mientras `now() < cutoff_at`.
- Si `cutoff_at` es `null` → fallback al valor literal de la spec: hoy es lunes, miércoles
  o viernes (`extract(isodow from now() at time zone 'America/Bogota') in (1,3,5)`) y
  `(now() at time zone 'America/Bogota')::time < '21:00'`.

Esto aprovecha una columna que ya existe en `distribution_plan` pero que hoy es puramente
decorativa (solo se muestra en `DistributionPlanDescription.tsx`), sin forzar que el
operador la llene para que el PoC funcione.

### 3.3 Un pedido activo por cliente por plan

Antes de crear, se verifica que el cliente no tenga ya un `sale_order` con
`created_by_customer_id = :customer_id` y `distribution_plan_id = :plan_id` en un estado
distinto de `cancelled`. Si existe, se ofrece editarlo en vez de crear uno nuevo (coherente
con el menú "Ver / modificar mi pedido de hoy").

### 3.4 Ventana válida para editar o cancelar un pedido existente

A diferencia de §3.1 (que resuelve a qué plan se **adjunta** un pedido nuevo), editar o
cancelar un pedido que ya existe opera sobre el plan que ese pedido ya tiene asignado
(`sale_order.distribution_plan_id`), no sobre el plan "más próximo". La ventana válida ahí
es:

- `distribution_plan.status = 'planned'` todavía (si el operador ya lo movió a `preparing`
  en adelante, operación ya empezó a trabajar sobre ese plan — ni editar ni cancelar debe
  pasar en silencio por el bot a esta altura).
- y, solo para **editar**, además dentro del horario de corte (§3.2). Cancelar no exige
  cutoff — un cliente puede querer cancelar incluso después de las 9pm, mientras el plan
  siga en `planned`.

Si el plan ya no está en `planned`, se rechaza con `PLAN_NOT_EDITABLE` (editar) o
`PLAN_NOT_CANCELLABLE` (cancelar) — mensajes distintos a `PAST_CUTOFF` porque la causa es
otra (operación ya avanzó, no que se pasó la hora).

---

## 4. Capa de servicio + API con API keys

No existe hoy ningún endpoint bajo `/api/orders` o `/api/products` (los únicos `route.ts`
actuales son los de `siigo` e `invoicing`), así que hay que construirla. La lógica vive en
un módulo de funciones TypeScript (`lib/bot/services/*.ts`) — y se expone **de dos formas a
la vez**, según quién la llame:

- **En proceso, sin red ni key**: el adaptador de Telegram (§6) vive en el mismo despliegue
  de Next.js, así que el handler del webhook importa y llama estas funciones directamente.
  Cero overhead, cero credencial que proteger.
- **Por HTTP, protegida con API key**: las mismas funciones se exponen también como rutas
  reales (`/api/bot/orders`, `/api/bot/products/*`), para cualquier adaptador de canal que
  **no** viva en este despliegue — el caso más probable es un gateway de WhatsApp
  self-hosted (Evolution API, que corre en su propio contenedor, no en Vercel). Sin esto,
  migrar a un adaptador fuera de proceso obligaría a rediseñar la capa de comunicación en
  ese momento; con esto, ya está lista.

| Spec                     | Función de servicio                   | Ruta HTTP equivalente (con API key) |
|---------------------------|---------------------------------------|----------|
| `GET /api/products`       | `getFrequentProducts(customerId)`     | `GET /api/bot/products/frequent?customer_id=` |
| `GET /api/products`       | `searchCatalog(query)`                | `GET /api/bot/products/search?q=` |
| `GET /api/orders/current` | `getCurrentOrder(customerId)`         | `GET /api/bot/orders/current?customer_id=` |
| `POST /api/orders`        | `createOrder(customerId, items)`      | `POST /api/bot/orders` |
| `PUT /api/orders/:id`     | `updateOrder(orderId, customerId, items)` | `PUT /api/bot/orders/:id` |
| `DELETE /api/orders/:id`  | `cancelOrder(orderId, customerId)`    | `DELETE /api/bot/orders/:id` |

### 4.1 Sistema de API keys

Una API key estática por adaptador (no por cliente final — el cliente ya se identifica con
`whatsapp_id`, la key identifica **qué servicio** está llamando), hasheada en la base, nunca
guardada en texto plano:

```sql
create table bot_api_key (
  id uuid primary key default gen_random_uuid(),
  name text not null,              -- 'telegram-adapter', 'whatsapp-adapter', ...
  key_hash text not null,          -- sha256(key) — el valor en texto plano nunca se guarda
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
```

- Se genera una vez (script puntual, no UI todavía), se muestra solo esa vez, y solo se
  guarda su hash. El adaptador que la use la guarda en **su propio** entorno (si es Evolution
  API en un contenedor aparte, en el `.env` de ese contenedor — nunca en el de Jepri).
- Cada request a `/api/bot/orders` o `/api/bot/products/*` debe traer
  `Authorization: Bearer <key>`; la ruta calcula el hash del valor recibido y lo valida
  llamando a `bot_validate_api_key(p_key_hash text) returns boolean` — otra función
  `SECURITY DEFINER` (§5), igual que el resto: `bot_api_key` también tiene RLS sin policies
  (§11), así que ni esta validación se puede hacer con un `select` directo del cliente anon.
  Sin match → 401, no se ejecuta nada.
- Rotar una key es: generar una nueva, actualizar el adaptador, y recién después poner
  `revoked_at = now()` en la vieja — sin downtime.
- Esto es un mecanismo **distinto** del `secret_token` de Telegram (§9): ese autentica "esto
  de verdad viene de Telegram"; la API key autentica "este adaptador tiene permiso de llamar
  a nuestra API" — son capas separadas, no se reemplazan entre sí. Los webhooks de canal
  (`/api/bot/telegram`, `/api/bot/whatsapp`) siguen autenticándose solo con el mecanismo
  propio de cada plataforma, nunca con esta API key.

Autenticación hacia Supabase: estas funciones de servicio usan el mismo cliente anon/
publishable que ya usa el resto del backend (`lib/supabase/server.ts`). No se introduce
ninguna `service_role` key — la elevación de privilegios vive en las funciones de Postgres
(§5), no en Next.js.

---

## 5. Funciones de Postgres (`SECURITY DEFINER`)

El bot no tiene sesión de Supabase Auth (no hay `auth.uid()`), así que no puede apoyarse en
las RLS policies existentes (`*_admin_all`, atadas a `admin.user_id = auth.uid()`). En vez
de añadir una `service_role` key al proyecto, toda la lógica del bot vive en funciones
`SECURITY DEFINER` — corren con los privilegios de su dueño y agrupan cada operación en una
sola transacción (algo que el flujo admin actual no tiene). Todas con `SET search_path =
public` fijo (hardening estándar para evitar hijacking de `search_path` en funciones
`SECURITY DEFINER`), y todas prefijadas `bot_` para que queden claramente agrupadas y
auditables.

### 5.1 Agrupación canónica de productos (resuelve variantes de unidad)

El catálogo tiene más de 300 filas en `product`, y varias de ellas son **el mismo producto
repetido por cada unidad de medida en que se vende** (porque `product.unit` es un único
valor por fila, no una lista). Buscar "tomate" devolvería varias filas casi idénticas sin
contexto que las diferencie para el cliente — y como el catálogo viene importado de Siigo,
no se puede asumir que el nombre sigue una convención consistente para agruparlas con un
regex (mismo problema de datos sucios ya visto con `customer.phone`, que necesitó
`scripts/fix_customer_phone_format.sql`).

**La agrupación se hace una sola vez, offline, con un LLM — nunca en vivo dentro del flujo
de chat:**

1. Un script puntual (`scripts/generate_product_canonical_groups.ts` o similar, se corre a
   mano, no en producción) lee todos los `product.name`/`description`/`unit` y le pide a un
   LLM que proponga agrupaciones: qué filas son la misma referencia de producto en distinta
   unidad/empaque.
2. Un admin revisa y ajusta esa propuesta (puede ser tan simple como exportar a CSV, revisar
   en Excel, y re-importar) antes de aplicarla.
3. Se aplica como datos: tabla nueva `product_canonical_group (id, name)` + columna nueva
   `product.canonical_group_id` (nullable, FK). Aditivo — el panel admin sigue mostrando
   `product.name` tal cual, sin usar esta columna; **impacto en la app existente: cero**.
4. Se vuelve a correr solo cuando el catálogo cambie de forma relevante (productos nuevos),
   no en cada mensaje del bot.

El bot en producción **nunca llama al LLM** — solo lee `canonical_group_id`, ya validado por
un humano. Esto mantiene el flujo de chat 100% determinista (sin latencia ni riesgo de
alucinación en el camino transaccional), y resuelve el problema real: agrupar variantes de
unidad bajo un mismo resultado de búsqueda.

Lecturas:

```sql
bot_resolve_customer(p_external_id text)
  returns table(customer_id uuid, name text)

bot_validate_api_key(p_key_hash text)
  returns boolean
  -- select exists(select 1 from bot_api_key where key_hash = p_key_hash and revoked_at is null)
  -- usada por las rutas HTTP de §4.1, nunca por el adaptador en proceso (ese no pasa por HTTP)

bot_get_active_plan()
  returns table(plan_id uuid, plan_date date, cutoff_at timestamptz)

bot_get_frequent_products(p_customer_id uuid, p_limit int default 8)
  returns table(canonical_group_id uuid, canonical_name text, variants jsonb, times_ordered int)
  -- cuenta sale_item por canonical_group_id (sumando todas las variantes de unidad) entre
  -- todas las sale_order no-canceladas del cliente, order by times_ordered desc, limit p_limit.
  -- variants = [{product_id, unit, reference_price}, ...] de ese grupo.
  -- Es el acceso rápido al entrar a "Crear pedido".

bot_search_catalog(p_query text, p_limit int default 8)
  returns table(canonical_group_id uuid, canonical_name text, variants jsonb)
  -- select sobre product where unaccent(lower(name)) ilike unaccent(lower('%'||p_query||'%'))
  -- (o lower(name) ilike ... si `unaccent` no está habilitada), agrupado por canonical_group_id,
  -- order by canonical_name limit p_limit. variants = [{product_id, unit, reference_price}, ...].

bot_get_current_order(p_customer_id uuid)
  returns table(order_id uuid, order_code text, status text, items jsonb)
  -- acotado al plan activo (mismo que resuelve bot_get_active_plan / §3.1), no a todo el
  -- historial del cliente: busca created_by_customer_id=p_customer_id en ese plan_id.
```

Escrituras (transaccionales):

```sql
bot_create_order(p_customer_id uuid, p_items jsonb)
  returns table(order_id uuid, order_code text)
  -- 1. resuelve plan (§3.1); si no existe -> RAISE 'NO_ACTIVE_PLAN'
  -- 2. valida cutoff (§3.2); si no pasa  -> RAISE 'PAST_CUTOFF'
  -- 3. valida que no haya ya un pedido activo del cliente en ese plan (§3.3)
  --                                      -> RAISE 'ORDER_ALREADY_EXISTS'
  -- 4. insert sale_order (customer_id=p_customer_id, distribution_plan_id=plan.id,
  --    created_by_customer_id=p_customer_id, created_by_admin_id=null, status='pending')
  -- 5. insert sale_item por cada item de p_items

bot_update_order(p_order_id uuid, p_customer_id uuid, p_items jsonb)
  returns void
  -- 1. busca sale_order con id=p_order_id AND created_by_customer_id=p_customer_id
  --    (ownership estricto: nunca permite tocar un pedido creado por admin)
  --                                      -> si no existe: RAISE 'ORDER_NOT_FOUND'
  -- 2. valida status not in ('cancelled','delivered','out_for_delivery')
  --                                      -> RAISE 'ORDER_NOT_EDITABLE'
  -- 3. valida distribution_plan.status = 'planned' (§3.4) -> RAISE 'PLAN_NOT_EDITABLE'
  -- 4. valida cutoff del plan del pedido (§3.2)            -> RAISE 'PAST_CUTOFF'
  -- 5. delete sale_item where sale_order_id=p_order_id; insert los nuevos de p_items
  --    (replace completo, atómico, a diferencia de EditSaleOrderModal.tsx que hace
  --    delete+update+insert sueltos desde el cliente)

bot_cancel_order(p_order_id uuid, p_customer_id uuid)
  returns void
  -- 1. busca sale_order con id=p_order_id AND created_by_customer_id=p_customer_id
  --                                      -> si no existe: RAISE 'ORDER_NOT_FOUND'
  -- 2. valida status not in ('cancelled','delivered','out_for_delivery')
  --                                      -> RAISE 'ORDER_NOT_CANCELLABLE'
  -- 3. valida distribution_plan.status = 'planned' (§3.4) -> RAISE 'PLAN_NOT_CANCELLABLE'
  --    (sin chequeo de cutoff: cancelar se permite a cualquier hora mientras el plan
  --    siga en 'planned')
  -- 4. update sale_order set status = 'cancelled' where id = p_order_id
  --    (soft-cancel: solo para pedidos creados por el bot/cliente;
  --    el panel admin sigue usando DELETE, sin cambios)
```

Convención de errores: cada `RAISE EXCEPTION` usa un código de texto estable antes del
primer `:` (p. ej. `'PAST_CUTOFF: ya pasó la hora límite de hoy'`). La capa de servicio (§4)
parsea ese código y lo traduce a un mensaje amigable para el chat — nunca se expone un
error SQL crudo al usuario.

**Nota sobre el catálogo (§4 de la spec, corregido dos veces):** no se filtra por
`offer.available` ni por `product_with_active_offers` — al momento de recibir el pedido no
se sabe con certeza la disponibilidad real de cada producto (la vincula el proveedor
después, en `purchase_item`/`fulfillment`). Pero tampoco se expone el catálogo completo de
una sola vez: con más de 300 productos, listarlos todos en un chat es inviable. En su lugar
(§5.1):

- **Productos frecuentes del cliente** (`bot_get_frequent_products`) como accesos rápidos de
  un tap, aprovechando que en este negocio los clientes tienden a repetir cesta.
- **Búsqueda por texto** (`bot_search_catalog`) sobre el catálogo completo (sin filtrar
  disponibilidad) para cualquier producto que no esté entre sus frecuentes.

Ningún comando lista el catálogo completo de una sola vez.

---

## 6. Desacoplamiento de canal

```ts
interface InboundMessage {
  channel: "telegram" | "whatsapp";
  externalId: string;
  text: string;
  callbackData?: string;
}

interface BotMessage {
  text: string;
  buttons?: { label: string; value: string }[];
}

interface ChannelAdapter {
  parseInbound(rawPayload: unknown): InboundMessage;
  sendMessage(externalId: string, message: BotMessage): Promise<void>;
}
```

`app/api/bot/telegram/route.ts` implementa `ChannelAdapter` traduciendo updates/teclados
inline de Telegram. Migrar a WhatsApp (Meta Cloud API, Twilio o Evolution API) es agregar
`app/api/bot/whatsapp/route.ts` con su propio `ChannelAdapter` — el dominio del bot (§3),
la API (§4) y las funciones de Postgres (§5) no cambian.

---

## 7. Flujo conversacional (Telegram PoC)

**Verificación inicial (automática, antes de cualquier menú):**

```
whitelist(chat_id) → ¿existe el cliente?
  no  → ignorar, sin responder
  sí  → ¿hay plan activo (§3.1) y dentro de horario (§3.2)?
  no  → "⏰ Hoy no hay ventana de pedidos activa. Los pedidos se reciben lunes,
         miércoles y viernes hasta las 9:00 PM."
  sí  → mostrar Menú Principal
```

**Menú Principal:**

```
¡Hola {nombre}! 👋 ¿Qué quieres hacer?
🛒 Crear nuevo pedido
📋 Ver / modificar mi pedido de hoy
❌ Cancelar pedido
```

**🛒 Crear pedido** → `getFrequentProducts(customerId)` muestra hasta 8 productos más
pedidos por ese cliente como botones de un tap (uno por `canonical_group_id`), más el botón
"🔍 Buscar otro producto" → si el cliente escribe texto libre, `searchCatalog(query)`
devuelve hasta 8 grupos coincidentes → al elegir un grupo, **si tiene más de una variante**
se pregunta la unidad ("¿En qué unidad? • kg - $4.500 • caja x20 - $85.000"); si solo tiene
una, se salta ese paso → cantidad por mensaje → resumen → confirmación → `createOrder(...)`
(con el `product_id` de la variante elegida) → `"✅ Pedido {order_code} creado. Se entrega
el {plan_date}."` Si un cliente nuevo no tiene productos frecuentes todavía, se salta directo
a la búsqueda.

**📋 Ver / modificar** → `getCurrentOrder(customerId)` → si no hay pedido, ofrece crear uno;
si hay, muestra items y permite editar cantidades → `updateOrder(orderId, customerId, items)`.

**❌ Cancelar** → confirmación explícita ("¿Seguro que quieres cancelar el pedido
{order_code}?") → `cancelOrder(orderId, customerId)` →
`"❌ Pedido {order_code} cancelado."`

**Errores del backend:** cada código (`NO_ACTIVE_PLAN`, `PAST_CUTOFF`,
`ORDER_ALREADY_EXISTS`, `ORDER_NOT_FOUND`, `ORDER_NOT_EDITABLE`, `ORDER_NOT_CANCELLABLE`,
`PLAN_NOT_EDITABLE`, `PLAN_NOT_CANCELLABLE`) se traduce a un mensaje amigable en el
adaptador de Telegram — nunca se expone el error crudo.

---

## 8. Estado de conversación entre pasos

Un webhook de Telegram es sin estado por request: cada mensaje llega como una llamada HTTP
independiente. Flujos de varios pasos ("elige producto" → "elige unidad" → "cantidad" →
"confirmar") necesitan recordar en qué paso va cada cliente entre un mensaje y el siguiente.

El `callback_data` de los botones inline de Telegram sirve para pasos simples (tiene un
límite de 64 bytes, no alcanza para cargar un pedido completo con varios items), pero no
para el paso de cantidad, que se escribe como texto libre y necesita saber "cantidad de
qué". Por eso se agrega una tabla nueva de sesión corta:

```sql
create table bot_conversation_state (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customer(id),
  channel text not null,                 -- 'telegram' | 'whatsapp'
  state text not null,                   -- 'idle' | 'awaiting_unit' | 'awaiting_quantity' | 'awaiting_cancel_confirm' | ...
  context jsonb not null default '{}',    -- { canonical_group_id, product_id, pending_items: [...], order_id (si edita) }
  updated_at timestamptz not null default now(),
  unique (customer_id, channel)
);
```

- Una fila por `(customer_id, channel)` — se sobreescribe en cada paso, no se acumula
  historial ahí (el historial de auditoría va en §10).
- Si `updated_at` tiene más de, por ejemplo, 15 minutos, se trata como `idle` y se reinicia
  al Menú Principal — evita que una conversación abandonada a medias quede "atascada".
- Tabla aditiva y nueva; no la usa ni la toca el panel admin.

---

## 9. Seguridad del webhook e idempotencia

**Autenticidad del webhook:** `/api/bot/telegram` es una URL pública en Vercel — cualquiera
en internet puede intentar llamarla. Telegram soporta un `secret_token` al registrar el
webhook (`setWebhook`), que reenvía en cada request como header
`X-Telegram-Bot-Api-Secret-Token`. La ruta valida ese header contra `TELEGRAM_WEBHOOK_SECRET`
(variable de entorno) **antes de tocar cualquier dato** — si no coincide, responde 401 y no
procesa nada.

**Idempotencia:** Telegram reintenta la entrega si no recibe 200 OK a tiempo, así que el
mismo `update_id` puede llegar más de una vez. El chequeo pasa en el propio handler del
webhook, **antes** de llamar a cualquier función de servicio (§4) — no dentro de las RPCs de
negocio, que no necesitan saber nada de `update_id`:

```sql
create table bot_processed_update (
  channel text not null,      -- 'telegram' | 'whatsapp' — cada canal tiene su propio
                               -- esquema de ids, de ahí la clave compuesta
  update_id text not null,
  created_at timestamptz not null default now(),
  primary key (channel, update_id)
);
```

```sql
insert into bot_processed_update (channel, update_id) values ('telegram', :update_id)
on conflict (channel, update_id) do nothing
returning update_id
```

Si no devuelve fila (ya existía), el handler responde 200 de inmediato sin llamar a ningún
servicio ni RPC — evita que un reintento duplique un `createOrder(...)` ya procesado.

---

## 10. Auditoría y alertas de fallos

**Auditoría (trazabilidad sin humano de por medio):** cada acción de dominio (no cada ping
del webhook) se registra en una tabla nueva:

```sql
create table bot_interaction_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customer(id),
  channel text not null,
  action text not null,          -- 'create_order' | 'update_order' | 'cancel_order' | 'search' | ...
  payload jsonb,                 -- lo que pidió el cliente
  result jsonb,                  -- order_id/order_code, o el código de error (§5)
  created_at timestamptz not null default now()
);
```

Sirve para responder "¿por qué se creó/canceló este pedido?" sin depender de los logs
efímeros de Vercel, dado que no hay un operador humano revisando cada interacción en el
momento.

**Alertas de fallos (spec D.4):** confirmado — el mismo bot le envía un mensaje a un chat de
Telegram interno de operaciones cuando algo falla de forma importante (error no controlado
en una RPC, el webhook de Telegram deja de responder, etc.). Se configura un
`TELEGRAM_OPS_CHAT_ID` (variable de entorno, el `chat_id` de un grupo interno con el equipo
de Jepri) y el adaptador de Telegram expone un `notifyOps(message)` que reutiliza el mismo
`sendMessage` de la Bot API — cero infraestructura nueva. Los errores de negocio esperados
(`PAST_CUTOFF`, `ORDER_NOT_FOUND`, etc.) **no** disparan esta alerta — son respuestas
normales al cliente, no fallos del sistema.

---

## 11. RLS en las tablas nuevas

`product_canonical_group`, `bot_conversation_state`, `bot_processed_update`,
`bot_interaction_log` y `bot_api_key` llevan **RLS activado y sin ninguna policy**. Nadie las lee ni escribe
directo — ni siquiera una sesión de admin autenticada — porque todo pasa por las funciones
`SECURITY DEFINER` de §5, que ignoran RLS por diseño. Es el equivalente a "deny by default"
para cualquier acceso que no venga de esas funciones: si en el futuro alguien agrega una
policy por error pensando en exponerlas al panel admin, igual no cambia nada mientras el
bot siga usando las funciones — pero mantiene la superficie de ataque en cero mientras no
haga falta.

---

## 12. Variables de entorno nuevas

| Variable | Para qué |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Autenticar las llamadas salientes a la Bot API (`sendMessage`, `setWebhook`) |
| `TELEGRAM_WEBHOOK_SECRET` | Validar el header `X-Telegram-Bot-Api-Secret-Token` en cada request entrante (§9) |
| `TELEGRAM_OPS_CHAT_ID` | `chat_id` del grupo interno de Jepri donde el bot avisa fallos (§10) |

Ninguna reemplaza ni modifica las variables existentes (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, etc.) — son aditivas, igual que el resto del diseño.

---

## 13. Fuera de alcance de este diseño

- Notificaciones push del bot hacia el cliente (p. ej. avisos de entrega) — no lo pide la
  spec actual, solo el flujo de pedido iniciado por el cliente.
- Soporte multi-canal simultáneo por cliente (un cliente con Telegram y WhatsApp activos a
  la vez) — requeriría la tabla `bot_channel_identity` descartada para este PoC.
- Panel de administración del whitelist (hoy se gestiona editando `customer.whatsapp_id`
  desde `./users/customers`, que ya existe).
