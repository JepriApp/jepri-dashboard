#!/usr/bin/env node
// Paso 1 de la agrupación canónica de catálogo (§5.1, Tarea 22): exporta todo
// `product` a un CSV para que un LLM (en esta sesión, sin necesitar una API key
// nueva) proponga qué filas son la misma referencia en distinta unidad/empaque.
// Nunca corre como parte de una request del bot — es un script puntual, a mano.
//
// Uso: node scripts/export_products_for_canonical_grouping.mjs
// Salida: scripts/output/products_export.csv (no versionado, ver .gitignore)

import { mkdirSync, writeFileSync } from "node:fs";
import { Client } from "pg";

process.loadEnvFile(".env.local");

const connectionString = process.env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error("STAGING_DATABASE_URL no está seteada — revisa .env.local.");
  process.exit(1);
}

function csvEscape(value) {
  const text = value ?? "";
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const client = new Client({ connectionString });
await client.connect();

let rows;
try {
  const result = await client.query(
    "select id, name, description, unit, reference_price from product order by name",
  );
  rows = result.rows;
} finally {
  await client.end();
}

const header = "product_id,name,description,unit,reference_price";
const lines = rows.map((r) =>
  [r.id, r.name, r.description, r.unit, r.reference_price].map(csvEscape).join(","),
);

mkdirSync("scripts/output", { recursive: true });
writeFileSync("scripts/output/products_export.csv", [header, ...lines].join("\n") + "\n");

console.log(`Exportados ${rows.length} productos a scripts/output/products_export.csv`);
