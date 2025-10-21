# Ciclo de vida de la base de datos

Resumen directo del flujo, desde catálogo hasta entrega planificada.

## 1. Catálogo y precios
- Productos: `product` (nombre, unidad, foto, precio de referencia).
- catálogos: `offer` (precio del proveedor por producto, `available` indica si está activa).
- Consulta de catálogo: se leen `product` y `offer` para mostrar precios vigentes.

## 2. Carrito del cliente
- Carrito: `shopping_cart` guarda producto y cantidad por cliente.
- Es temporal y editable antes de crear una orden.

## 3. Creación del pedido
- Orden de venta: `sale_order` (`status = 'pending'`).
- Ítems del pedido: `sale_item` por cada producto del carrito.
- Códigos secuenciales: triggers generan `order_seq` y `order_code`.
- Totales: la vista `sale_order_with_total` calcula el total con ítems + cargos.

## 4. Abastecimiento (opcional)
- Orden de compra: `purchase_order` para proveedores.
- Ítems de compra: `purchase_item`.
- Vinculación: `fulfillment` enlaza `sale_item` con `purchase_item` por cantidad.
 - Totales: la vista `purchase_order_with_total` calcula el total sumando `actual_price` (si existe) o `estimated_price` por `quantity`.

## 5. Planificación de distribución
- Plan diario: `distribution_plan` (fecha y `status` operativo del plan).
 - Coordinador: `distribution_plan.coordinator_id` referencia a `coordinator` (opcional), responsable del plan.
- Órdenes en el plan: `distribution_plan_order` (lista con `sequence` y estado).
- Estados de `distribution_plan_order`: `pending`, `out_for_delivery`, `delivered`, `failed`, `cancelled`.

## 6. Estado efectivo para UI
- Vista: `sale_order_with_total_and_status` deriva `effective_status` usando el último `distribution_plan_order` del pedido.
- Mapeo:
  - `so.status = 'cancelled'` → `effective_status = 'cancelled'`.
  - Sin `distribution_plan_order` → `effective_status = so.status`.
  - `pending` o `failed` → `effective_status = 'processing'`.
  - `out_for_delivery` → `effective_status = 'out_for_delivery'`.
  - `delivered` → `effective_status = 'delivered'`.
  - `cancelled` en el plan → si `so.status = 'cancelled'` mantiene cancelado; si no, `processing`.

## 7. Entrega y cierre
- Avance de entrega: se actualiza `distribution_plan_order.status` y `delivered_at`.
 - Reportes y consulta: usar las vistas para totales y estado efectivo (`sale_order_with_total`, `sale_order_with_total_and_status`, `purchase_order_with_total`).

Notas:
- `sale_order.status` resume el pedido; `effective_status` refleja la operación diaria.
- Códigos humanos (`order_code`, `purchase_code`, `plan_code`) se generan con secuencias y triggers.