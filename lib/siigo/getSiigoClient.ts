import { SiigoClient } from "./types";
import { createMockSiigoClient } from "./mockClient";
import { createLiveSiigoClient } from "./liveClient";

/**
 * Modo seguro por defecto: sin SIIGO_MODE=live explícito, siempre se usa el
 * cliente simulado (dry-run). Siigo no ofrece un ambiente de pruebas separado
 * de producción, así que el desarrollo/pruebas normales nunca deben tocar la
 * API real por accidente.
 */
export function getSiigoClient(): SiigoClient {
  if (process.env.SIIGO_MODE === "live") {
    return createLiveSiigoClient();
  }
  return createMockSiigoClient();
}
