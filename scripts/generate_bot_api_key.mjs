#!/usr/bin/env node
// Genera una API key nueva para un adaptador de canal fuera de proceso (§4.1, Tarea 21)
// — ej. un gateway de WhatsApp self-hosted que no vive en este despliegue. Se muestra
// en texto plano UNA SOLA VEZ acá; solo su hash sha256 (el mismo algoritmo que usa
// lib/bot/services/auth.ts para validarla) queda guardado en bot_api_key.
//
// Uso: node scripts/generate_bot_api_key.mjs <nombre-del-adaptador>
//   ej: node scripts/generate_bot_api_key.mjs whatsapp-adapter

import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

process.loadEnvFile(".env.local");

const name = process.argv[2];
if (!name) {
  console.error("Uso: node scripts/generate_bot_api_key.mjs <nombre-del-adaptador>");
  process.exit(1);
}

const connectionString = process.env.STAGING_DATABASE_URL;
if (!connectionString) {
  console.error("STAGING_DATABASE_URL no está seteada — revisa .env.local.");
  process.exit(1);
}

const rawKey = randomBytes(32).toString("hex");
const keyHash = createHash("sha256").update(rawKey).digest("hex");

const client = new Client({ connectionString });
await client.connect();
try {
  await client.query("insert into bot_api_key (name, key_hash) values ($1, $2)", [name, keyHash]);
} finally {
  await client.end();
}

console.log(`API key generada para "${name}":\n`);
console.log(rawKey);
console.log("\nGuárdala ahora en el .env del propio adaptador (Authorization: Bearer <key>) — no se puede volver a mostrar. Solo su hash quedó en bot_api_key.");
