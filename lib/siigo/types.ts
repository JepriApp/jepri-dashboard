export interface SiigoCustomerLookupResult {
  found: boolean;
  siigoCustomerId?: string;
}

export interface SiigoInvoiceItem {
  code: string;
  description?: string;
  quantity: number;
  price: number;
}

export interface SiigoInvoicePayload {
  documentId: number;
  date: string;
  customerIdentification: string;
  sellerId: number;
  paymentId: number;
  /**
   * Requerida por Siigo cuando la forma de pago (paymentId) tiene
   * "vencimiento" (due_date) habilitado en Siigo Nube — p.ej. Crédito.
   * Formato yyyy-MM-dd.
   */
  paymentDueDate?: string;
  items: SiigoInvoiceItem[];
  observations?: string;
}

export interface SiigoInvoiceResult {
  siigoInvoiceId: string;
  invoiceNumber: string | null;
  publicUrl: string | null;
  /**
   * Presente cuando el documento se creó/existe en Siigo pero la DIAN
   * rechazó (o aún no acepta) el timbrado — el documento NO quedó
   * facturado de forma válida. Ausente = timbrado aceptado.
   */
  stampErrors?: string;
}

export interface SiigoClient {
  findCustomerByIdentification(
    identification: string,
  ): Promise<SiigoCustomerLookupResult>;
  createInvoice(payload: SiigoInvoicePayload): Promise<SiigoInvoiceResult>;
  /**
   * Reenvía a validación de la DIAN un documento que YA existe en Siigo
   * (no crea una factura nueva) — para el caso en que el timbrado fue
   * rechazado, se corrigió el problema directamente en Siigo, y se quiere
   * reintentar el timbrado sobre el mismo documento.
   */
  resendStamp(siigoInvoiceId: string): Promise<SiigoInvoiceResult>;
}
