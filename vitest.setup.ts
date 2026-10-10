import { vi } from "vitest";

// Carga .env.local (igual que Next.js hace por su cuenta) para que los tests que
// necesiten credenciales reales (p. ej. contra el self-hosted de staging) las tengan
// disponibles en process.env — Vitest no hace esto automáticamente.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local no existe en este entorno (p. ej. CI) — los tests que lo necesiten
  // deben fallar de forma clara en vez de usar valores silenciosamente vacíos.
}

// lib/supabase/server.ts llama a cookies() de next/headers, que exige un request
// scope real de Next.js (server component/route handler) — fuera de eso, p. ej. al
// importar y llamar un route handler directo desde un test, lanza "cookies was
// called outside a request scope". Stub global sin cookies: createClient() sigue
// creando un cliente real (anon key + URL reales de .env.local → staging), solo sin
// sesión — exactamente lo que es un webhook de Telegram, que nunca trae cookies.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => {},
  }),
}));
