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
  items: SiigoInvoiceItem[];
  observations?: string;
}

export interface SiigoInvoiceResult {
  siigoInvoiceId: string;
  invoiceNumber: string | null;
  publicUrl: string | null;
}

export interface SiigoClient {
  findCustomerByIdentification(
    identification: string,
  ): Promise<SiigoCustomerLookupResult>;
  createInvoice(payload: SiigoInvoicePayload): Promise<SiigoInvoiceResult>;
}
