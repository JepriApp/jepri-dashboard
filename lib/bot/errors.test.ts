import { describe, expect, it } from "vitest";
import { BOT_ERROR_CODES, parsePostgresError } from "@/lib/bot/errors";

describe("parsePostgresError", () => {
  it.each(BOT_ERROR_CODES)("reconoce el código %s antes del ':'", (code) => {
    const error = parsePostgresError({ message: `${code}: algún mensaje legible` });
    expect(error.code).toBe(code);
    expect(error.message).toBe(`${code}: algún mensaje legible`);
  });

  it("devuelve UNKNOWN para un mensaje sin ninguno de los 8 códigos conocidos", () => {
    const error = parsePostgresError({
      message: 'duplicate key value violates unique constraint "foo"',
    });
    expect(error.code).toBe("UNKNOWN");
  });

  it("devuelve UNKNOWN para un código que no está en la lista (no inventa uno)", () => {
    const error = parsePostgresError({ message: "ALGO_QUE_NO_EXISTE: mensaje" });
    expect(error.code).toBe("UNKNOWN");
  });

  it("conserva el mensaje original completo para logs/auditoría", () => {
    const error = parsePostgresError({
      message: "PAST_CUTOFF: ya pasó la hora límite de hoy para hacer pedidos",
    });
    expect(error.message).toBe("PAST_CUTOFF: ya pasó la hora límite de hoy para hacer pedidos");
  });

  it("el resultado es una instancia de Error con name=BotServiceError", () => {
    const error = parsePostgresError({ message: "ORDER_NOT_FOUND: no se encontró" });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("BotServiceError");
  });
});
