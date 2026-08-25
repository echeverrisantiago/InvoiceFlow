export interface InvoiceLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  total: number | null;
}

export interface InvoiceData {
  supplier: string;
  supplierNit: string;
  issueDate: string; // ISO date string
  dueDate: string; // ISO date string
  subtotal: number;
  iva: number;
  total: number;
  description: string;
  items: InvoiceLineItem[];
}

export interface ExtractionResult {
  success: boolean;
  data?: InvoiceData;
  error?: string;
  rawResponse?: any;
}

export const PLAN_PRICE = 69000; // COP
export const PLAN_MAX_INVOICES = -1; // unlimited

export interface PlanLimits {
  STARTER: {
    maxInvoicesPerMonth: number;
    price: number;
  };
  PRO: {
    maxInvoicesPerMonth: number;
    price: number;
  };
}

export const PLAN_LIMITS: PlanLimits = {
  STARTER: {
    maxInvoicesPerMonth: PLAN_MAX_INVOICES,
    price: PLAN_PRICE,
  },
  PRO: {
    maxInvoicesPerMonth: PLAN_MAX_INVOICES,
    price: PLAN_PRICE,
  },
};
