import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": import.meta.dirname,
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "supabase/.temp"],
    setupFiles: ["./vitest.setup.ts"],
    // Varios tests de integración comparten el mismo distribution_plan "activo" en
    // staging (lib/bot/test-fixtures.ts borra/recrea esa fila global) — correr
    // archivos en paralelo (el default) hace que un test le pise el fixture a otro.
    // No es una carrera de CPU que valga la pena optimizar: es estado externo
    // compartido y mutable, así que se serializa.
    fileParallelism: false,
  },
});
