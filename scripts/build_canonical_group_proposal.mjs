#!/usr/bin/env node
// Paso 2 de la agrupación canónica (§5.1, Tarea 22): combina el export de productos
// con el mapeo propuesto (product_id -> nombre de grupo) en un solo CSV fácil de
// revisar/editar en Excel antes de aplicarlo. Dejar canonical_group_name vacío en
// una fila dice "no agrupar este producto".
//
// Uso: node scripts/build_canonical_group_proposal.mjs
// Entrada: scripts/output/products_export.csv (export_products_for_canonical_grouping.mjs)
// Salida: scripts/output/product_canonical_groups_proposal.csv

import { readFileSync, writeFileSync } from "node:fs";
import { mapping } from "./output/canonical_group_mapping.mjs";

function parseCsvLine(line) {
  // Separador simple por coma — el export no trae comillas en los campos que importan
  // acá (name/unit), así que basta con split; si description trajera una coma quedaría
  // mal solo esa columna, que no se usa en la propuesta.
  return line.split(",");
}

const exportCsv = readFileSync("scripts/output/products_export.csv", "utf8").trim().split("\n");
const [, ...rows] = exportCsv; // descarta el header

const header = "product_id,name,unit,canonical_group_name";
const lines = rows.map((line) => {
  const [productId, name, , unit] = parseCsvLine(line);
  const canonicalGroupName = mapping[productId] ?? "";
  return [productId, name, unit, canonicalGroupName].join(",");
});

writeFileSync("scripts/output/product_canonical_groups_proposal.csv", [header, ...lines].join("\n") + "\n");

const grouped = lines.filter((l) => l.split(",").pop() !== "").length;
console.log(
  `Propuesta escrita en scripts/output/product_canonical_groups_proposal.csv — ${grouped}/${lines.length} productos con un grupo propuesto, el resto queda sin agrupar (revisar/editar antes de aplicar).`,
);
