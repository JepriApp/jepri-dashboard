# ESPECIFICACIÓN Y DISEÑO DE CASO DE USO: CANAL DE PEDIDOS AUTÓNOMO VÍA CHATBOT (TELEGRAM / WHATSAPP) PARA JEPRI

## 1. Contexto del Proyecto

Jepri (<https://www.jepri.co>) es una plataforma comercial. Actualmente administra su base de datos en **Supabase** y aloja su infraestructura backend/API en **Vercel**. El backend actual ya implementa todas las reglas de negocio para la gestión de pedidos. Tú ya tienes acceso al código fuente del backend y a la base de datos.

Queremos implementar un canal de comunicación conversacional autónomo donde los clientes puedan gestionar sus órdenes sin interacción de personal humano. Para la **fase de pruebas inicial (PoC)** utilizaremos **Telegram**, asegurando que la arquitectura sea fácilmente desacoplable para conectar posteriormente a **WhatsApp**.

---

## 2. Objetivo

Diseñar e implementar una solución que procese interacciones vía Telegram/WhatsApp para que los clientes finales puedan:

1. Crear una nueva orden de compra.
2. Consultar y modificar una orden existente.
3. Cancelar/eliminar una orden activa.

### Principio de Diseño Clave

- **Reutilización de API Backend:** El chatbot **DEBE consumir y reutilizar los endpoints del backend ya existentes** para la creación, modificación, cancelación y consulta de pedidos. No se debe duplicar la lógica de negocio ni reescribir reglas que el backend ya valida.
- **Control de Acceso (Whitelist):** Solo los usuarios cuyos números de teléfono / IDs de usuario estén previamente autorizados en una lista blanca (`whitelist`) en Supabase podrán interactuar con el bot para realizar pedidos.

---

## 3. Reglas de Negocio (Consumidas desde el Backend)

1. **Días de Operación:** Recepción de órdenes exclusivamente los **Lunes, Miércoles y Viernes**.
2. **Plan de Operación:** Solo se registran o modifican órdenes si existe un `plan_de_operacion` en estado **`en proceso`** para el día correspondiente.
3. **Fecha de Entrega:** Las órdenes de un día de operación ($T$) se entregan al día siguiente ($T+1$: Martes, Jueves y Sábado). No se permiten pedidos fuera de este ciclo.
4. **Cierre de Operación (Deadline):** Hora límite estricta a las **21:00 (9:00 PM) hora Colombia (UTC-5)** del día de operación.
5. **Validación Whitelist:** Si un usuario no registrado en la lista blanca intenta interactuar, el bot debe denegar el acceso y redirigir a un mensaje de contacto.

---

## 4. Alcance Requerido del Diseño

Necesito que diseñes la solución técnica considerando los siguientes entregables:

### A. Arquitectura e Integración de Canales

- **Webhook en Vercel:** Diseñar el webhook o servicio intermedio (Serverless/Edge Function) que reciba los eventos de la API de Telegram (Bot API). O puedes proponer una opción alternativa
- **Desacoplamiento de Canal:** Definir una capa de abstracción sencilla para que cambiar el proveedor de chat de Telegram a WhatsApp (vía Meta Cloud API, Twilio o Evolution API) requiera únicamente cambiar la capa de entrada/salida de mensajes sin tocar la integración con la base de datos ni los endpoints.

### B. Autenticación y Control de Acceso (Whitelist)

- Definir la estructura o consulta en Supabase (ej. tabla `bot_whitelist` o flag `is_authorized` en la tabla de clientes) para validar si el número de teléfono / ID del usuario está habilitado.
- Definir el flujo de respuesta cuando un usuario no autorizado intenta enviar un mensaje. Por el momento no debe haber interacción con números desconocidos, simplemente son ignorados.

### C. Mapeo e Integración con Endpoints Existentes

- Mapear cómo las acciones del bot conversacional invocan la API REST / GraphQL actual en Vercel:
  - `GET /api/orders/current` -> Consultar pedido del día.
  - `POST /api/orders` -> Crear nuevo pedido.
  - `PUT /api/orders/:id` -> Modificar pedido.
  - `DELETE /api/orders/:id` -> Cancelar pedido.
  - `GET /api/products` -> Consultar catálogo activo del plan de operación.

### D. Flujo Conversacional (UX Chatbot en Telegram)

Diseñar la máquina de estados o árbol de navegación del bot:

1. **Verificación Inicial:** Comprobar Whitelist $\rightarrow$ Verificar Plan de Operación Activo $\rightarrow$ Verificar horario (< 9:00 PM UTC-5).
2. **Menú Principal:**
   - 🛒 *Crear nuevo pedido*
   - 📋 *Ver / Modificar mi pedido de hoy*
   - ❌ *Cancelar pedido*
3. **Manejo de Errores del Backend:** Capturar las respuestas HTTP del backend (ej. `400 Bad Request` por superar las 9:00 PM o plan cerrado) y traducirlas a mensajes claros y amigables en el chat.
4. Alerta de al sistema sobre fallos importantes.

---

## 5. Entregables Esperados

1. **Diagrama o arquitectura de la solución** (Telegram Bot API $\rightarrow$ Webhook Vercel $\rightarrow$ Middleware Whitelist $\rightarrow$ API Backend Vercel / Supabase).
2. **Estructura de la tabla `whitelist`** en Supabase o propuesta de integración con las tablas de usuarios existentes. O si se usa otra forma de autenticación, especificarla.
3. **Especificación del flujo conversacional y guion de mensajes** para la prueba en Telegram.
