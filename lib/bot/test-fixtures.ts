import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

/**
 * Conexión directa (rol postgres) a staging, SOLO para armar/limpiar fixtures de test
 * — la clave anon (test-helpers.ts) no puede escribir en distribution_plan/sale_order
 * directo por RLS, igual que el bot tampoco puede en producción. Nunca se usa para
 * ejercitar el código bajo prueba, solo para dejar el estado listo antes de cada test.
 */
export async function withPrivilegedClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const connectionString = process.env.STAGING_DATABASE_URL;
  if (!connectionString) {
    throw new Error("STAGING_DATABASE_URL no está seteada — revisa .env.local.");
  }

  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

type PlannedPlanRow = {
  id: string;
  plan_date: string;
  status: string;
  cutoff_at: string | null;
};

async function saveAndClearPlannedPlans(client: Client): Promise<PlannedPlanRow[]> {
  const { rows: savedPlans } = await client.query<PlannedPlanRow>(
    "select id, plan_date, status, cutoff_at from distribution_plan where status = 'planned'",
  );
  await client.query("delete from distribution_plan where status = 'planned'");
  return savedPlans;
}

async function restorePlannedPlans(client: Client, savedPlans: PlannedPlanRow[]): Promise<void> {
  await client.query("delete from distribution_plan where status = 'planned'");
  for (const plan of savedPlans) {
    await client.query(
      "insert into distribution_plan (id, plan_date, status, cutoff_at) values ($1, $2, $3, $4)",
      [plan.id, plan.plan_date, plan.status, plan.cutoff_at],
    );
  }
}

/**
 * Reemplaza temporalmente todos los distribution_plan en 'planned' por uno solo, con
 * cutoff_at abierto (ahora + 1h) salvo que se indique otro — y lo restaura todo al
 * estado original al terminar. Usar siempre con try/finally (o en beforeEach/afterEach)
 * para no dejar staging con el fixture puesto si un test falla a mitad de camino.
 */
export async function withSingleActivePlan<T>(
  fn: (planId: string) => Promise<T>,
  opts: { cutoffAt?: Date | null } = {},
): Promise<T> {
  const cutoffAt = opts.cutoffAt !== undefined ? opts.cutoffAt : new Date(Date.now() + 60 * 60 * 1000);

  return withPrivilegedClient(async (client) => {
    const savedPlans = await saveAndClearPlannedPlans(client);

    const { rows } = await client.query<{ id: string }>(
      "insert into distribution_plan (plan_date, status, cutoff_at) values (current_date + 2, 'planned', $1) returning id",
      [cutoffAt],
    );
    const planId = rows[0].id;

    try {
      return await fn(planId);
    } finally {
      // bot_cancel_order nunca borra la fila (es soft-cancel) — un sale_order creado
      // durante el test, aunque termine cancelado, sigue referenciando este plan por FK.
      await client.query("delete from sale_order where distribution_plan_id = $1", [planId]);
      await restorePlannedPlans(client, savedPlans);
    }
  });
}

/**
 * Quita temporalmente todos los distribution_plan en 'planned' (sin poner ninguno) —
 * para probar el camino "no hay ventana de pedidos activa" — y los restaura al terminar.
 */
export async function withNoActivePlan<T>(fn: () => Promise<T>): Promise<T> {
  return withPrivilegedClient(async (client) => {
    const savedPlans = await saveAndClearPlannedPlans(client);
    try {
      return await fn();
    } finally {
      await restorePlannedPlans(client, savedPlans);
    }
  });
}

/** Cambia el status de un distribution_plan (ej. a 'preparing') y lo revierte al terminar. */
export async function withPlanStatus<T>(
  planId: string,
  status: string,
  fn: () => Promise<T>,
): Promise<T> {
  return withPrivilegedClient(async (client) => {
    const { rows } = await client.query<{ status: string }>(
      "select status from distribution_plan where id = $1",
      [planId],
    );
    const originalStatus = rows[0].status;

    await client.query("update distribution_plan set status = $1 where id = $2", [status, planId]);
    try {
      return await fn();
    } finally {
      await client.query("update distribution_plan set status = $1 where id = $2", [
        originalStatus,
        planId,
      ]);
    }
  });
}

/** Borra cualquier sale_order (y sus sale_item, por ON DELETE CASCADE) que haya dejado un test. */
export async function cleanupCustomerOrders(customerId: string): Promise<void> {
  await withPrivilegedClient(async (client) => {
    await client.query(
      "delete from sale_order where created_by_customer_id = $1 or customer_id = $1",
      [customerId],
    );
  });
}

async function withTemporaryApiKey<T>(
  revoked: boolean,
  fn: (rawKey: string) => Promise<T>,
): Promise<T> {
  const rawKey = randomBytes(16).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  return withPrivilegedClient(async (client) => {
    await client.query(
      revoked
        ? "insert into bot_api_key (name, key_hash, revoked_at) values ('test-adapter', $1, now())"
        : "insert into bot_api_key (name, key_hash) values ('test-adapter', $1)",
      [keyHash],
    );
    try {
      return await fn(rawKey);
    } finally {
      await client.query("delete from bot_api_key where key_hash = $1", [keyHash]);
    }
  });
}

/** Crea una API key de prueba activa (Tarea 21), la pasa en texto plano, y la borra al terminar. */
export async function withApiKey<T>(fn: (rawKey: string) => Promise<T>): Promise<T> {
  return withTemporaryApiKey(false, fn);
}

/** Igual que `withApiKey`, pero la key ya nace revocada — para probar que eso basta para 401. */
export async function withRevokedApiKey<T>(fn: (rawKey: string) => Promise<T>): Promise<T> {
  return withTemporaryApiKey(true, fn);
}
