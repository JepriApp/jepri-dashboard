# Cuestionario de validación del modelo y esquema (MVP)

Este formulario está pensado para validar el modelo de negocio y el esquema actual definidos en `scripts/supabase_sql.sql`. Completa las respuestas y marca las decisiones clave para cerrar criterios del MVP.

## Instrucciones
- Responde cada pregunta con una breve justificación.
- Marca las decisiones clave al final.
- Si surge una necesidad de cambio de esquema, anótala en "Notas finales".

## Cardinalidades y Relaciones
- ¿Una `sale_order` debe pertenecer exactamente a un solo `distribution_plan` en todo momento? ¿Puede replanificarse a otro plan o debe estar bloqueada una vez incluida?
  - Respuesta: una `sale_order` debe pertenecer exactamente a un solo `distribution_plan` en todo momento. No se permitirá replanificar una `sale_order` a otro `distribution_plan` una vez incluida en uno. En caso que un cliente cancele el pedido, simplemente se marcará como cancelado pero no se desvinculará.
- ¿Puede existir una `sale_order` sin plan (pendiente en cola), o siempre entra a un plan?
  - Respuesta: Si. Es lo que sucede cuando un cliente crea una orden, no esta vinculada aun a un plan.
- ¿Cada `purchase_order` está siempre motivada por un `distribution_plan` (compras de día/operación), o también habrá compras de reposición sin plan?
  - Respuesta: Si. Cada `purchase_order` está siempre motivada por un `distribution_plan`. No existe reposición ni stock ni inventario en este modelo de negocio. Todo lo que se compra, se envia.
- Confirmación: ¿`purchase_order.distribution_plan_id` debe ser obligatorio (`NOT NULL`) en el MVP?
  - Respuesta: Si

## Órdenes de Compra (PO)
- Reutilización de PO: ¿se debe reutilizar una PO por proveedor dentro del mismo plan mientras esté en estado `created`?
  - Respuesta: Si, eso significa que aun esta siendo planeada. Habrán casos en los que entre los items haya entradas con el mismo producto y cantidad, esto no es un error. Se hace asi para indicar al supplier como debe empacar los productos, osea la presentación. Pues en el abasto no se reempaca lo que se recibe.
- ¿Cuándo deja de ser reutilizable una PO (al cambiar a `accepted`/`delivered`)? Si hay nuevas asignaciones, ¿se crea una nueva?
  - Respuesta: Si se necesita cambiar una órden a última hora, se permitirá siempre y cuando no haya sido recibida (osea delivered). Pero hay que tener cuidado porque una cosa es que un administrador cambie una orden de compra por errores humanos a ultima hora, y otra es que al momento de recibir el pedido la cantidad sea diferente de la ordenada. Para el último caso existe el received_quatity en el purchase_item.
- `expected_delivery_date` de la PO: ¿debe almacenarse en la PO o derivarse del `distribution_plan.plan_date` (con o sin offset)? Para MVP, ¿guardamos la fecha o preferimos derivarla en vistas?
  - Respuesta: Debe derivarse del plan de distribución. El campo incluso sobra porque se busca que siempre esté sincronizado.

## Cumplimiento (Fulfillment)
- Un `sale_item` se puede cumplir con varios `purchase_item` y viceversa. ¿Permitimos múltiples vínculos por pareja en distintos momentos, o un vínculo único por pareja con cantidad acumulada es suficiente para MVP?
  - Respuesta: No entiendo a que te refieres con momentos. pregúntamelo de nuevo.
- ¿Necesitamos registrar eventos de entrega parciales o secuencias de recepción (timestamps por cumplimiento), o basta con `received_quantity` y `received_at` en `purchase_item`?
  - Respuesta: No, no necesitamos registrar eventos de entrega parciales. Solo necesitamos `received_quantity` y `received_at` en `purchase_item` para saber cuánto se ha recibido y cuándo.
- ¿La cantidad de `fulfillment` se deduce siempre de la cantidad asignada en el Drawer, o habrá ajustes manuales posteriores?
  - Respuesta: No, la cantidad de `fulfillment` se deduce siempre de la cantidad asignada en el Drawer. No hay ajustes manuales posteriores.

## Estados y Flujo Operativo
- ¿Cuándo cambia `distribution_plan.status` entre `planned` → `preparing` → `in_progress` → `completed`? ¿Quién dispara estos cambios?
  - Respuesta: el primer cambio a preparing se da cuando se asigna la primera sale_order al plan. el cambio a in_progress se hace cuando se recibe el primer purchase_item en cualquier purchase_order relacionada. El cambio a completed es cuando todas las distribution_plan_order han llegado a un estado final.
- ¿La vista `sale_order_with_total_and_status` que calcula `effective_status` desde `distribution_plan_order` refleja correctamente el estado que se desea mostrar al operador?
  - Respuesta: Si. Tambieb se usa para mostrar al cliente el estado de la entrega de su pedido.
- ¿Los estados de `purchase_order` (`created`, `accepted`, `delivered`, `cancelled`, `rejected`) tienen transiciones definidas? ¿Quién las opera (operador vs proveedor)?
  - Respuesta: Operador.

## catálogos y Precios
- `offer` usa `UNIQUE(product_id, supplier_id)` y un `price` activo por proveedor. ¿Necesitamos histórico/versionado de precios o el último precio disponible basta para MVP?
  - Respuesta: No. El último precio disponible es suficiente.
- `sale_item.unit_price`: ¿siempre viene del `product.reference_price` del momento, o se puede negociar por cliente?
  - Respuesta: El precio viene del reference_price. No es el precio real del producto, pues estos fluctuan dia a dia. El cliente paga despues de entregado el producto y confirmado el precio. Es un riesgo conocido que ellos deciden tomar.
- En `purchase_item`: ¿usamos `estimated_price` al crear y actualizamos `actual_price` al recibir? ¿Es obligatorio capturar `actual_price` en el MVP?
  - Respuesta: los campos estimated y actual son por motivos de trazabilidad. Se crea el estimated en base al precio de referencia del producto. y el actual lo llena a mano el operador en base a la negociación hecha con el supplier al momento de recibir el producto. Siempre es obligatorio capturar el actual_price, pero este no existe al momento de la creacion del registro, pues se obtiene cuando el producto es recibido.

## Unidades y Cantidades
- Las unidades (`unit_type`: `lb`, `kg`, `atado`) ¿son uniformes entre compra y venta, o requerimos conversión (p. ej., vender en `kg` y comprar en `lb`)?
  - Respuesta: Son uniformes entre compra y venta.
- ¿Permitimos cantidades fraccionarias en todos los items (decimal)? ¿Necesitamos validación por producto (p. ej., `atado` solo entero)?
  - Respuesta: No se permiten cantidades fraccionarias en este modelo de negocio. Solo enteros.
- ¿Cómo se maneja el exceso/defecto entre lo asignado y lo disponible del pedido (ya permitimos guardar con exceso mostrando advertencia)?
  - Respuesta: Se permite asignar de mas o de menos. Al cliente se le cobra lo que se le entrega, sea mas o menos.

## Integridad y Borrado
- Confirmación de borrado: `distribution_plan_order` y `sale_item` tienen `ON DELETE CASCADE`. ¿Está bien que al borrar una `sale_order` se eliminen sus items y vínculos del plan?
  - Respuesta: Se debería usar un soft delete para esos casos pero eso no entra en el alcance del MVP, entonces SI, esta bien borrarlos en cascada para mantener la integridad referencial.
- `purchase_order.distribution_plan_id` usa `ON DELETE RESTRICT`: ¿deseado para evitar borrar planes con compras asociadas?
  - Respuesta: No entiendo las consecuencias de esto, preguntame de nuevo.
- ¿Debemos proteger contra borrar `supplier` si hay POs o PIs ligados (actualmente FK sin `RESTRICT`)?
  - Respuesta: SI

## Códigos y Secuencias
- ¿Los códigos humanos (`order_code`, `plan_code`, `purchase_seq`) deben ser únicos y secuenciales globales como ahora? ¿Se reinician en ambientes de dev sin problema?
  - Respuesta: Si y si.
- ¿Mostrar `plan_code` y `purchase_code` en la UI como identificadores primarios legibles?
  - Respuesta: Si

## Consultas y Vistas
- ¿Necesitas una vista que combine PO con datos del plan (p. ej., `plan_date`, `plan_code`, total de PO) para reportes del día?
  - Respuesta: Si, estos son útiles para mostrar a los suppliers
- ¿Los listados del admin deben filtrar por plan actual (día) o mostrar históricos?
  - Respuesta: No entiendo a que entidad te refieres. preguntame de nuevo

## Roles y Seguridad
- ¿Qué rol crea/edita `distribution_plan` (coordinador vs admin)? ¿Quién aprueba `purchase_order`?
  - Respuesta: los planes los crea un admin. las órdenes de compra las recibe un coordinador/operador. El coordinador/operador aprueba la orden de compra y la envía al supplier.
- ¿Proveedores tendrán acceso a ver sus POs y confirmar/adjuntar recibos (futuro), o por ahora todo lo hace el operador?
  - Respuesta: Los proveedores podran ver sus PO asignadas cuando se publiquen, y las podran aceptar. Tambien podrán ver el historico de sus PO.

## Notas finales
Agrega un estado de "published" en las PO para poder controlar cuando son visibles a los suppliers.
Analiza las respuesta y dime que cambios infieres debes hacer en el modelo. Yo aprobaré o desaprobaré lo que propongas.