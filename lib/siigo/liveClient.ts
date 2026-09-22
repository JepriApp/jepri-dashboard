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
  stamp?: {
    status?: string;
    cufe?: string;
    errors?: { code?: string; message?: string }[];
  };
}

const parseInvoiceResponse = (
  data: SiigoInvoiceCreateResponse,
): SiigoInvoiceResult => {
  const stampErrors =
    data.stamp?.errors && data.stamp.errors.length > 0
      ? data.stamp.errors
          .map((e) => `${e.code ? `[${e.code}] ` : ""}${e.message}`)
          .join("; ")
      : undefined;
  return {
    siigoInvoiceId: data.id,
    invoiceNumber: data.name ?? (data.number ? String(data.number) : null),
    publicUrl: data.public_url ?? null,
    stampErrors,
  };
};

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
              // Redondeado a 2 decimales: sumar en JS puede dejar residuos
              // de precisión binaria (p.ej. 66040.92000000001) que Siigo
              // rechaza con "invalid_amount" por no ser un valor exacto.
              value:
                Math.round(
                  payload.items.reduce(
                    (acc, item) => acc + item.quantity * item.price,
                    0,
                  ) * 100,
                ) / 100,
              ...(payload.paymentDueDate
                ? { due_date: payload.paymentDueDate }
                : {}),
            },
          ],
          // send: true -> Siigo envía la factura a validación electrónica
          // ante la DIAN automáticamente al crearla (queda timbrada, ya no
          // se puede editar/anular). La validación es síncrona: el
          // resultado viene en este mismo response, en `stamp`.
          stamp: { send: true },
          // send: true -> Siigo envía la factura por correo al cliente
          // automáticamente una vez aprobada por la DIAN.
          mail: { send: true },
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Siigo creación de factura falló (${response.status}): ${await response.text()}`,
        );
      }
      const data: SiigoInvoiceCreateResponse = await response.json();
      // Si la DIAN rechaza el timbrado, el documento igual quedó creado en
      // Siigo (con errores) — no lanzamos excepción para no perder su id;
      // el llamador decide el estado a partir de `stampErrors`.
      return parseInvoiceResponse(data);
    },

    async resendStamp(siigoInvoiceId: string): Promise<SiigoInvoiceResult> {
      const headers = await authHeaders();
      const postResponse = await fetch(
        `${SIIGO_BASE_URL}/v1/invoices/${siigoInvoiceId}/stamp`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ mail: { send: true } }),
        },
      );
      if (!postResponse.ok) {
        throw new Error(
          `Siigo reenvío a DIAN falló (${postResponse.status}): ${await postResponse.text()}`,
        );
      }
      // El resultado del timbrado se confirma con una consulta aparte al
      // documento (la respuesta del POST no siempre trae `stamp`
      // actualizado de forma consistente).
      const getResponse = await fetch(
        `${SIIGO_BASE_URL}/v1/invoices/${siigoInvoiceId}`,
        { headers },
      );
      if (!getResponse.ok) {
        throw new Error(
          `No se pudo confirmar el estado del timbrado tras reenviar (${getResponse.status}): ${await getResponse.text()}`,
        );
      }
      const data: SiigoInvoiceCreateResponse = await getResponse.json();
      return parseInvoiceResponse(data);
    },
  };
};
