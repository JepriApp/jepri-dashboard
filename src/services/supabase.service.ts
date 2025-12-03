import { createClient as createSupabaseComponent } from "@/utils/supabase/component";
const supabase = createSupabaseComponent();

// Definición de tipos para mejorar la tipificación
export interface Product {
  id: string;
  name: string;
  description: string;
  unit: string;
  main_photo: string;
  reference_price: number;
}



export interface Customer {
  id: string;
  user_id: string;
  name: string;
  email?: string;
}

export interface SaleOrder {
  id: string;
  customer_id: string;
  order_date: string;
  delivery_date: string | null;
  status:
    | "pending"
    | "processing"
    | "out_for_delivery"
    | "delivered"
    | "cancelled";
  service_fee: number;
  delivery_charge: number;
  distribution_plan_code?: string;
  notes: string | null;
  order_code?: string;
  order_seq?: number;
  total?: number;
  user?: {
    name: string;
    email: string;
  };
  items?: SaleItem[];
}

export interface SaleItem {
  id: string;
  sale_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product?: Product;
}

export interface CartItem {
  id?: string;
  product_id: string;
  user_id: string; // Mantenemos user_id en la interfaz para compatibilidad con el frontend
  quantity: number;
  product?: {
    id: string;
    name: string;
    description: string;
    unit: string;
    main_photo: string;
    reference_price: number;
  };
}
export async function logIn(email: string, password: string) {
  const { error, data } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error(error);
    return null;
  }
  return data;
}
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error(error);
  }
}

// Obtener todos los productos
export async function getProducts() {
  const { data, error } = await supabase.from("product").select("*");

  if (error) {
    console.error("Error al obtener productos:", error);
    return [];
  }

  return data;
}

// Obtener usuario por email
export async function getUserByEmail(email: string) {
  const { data, error } = await supabase
    .from("auth")
    .select("*")
    .eq("email", email)
    .single();

  if (error) {
    console.error("Error al obtener usuario:", error);
    return null;
  }

  return data;
}

// Obtener perfil por id (profiles)
export async function getProfileById(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, name, created_at")
    .eq("id", userId)
    .single();

  if (error) {
    console.error("Error al obtener perfil:", error);
    return null;
  }

  return data;
}

// Obtener customer_id a partir del user_id
export async function getCustomerIdByUserId(userId: string) {
  const { data, error } = await supabase
    .from("customer")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Error al obtener customer_id:", error);
    throw new Error(
      "No se pudo obtener el ID de cliente asociado a este usuario"
    );
  }

  return data.id;
}

// Funciones para el carrito de compras

// Obtener items del carrito de un usuario
export async function getCartItems(userId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    const { data, error } = await supabase
      .from("shopping_cart")
      .select(
        `
        id,
        product_id,
        customer_id,
        quantity,
        product:product_id (
          id,
          name,
          description,
          unit,
          main_photo,
          reference_price
        )
      `
      )
      .eq("customer_id", customerId);

    if (error) {
      console.error("Error al obtener items del carrito:", error);
      throw error;
    }

    // Adaptar la respuesta al formato esperado por el frontend
    const adaptedData =
      data?.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        user_id: userId, // Mantenemos el user_id original para el frontend
        quantity: item.quantity,
        product: item.product,
      })) || [];

    return adaptedData;
  } catch (error) {
    console.error("Error en getCartItems:", error);
    throw error;
  }
}

// Añadir item al carrito
export async function addToCart(item: CartItem) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(item.user_id);

    // Verificar si el item ya existe en el carrito
    const { data: existingItem, error: checkError } = await supabase
      .from("shopping_cart")
      .select("*")
      .eq("customer_id", customerId)
      .eq("product_id", item.product_id)
      .single();

    if (checkError && checkError.code !== "PGRST116") {
      // PGRST116 es el código para "no se encontraron resultados"
      console.error("Error al verificar item en carrito:", checkError);
      throw checkError;
    }

    if (existingItem) {
      // Si el item ya existe, actualizar la cantidad
      const newQuantity = existingItem.quantity + item.quantity;
      return updateCartItemQuantity(item.user_id, item.product_id, newQuantity);
    } else {
      // Si el item no existe, insertarlo
      const { data, error } = await supabase
        .from("shopping_cart")
        .insert([
          {
            customer_id: customerId, // Usamos el customer_id obtenido
            product_id: item.product_id,
            quantity: item.quantity,
          },
        ])
        .select();

      if (error) {
        console.error("Error al añadir item al carrito:", error);
        throw error;
      }

      // Adaptar la respuesta al formato esperado por el frontend
      const adaptedData = data?.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        user_id: item.user_id, // Mantenemos el user_id original para el frontend
        quantity: item.quantity,
      }));

      return adaptedData;
    }
  } catch (error) {
    console.error("Error en addToCart:", error);
    throw error;
  }
}

// Eliminar item del carrito
export async function removeFromCart(userId: string, productId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    const { error } = await supabase
      .from("shopping_cart")
      .delete()
      .eq("customer_id", customerId)
      .eq("product_id", productId);

    if (error) {
      console.error("Error al eliminar item del carrito:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error en removeFromCart:", error);
    throw error;
  }
}

// Obtener órdenes de un cliente
export async function getClientOrders(userId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    const { data, error } = await supabase
      .from("sale_order_with_total")
      .select(
        `
        id,
        order_date,
        delivery_date,
        status,
        total,
        service_fee,
        delivery_charge,
        notes,
        sale_item:sale_item (
          id,
          product_id,
          quantity,
          unit_price,
          product:product_id (
            id,
            name,
            description,
            unit,
            main_photo,
            reference_price
          )
        )
      `
      )
      .eq("customer_id", customerId)
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Error al obtener órdenes:", error);
      throw error;
    }

    // Adaptar la respuesta para incluir los items como una propiedad
    const adaptedData =
      data?.map((order) => ({
        ...order,
        items: order.sale_item,
      })) || [];

    return adaptedData;
  } catch (error) {
    console.error("Error en getClientOrders:", error);
    throw error;
  }
}

// Obtener órdenes pendientes de un cliente
export async function getPendingOrders(userId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    const { data, error } = await supabase
      .from("sale_order_with_total")
      .select(
        `
        id,
        order_date,
        status,
        total
      `
      )
      .eq("customer_id", customerId)
      .eq("status", "pending")
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Error al obtener órdenes pendientes:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Error en getPendingOrders:", error);
    throw error;
  }
}

// Añadir items a una orden existente
export async function addItemsToExistingOrder(
  orderId: string,
  cartItems: CartItem[]
) {
  try {
    // Preparar los items para insertar
    const saleItems = cartItems.map((item) => ({
      sale_order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.product?.reference_price || 0,
    }));

    // Insertar los items
    const { data, error } = await supabase
      .from("sale_item")
      .insert(saleItems)
      .select();

    if (error) {
      console.error("Error al añadir items a la orden existente:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error en addItemsToExistingOrder:", error);
    throw error;
  }
}

// Actualizar cantidad de un item en el carrito
export async function updateCartItemQuantity(
  userId: string,
  productId: string,
  quantity: number
) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    const { data, error } = await supabase
      .from("shopping_cart")
      .update({ quantity })
      .eq("customer_id", customerId)
      .eq("product_id", productId)
      .select();

    if (error) {
      console.error("Error al actualizar cantidad en el carrito:", error);
      throw error;
    }

    // Adaptar la respuesta al formato esperado por el frontend
    const adaptedData = data?.map((item) => ({
      id: item.id,
      product_id: item.product_id,
      user_id: userId, // Mantenemos el user_id original para el frontend
      quantity: item.quantity,
    }));

    return adaptedData;
  } catch (error) {
    console.error("Error en updateCartItemQuantity:", error);
    throw error;
  }
}

// Crear una orden de venta
export async function createSaleOrder(userId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    // Obtener los items del carrito
    const cartItems = await getCartItems(userId);

    if (!cartItems.length) {
      throw new Error("El carrito está vacío");
    }

    // Calcular el subtotal para determinar la tarifa de servicio
    const subtotal = cartItems.reduce((sum, item) => {
      const product = Array.isArray(item.product)
        ? item.product[0]
        : item.product;
      return sum + (product?.reference_price || 0) * item.quantity;
    }, 0);

    // Crear la orden
    const { data: orderData, error: orderError } = await supabase
      .from("sale_order")
      .insert({
        customer_id: customerId,
        service_fee: subtotal * 0.05, // 5% de cargo por servicio
        delivery_charge: 10000, // Cargo fijo por entrega
        status: "pending",
      })
      .select()
      .single();

    if (orderError) {
      console.error("Error al crear la orden:", orderError);
      throw orderError;
    }

    return orderData;
  } catch (error) {
    console.error("Error en createSaleOrder:", error);
    throw error;
  }
}

// Crear items de venta para una orden
export async function createSaleItems(orderId: string, cartItems: CartItem[]) {
  try {
    // Preparar los items para insertar
    const saleItems = cartItems.map((item) => ({
      sale_order_id: orderId,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.product?.reference_price || 0,
    }));

    // Insertar los items
    const { data, error } = await supabase
      .from("sale_item")
      .insert(saleItems)
      .select();

    if (error) {
      console.error("Error al crear items de venta:", error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error("Error en createSaleItems:", error);
    throw error;
  }
}

// Vaciar el carrito de un usuario
export async function clearCart(userId: string) {
  try {
    // Obtener el customer_id correspondiente al user_id
    const customerId = await getCustomerIdByUserId(userId);

    // Eliminar todos los items del carrito del cliente
    const { error } = await supabase
      .from("shopping_cart")
      .delete()
      .eq("customer_id", customerId);

    if (error) {
      console.error("Error al vaciar el carrito:", error);
      throw error;
    }

    return true;
  } catch (error) {
    console.error("Error en clearCart:", error);
    throw error;
  }
}

// Obtener órdenes pendientes para el administrador
export async function getPendingOrdersForAdmin(): Promise<SaleOrder[]> {
  try {
    const { data, error } = await supabase
      .from("sale_order")
      .select(
        `
        id,
        customer_id,
        created_at,
        status,
        order_code,
        order_seq,
        service_fee,
        delivery_fee,
        notes,
        customer:customer_id (
          id,
          user_id,
          name,
          auth:user_id (
            email
          )
        ),
        sale_item:sale_item (
          id,
          product_id,
          required_quantity,
          product:product_id (
            id,
            name,
            description,
            unit,
            main_photo,
            reference_price
          )
        )
      `
      )
      .eq("distribution_plan_id", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al obtener órdenes pendientes:", error);
      throw error;
    }

    const adaptedData: SaleOrder[] =
      (data || []).map((order: any) => {
        const items = (order.sale_item || []).map((item: any) => ({
          id: item.id,
          sale_order_id: order.id,
          product_id: item.product_id,
          quantity: item.required_quantity,
          unit_price: item.product?.reference_price ?? 0,
          product: item.product,
        }));
        const itemsTotal = items.reduce(
          (sum: number, it: any) =>
            sum + (it.unit_price || 0) * (it.quantity || 0),
          0
        );
        const total =
          itemsTotal + (order.service_fee ?? 0) + (order.delivery_fee ?? 0);

        return {
          id: order.id,
          customer_id: order.customer_id,
          order_date: order.created_at,
          delivery_date: order.created_at,
          status: order.status,
          order_code: order.order_code,
          order_seq: order.order_seq,
          total,
          service_fee: order.service_fee,
          delivery_charge: order.delivery_fee,
          notes: order.notes,
          user: {
            name: order.customer?.name ?? "Sin nombre",
            email: order.customer?.auth?.email ?? "Sin email",
          },
          items,
        };
      }) || [];

    return adaptedData;
  } catch (error) {
    console.error("Error en getPendingOrdersForAdmin:", error);
    throw error;
  }
}

// Obtener todas las órdenes para el administrador
export async function getAllOrdersForAdmin(): Promise<SaleOrder[]> {
  try {
    const { data, error } = await supabase
      .from("sale_order")
      .select(
        `
        id,
        customer_id,
        created_at,
        status,
        order_code,
        order_seq,
        service_fee,
        delivery_fee,
        notes,
        customer:customer_id (
          id,
          user_id,
          name,
          auth:user_id (
            email
          )
        ),
        sale_item:sale_item (
          id,
          product_id,
          required_quantity,
          product:product_id (
            id,
            name,
            description,
            unit,
            main_photo,
            reference_price
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error al obtener todas las órdenes:", error);
      throw error;
    }

    const adaptedData: SaleOrder[] =
      (data || []).map((order: any) => {
        const items = (order.sale_item || []).map((item: any) => ({
          id: item.id,
          sale_order_id: order.id,
          product_id: item.product_id,
          quantity: item.required_quantity,
          unit_price: item.product?.reference_price ?? 0,
          product: item.product,
        }));
        const itemsTotal = items.reduce(
          (sum: number, it: any) =>
            sum + (it.unit_price || 0) * (it.quantity || 0),
          0
        );
        const total =
          itemsTotal + (order.service_fee ?? 0) + (order.delivery_fee ?? 0);

        return {
          id: order.id,
          customer_id: order.customer_id,
          order_date: order.created_at,
          delivery_date: order.created_at,
          status: order.status,
          order_code: order.order_code,
          order_seq: order.order_seq,
          total,
          service_fee: order.service_fee,
          delivery_charge: order.delivery_fee,
          notes: order.notes,
          user: {
            name: order.customer?.name ?? "Sin nombre",
            email: order.customer?.auth?.email ?? "Sin email",
          },
          items,
        };
      }) || [];

    return adaptedData;
  } catch (error) {
    console.error("Error en getAllOrdersForAdmin:", error);
    throw error;
  }
}

// =============================
// Compras y cumplimiento (PO, PI, Fulfillment)
// =============================

export async function getOrCreatePurchaseOrderForSupplier(params: {
  supplierId: string;
  distributionPlanId: string;
  notes?: string | null;
  createdBy?: string | null;
}) {
  const {
    supplierId,
    distributionPlanId,
    notes = null,
    createdBy = null,
  } = params;
  // Reutiliza la PO para el proveedor en el plan si existe (cualquier estado); si no, crea una nueva
  const { data: existing, error: findErr } = await supabase
    .from("purchase_order")
    .select("id, status")
    .eq("supplier_id", supplierId)
    .eq("distribution_plan_id", distributionPlanId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (findErr) throw findErr;
  if (existing && existing.length > 0) {
    return existing[0];
  }
  const { data: created, error: createErr } = await supabase
    .from("purchase_order")
    .insert({
      supplier_id: supplierId,
      distribution_plan_id: distributionPlanId,
      status: "created",
      notes: notes ?? undefined,
      created_by: createdBy ?? undefined,
    })
    .select()
    .single();
  if (createErr) throw createErr;
  return created;
}

export async function createPurchaseItem(params: {
  purchaseOrderId: string;
  offerId: string;
  quantity: number;
  actualPrice?: number | null;
}) {
  const { purchaseOrderId, offerId, quantity, actualPrice = null } = params;
  const { data, error } = await supabase
    .from("purchase_item")
    .insert({
      purchase_order_id: purchaseOrderId,
      offer_id: offerId,
      quantity,
      actual_price: actualPrice ?? undefined,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upsertFulfillment(params: {
  saleItemId: string;
  purchaseItemId: string;
}) {
  const { saleItemId, purchaseItemId } = params;
  // Intenta encontrar el cumplimiento existente para la pareja
  const { data: existing, error: findErr } = await supabase
    .from("fulfillment")
    .select("id")
    .eq("sale_item_id", saleItemId)
    .eq("purchase_item_id", purchaseItemId)
    .limit(1);
  if (findErr) throw findErr;
  if (existing && existing.length > 0) {
    return existing[0];
  }
  const { data: created, error: createErr } = await supabase
    .from("fulfillment")
    .insert({ sale_item_id: saleItemId, purchase_item_id: purchaseItemId })
    .select()
    .single();
  if (createErr) throw createErr;
  return created;
}
