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
    maxInvoicesPerMonth: 5,
    price: 29900, // COP
  },
  PRO: {
    maxInvoicesPerMonth: -1, // unlimited
    price: 99900, // COP
  },
};
