# Plan de implementación: Chatbot de pedidos (Telegram PoC / WhatsApp futuro)

## Overview

Implementación del diseño cerrado en `documentacion/chatbot_diseno.md` (spec original en
`todo/ChatBot.md`): un canal conversacional por Telegram donde clientes en whitelist pueden
crear, ver/modificar y cancelar su pedido del día de operación vigente, sin intervención de
un humano, reutilizando las reglas de negocio reales de `distribution_plan`/`sale_order`.
Todo el trabajo es **aditivo** sobre el esquema y el código actuales — no se toca el panel
admin existente.

El repo no tenía nada de esto (confirmado): sin test runner, sin `Dockerfile`, sin CI. Se
monta ahora, como parte de este plan, porque el bot es el primer componente que necesita
recibir tráfico público real (webhooks) antes de llegar a producción, y la lógica
transaccional (crear/editar/cancelar pedidos sin supervisión humana) es demasiado crítica
para verificar solo a mano.

## Architecture Decisions

- **Todo aditivo, cero cambios al flujo admin**: el admin sigue usando `INSERT`/`UPDATE`/
  `DELETE` directos; el bot usa funciones Postgres `SECURITY DEFINER` nuevas, todas
  prefijadas `bot_`.
- **Sin `service_role` key**: la elevación de privilegios vive en las funciones de Postgres,
  no en una clave de Supabase expuesta en Next.js.
- **Capa de servicio TypeScript expuesta dos veces**: en proceso (el adaptador de Telegram,
  que vive en el mismo despliegue, la llama directo) y por HTTP con API key (para un futuro
  adaptador fuera de proceso, p. ej. un gateway de WhatsApp self-hosted).
- **Resolución de plan por fecha de entrega, no por "hoy"**: el pedido se adjunta al plan
  `status='planned'` más próximo con `plan_date` futura — no al plan "de hoy".
- **Cancelación es soft (`status='cancelled'`), nunca `DELETE`** — solo para pedidos con
  `created_by_customer_id`; el panel admin no cambia.
- **Catálogo nunca se lista completo** (300+ productos): accesos rápidos a frecuentes +
  búsqueda por texto, agrupados por `canonical_group_id` (agrupación hecha una sola vez,
  offline, con un LLM revisado por un admin — nunca en vivo en el chat). Las RPCs agrupan
  por `coalesce(canonical_group_id, product.id)`, así que funcionan correctamente aunque la
  agrupación todavía no haya corrido — esa tarea no bloquea el resto del plan.
- **Pruebas automatizadas, nuevas en el repo**: `pgTAP` para las 9 funciones
  `SECURITY DEFINER` — es la lógica más crítica (dinero/pedidos sin humano de por medio).
  Corre vía `scripts/run_pgtap_tests.sh` (`npm run test:db`) directo con `psql` contra
  `STAGING_DATABASE_URL`, no vía `supabase test db` — ese comando fuerza TLS y el
  self-hosted de staging no lo soporta, y `supabase start` necesita Docker (no disponible en
  este entorno). Cada archivo sigue envuelto en `begin;...rollback;`, mismo efecto de
  aislamiento. `Vitest` para la capa TypeScript (servicios, adaptador, manejo de
  estado/errores) — se elige sobre Jest por ser nativo ESM/TS y más liviano, encaja mejor
  con Next.js 16 + Turbopack que ya usa el proyecto.
- **Staging propio antes de Vercel**: Telegram no puede llamar a `localhost`. El servidor
  local del usuario (con reverse proxy + HTTPS ya configurado, detrás de un dominio propio)
  se usa como entorno de staging real vía Docker — resuelve de raíz el problema de probar
  webhooks sin depender de túneles (ngrok) ni de preview deploys de Vercel. El flujo de
  despliegue queda: **Docker en servidor propio (pruebas de los Fases 3-5) → Vercel
  (producción, al final)**.
- **Staging y producción usan proyectos Supabase distintos, a propósito**: "Neptuno" (cloud)
  es producción, nunca se toca hasta la Tarea 22. El staging en Docker apunta al Supabase
  self-hosted del propio servidor (`10.85.96.51:8000`, el mismo ya referenciado en
  `next.config.ts` para desarrollo) — datos de prueba, migraciones y pruebas de las Fases
  1-5 viven ahí, aislados de los datos reales de clientes.

Detalle completo de cada decisión del diseño del bot: `documentacion/chatbot_diseno.md` (13
secciones).

## Task List

Tareas detalladas en `tasks/todo.md`. Índice por fase:

### Fase 0: Credenciales y datos de prueba
- [x] Tarea 1: Provisión de credenciales de Telegram y datos de prueba

### Fase 0.5: Infraestructura de pruebas y staging (nueva en el repo)
- [x] Tarea 2: Harness de pruebas automatizadas (Vitest + pgTAP)
- [x] Tarea 3: Staging con Docker en el servidor propio — `https://jepri-staging.lab.ryumanakano.com`

### Checkpoint: Fase 0 / 0.5
- [x] Token de bot funcionando, cliente de prueba whitelisteado
- [x] `npm run test` corre (aunque sin tests todavía, el harness existe)
- [x] Contenedor de staging responde en el dominio propio por HTTPS

### Fase 1: Base de datos
- [ ] Tarea 4: Migración — tablas nuevas del bot + RLS sin policies
- [ ] Tarea 5: Funciones `SECURITY DEFINER` — lecturas
- [ ] Tarea 6: Funciones `SECURITY DEFINER` — escrituras transaccionales

### Checkpoint: Fase 1
- [ ] Suite de `pgTAP` cubre las 9 funciones, incluyendo cada `RAISE EXCEPTION`, y pasa
- [ ] `npm run build` sigue pasando sin tocar código TS todavía

### Fase 2: Capa de servicio TypeScript
- [ ] Tarea 7: Servicio de catálogo (`lib/bot/services/products.ts`)
- [ ] Tarea 8: Servicio de pedidos (`lib/bot/services/orders.ts`)
- [ ] Tarea 9: Servicio de whitelist (`lib/bot/services/auth.ts`)

### Checkpoint: Fase 2
- [ ] Suite de Vitest cubre las 7 funciones de servicio contra el proyecto de desarrollo y pasa
- [ ] `npm run build`, `npm run lint` y `npm run test` pasan

### Fase 3: Canal Telegram
- [ ] Tarea 10: Tipos de desacoplamiento de canal (`lib/bot/channel.ts`)
- [ ] Tarea 11: Adaptador de Telegram (`lib/bot/adapters/telegram.ts`)
- [ ] Tarea 12: Webhook `/api/bot/telegram` — secreto, idempotencia, whitelist
- [ ] Tarea 13: Flujo "ver pedido" de punta a punta (vertical slice mínimo)

### Checkpoint: Fase 3
- [ ] Desplegado en staging (Tarea 3), un mensaje real de Telegram de un chat_id
  whitelisteado recibe respuesta correcta; uno no whitelisteado es ignorado
- [ ] Reenviar el mismo `update_id` no duplica ningún efecto
- [ ] Vitest cubre `parseInbound`/`sendMessage`/validación de secreto sin depender de Telegram real

### Fase 4: Flujos de pedido
- [ ] Tarea 14: Estado de conversación (`bot_conversation_state`) en el dominio del bot
- [ ] Tarea 15: Flujo "crear pedido" de punta a punta
- [ ] Tarea 16: Flujo "modificar pedido" de punta a punta
- [ ] Tarea 17: Flujo "cancelar pedido" de punta a punta

### Checkpoint: Fase 4 — PoC funcionalmente completo
- [ ] Un pedido creado vía Telegram (en staging) aparece correcto en
  `app/protected/sale-orders` del panel admin
- [ ] Un pedido cancelado vía bot se ve como `cancelled` sin romper `InvoicingReviewTable`
  ni `sale_order_with_total_and_status`
- [ ] Los 3 flujos funcionan de punta a punta contra el bot real en staging

### Fase 5: Dureza operativa
- [ ] Tarea 18: Auditoría — `bot_interaction_log` en cada acción de dominio
- [ ] Tarea 19: Alertas de fallos — `notifyOps` en errores no controlados
- [ ] Tarea 20: Sistema de API keys + rutas HTTP `/api/bot/orders`, `/api/bot/products/*`

### Checkpoint: Fase 5
- [ ] Cada acción de dominio deja una fila en `bot_interaction_log`
- [ ] Forzar un error no controlado dispara alerta de ops; un error de negocio esperado no
- [ ] Las rutas HTTP responden 401 sin API key válida y 200 con una

### Fase 6: Catálogo — mejora
- [ ] Tarea 21: Agrupación canónica de catálogo asistida por LLM (offline)

### Fase 7: Producción y aceptación
- [ ] Tarea 22: Promoción a producción en Vercel
- [ ] Tarea 23: Prueba de aceptación manual de punta a punta contra `todo/ChatBot.md`

### Checkpoint: Completo
- [ ] Todos los criterios de aceptación de las 23 tareas cumplidos
- [ ] Suite automatizada (`npm run test` + `pgTAP`) corre en verde
- [ ] Validado en staging antes de promover a Vercel
- [ ] Listo para revisión humana antes de considerar el PoC cerrado

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Sin suite de pruebas automatizadas previa en el repo — hay que montar el harness antes de poder confiar en él | Medio, una sola vez | Tarea 2 dedicada, temprano en el plan, antes de que haya lógica de negocio que probar |
| `output: 'standalone'` en `next.config.ts` (necesario para una imagen Docker liviana) no es necesario en Vercel y no está probado hoy en ese entorno | Bajo | Habilitarlo sin condicional (es inocuo en Vercel, solo genera una carpeta que esa plataforma no usa); verificar con un deploy de prueba a Vercel después de agregarlo (Tarea 3) antes de tocar nada más |
| La extensión `unaccent` de Postgres puede no estar habilitada en el proyecto Supabase | Bajo | `bot_search_catalog` cae a `lower(name) ilike ...` sin normalizar acentos (ya contemplado en el diseño, §5.1); cubierto por un caso de pgTAP en ambas ramas |
| El bot depende de que el operador ya haya creado el `distribution_plan` en estado `planned` con la `plan_date` correcta antes de cada día de pedidos | Alto para el PoC en producción | Confirmar con operación el hábito real de creación anticipada de planes antes de activar el bot con clientes reales (ver Open Questions) |
| La agrupación canónica por LLM (Tarea 21) depende de revisión humana y puede tomar tiempo | Bajo — no bloquea nada | Las RPCs ya degradan a grupos de un solo producto sin la agrupación; es la última fase, no bloqueante |
| Staging (self-hosted `10.85.96.51:8000`) y producción (Neptuno) son instancias de Supabase distintas por diseño — las migraciones nuevas (Tareas 4-6) hay que aplicarlas dos veces, y si el esquema de staging diverge del de Neptuno (por migraciones viejas no sincronizadas), una prueba en staging podría no predecir el comportamiento real en producción | Medio | Aplicar cada migración a `10.85.96.51:8000` primero (Fase 1) y recién a Neptuno como parte de la Tarea 22, nunca antes; si surge una diferencia de esquema entre ambas, resolverla antes de promover |

## Open Questions

- ¿Quién administra el bot de Telegram (cuenta de BotFather) y quién es miembro del chat de
  operaciones (`TELEGRAM_OPS_CHAT_ID`)? — operativo, necesita una persona de Jepri.
- ¿El equipo de operación de Jepri efectivamente crea el `distribution_plan` del día
  siguiente *antes* de que abra la ventana de pedidos, de forma consistente? La Tarea 1 debe
  confirmar esto con al menos un plan de prueba creado a mano.
- ¿Con cuántos clientes reales (no solo de prueba) se activa el PoC inicialmente?
- ~~¿El Supabase self-hosted en `10.85.96.51:8000` ya tiene el esquema actualizado al día
  con Neptuno?~~ Resuelto en la Tarea 1: estaba desactualizado (faltaba `whatsapp_id`), se
  restauró y quedó confirmado al día.
- ~~Acceso directo por `psql` al self-hosted~~ Resuelto: el pooler (`supabase-pooler`,
  puerto 5432) sí funciona — el tenant correcto es el placeholder por defecto
  `your-tenant-id` (nunca personalizado en ese servidor), con usuario
  `postgres.your-tenant-id` y `DEV_POSTGRES_PASSWORD`. No hizo falta exponer ningún puerto
  nuevo ni tocar `docker-compose.yml`.
