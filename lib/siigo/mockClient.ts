import {
  SiigoClient,
  SiigoCustomerLookupResult,
  SiigoInvoicePayload,
  SiigoInvoiceResult,
} from "./types";

const getMissingIdentifications = (): Set<string> =>
  new Set(
    (process.env.SIIGO_MOCK_MISSING_IDENTIFICATIONS || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const createMockSiigoClient = (): SiigoClient => ({
  async findCustomerByIdentification(
    identification: string,
  ): Promise<SiigoCustomerLookupResult> {
    await wait(150);
    const missing = getMissingIdentifications();
    if (missing.has(identification)) {
      console.log(
        `[siigo:mock] cliente ${identification} simulado como NO encontrado`,
      );
      return { found: false };
    }
    return { found: true, siigoCustomerId: `mock-customer-${identification}` };
  },

  async createInvoice(
    payload: SiigoInvoicePayload,
  ): Promise<SiigoInvoiceResult> {
    if (payload.items.length === 0) {
      throw new Error("La factura no tiene líneas de producto.");
    }
    for (const item of payload.items) {
      if (!(item.quantity > 0) || !(item.price > 0)) {
        throw new Error(
          `Línea inválida en modo dry-run: "${item.description || item.code}" tiene cantidad o precio en $0.`,
        );
      }
    }
    await wait(300);
    const fakeId = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(
      `[siigo:mock] factura simulada creada para ${payload.customerIdentification}:`,
      JSON.stringify(payload, null, 2),
    );
    return {
      siigoInvoiceId: fakeId,
      invoiceNumber: `DRYRUN-${fakeId.slice(-6)}`,
      publicUrl: null,
    };
  },
});
