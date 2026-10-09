#!/usr/bin/env node
// Paso 3 de la agrupación canónica (§5.1, Tarea 22): aplica el CSV ya revisado por un
// humano — crea una fila en product_canonical_group por cada nombre de grupo distinto
// (reutilizando la existente si ya se corrió antes, para poder re-correr sin
// duplicar) y actualiza product.canonical_group_id para cada producto listado. Una
// fila con canonical_group_name vacío se ignora (ese producto queda sin agrupar).
//
// Nunca corre como parte de una request del bot — es un script puntual, a mano, una
// sola transacción.
//
// Uso: node scripts/apply_product_canonical_groups.mjs [ruta-al-csv]
//   default: scripts/output/product_canonical_groups_proposal.csv

import { readFileSync } from "node:fs";
import { Client } from "pg";

process.loadEnvFile(".env.local");

const csvPath = process.argv[2] ?? "scripts/output/product_canonical_groups_proposal.csv";

const connectionString = process.env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error("STAGING_DATABASE_URL no está seteada — revisa .env.local.");
  process.exit(1);
}

const [, ...rows] = readFileSync(csvPath, "utf8").trim().split("\n");
const entries = rows
  .map((line) => {
    const [productId, name, unit, canonicalGroupName] = line.split(",");
    return { productId, name, unit, canonicalGroupName: (canonicalGroupName ?? "").trim() };
  })
  .filter((e) => e.canonicalGroupName !== "");

if (entries.length === 0) {
  console.log("Ninguna fila del CSV tiene canonical_group_name — nada que aplicar.");
  process.exit(0);
}

const groupNames = [...new Set(entries.map((e) => e.canonicalGroupName))];

const client = new Client({ connectionString });
await client.connect();

let groupsCreated = 0;
let groupsReused = 0;
let productsUpdated = 0;

try {
  await client.query("begin");

  const groupIdByName = new Map();
  for (const name of groupNames) {
    const { rows: existing } = await client.query(
      "select id from product_canonical_group where name = $1",
      [name],
    );
    if (existing.length > 0) {
      groupIdByName.set(name, existing[0].id);
      groupsReused++;
    } else {
      const { rows: inserted } = await client.query(
        "insert into product_canonical_group (name) values ($1) returning id",
        [name],
      );
      groupIdByName.set(name, inserted[0].id);
      groupsCreated++;
    }
  }

  for (const entry of entries) {
    const groupId = groupIdByName.get(entry.canonicalGroupName);
    const result = await client.query(
      "update product set canonical_group_id = $1 where id = $2",
      [groupId, entry.productId],
    );
    productsUpdated += result.rowCount;
  }

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log(
  `Listo: ${groupsCreated} grupo(s) nuevo(s), ${groupsReused} reutilizado(s), ${productsUpdated} producto(s) actualizados.`,
);
