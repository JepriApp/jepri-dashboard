import {
  SiigoClient,
  SiigoCustomerLookupResult,
  SiigoInvoicePayload,
  SiigoInvoiceResult,
} from "./types";

// Endpoints y estructura de payload confirmados contra
// https://developers.siigo.com/docs/siigoapi/ (auth, invoice/1-create-invoice,
// customer) en 2026-09. Siigo no ofrece un ambiente sandbox separado de
// producción — por eso este cliente solo se usa cuando SIIGO_MODE=live
// (ver lib/siigo/getSiigoClient.ts, que por defecto usa el mock).

const SIIGO_BASE_URL = process.env.SIIGO_API_BASE_URL || "https://api.siigo.com";

interface SiigoAuthResponse {
  access_token: string;
  expires_in: number;
}

interface SiigoCustomerListResponse {
  results: { id: string; identification: string }[];
}

interface SiigoInvoiceCreateResponse {
  id: string;
  number?: number | string;
  name?: string;
  public_url?: string;
}

export const createLiveSiigoClient = (): SiigoClient => {
  let cachedToken: { accessToken: string; expiresAt: number } | null = null;

  const authenticate = async (): Promise<string> => {
    if (cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.accessToken;
    }
    const username = process.env.SIIGO_API_USERNAME;
    const accessKey = process.env.SIIGO_API_ACCESS_KEY;
    const partnerId = process.env.SIIGO_PARTNER_ID;
    if (!username || !accessKey || !partnerId) {
      throw new Error(
        "Faltan credenciales de Siigo (SIIGO_API_USERNAME, SIIGO_API_ACCESS_KEY, SIIGO_PARTNER_ID).",
      );
    }
    const response = await fetch(`${SIIGO_BASE_URL}/auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Partner-Id": partnerId,
      },
      body: JSON.stringify({ username, access_key: accessKey }),
    });
    if (!response.ok) {
      throw new Error(`Siigo auth falló (${response.status}): ${await response.text()}`);
    }
    const data: SiigoAuthResponse = await response.json();
    cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return cachedToken.accessToken;
  };

  const authHeaders = async () => ({
    Authorization: `Bearer ${await authenticate()}`,
    "Partner-Id": process.env.SIIGO_PARTNER_ID || "",
    "Content-Type": "application/json",
  });

  return {
    async findCustomerByIdentification(
      identification: string,
    ): Promise<SiigoCustomerLookupResult> {
      const response = await fetch(
        `${SIIGO_BASE_URL}/v1/customers?identification=${encodeURIComponent(identification)}`,
        { headers: await authHeaders() },
      );
      if (!response.ok) {
        throw new Error(
          `Siigo consulta de cliente falló (${response.status}): ${await response.text()}`,
        );
      }
      const data: SiigoCustomerListResponse = await response.json();
      const match = data.results?.[0];
      return match
        ? { found: true, siigoCustomerId: match.id }
        : { found: false };
    },

    async createInvoice(
      payload: SiigoInvoicePayload,
    ): Promise<SiigoInvoiceResult> {
      const response = await fetch(`${SIIGO_BASE_URL}/v1/invoices`, {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          document: { id: payload.documentId },
          date: payload.date,
          customer: { identification: payload.customerIdentification },
          seller: payload.sellerId,
          observations: payload.observations,
          items: payload.items.map((item) => ({
            code: item.code,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
          })),
          payments: [
            {
              id: payload.paymentId,
              value: payload.items.reduce(
                (acc, item) => acc + item.quantity * item.price,
                0,
              ),
            },
          ],
          stamp: { send: false },
          mail: { send: false },
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Siigo creación de factura falló (${response.status}): ${await response.text()}`,
        );
      }
      const data: SiigoInvoiceCreateResponse = await response.json();
      return {
        siigoInvoiceId: data.id,
        invoiceNumber: data.name ?? (data.number ? String(data.number) : null),
        publicUrl: data.public_url ?? null,
      };
    },
  };
};
