// Carga .env.local (igual que Next.js hace por su cuenta) para que los tests que
// necesiten credenciales reales (p. ej. contra el self-hosted de staging) las tengan
// disponibles en process.env — Vitest no hace esto automáticamente.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local no existe en este entorno (p. ej. CI) — los tests que lo necesiten
  // deben fallar de forma clara en vez de usar valores silenciosamente vacíos.
}
