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

export type PlanKey = 'STARTER' | 'PRO' | 'BUSINESS';

export interface PlanDefinition {
  key: PlanKey;
  name: string;
  price: number;
  maxInvoicesPerMonth: number;
  maxEmailAccounts: number;
  features: string[];
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  STARTER: {
    key: 'STARTER',
    name: 'Básico',
    price: 69000,
    maxInvoicesPerMonth: 50,
    maxEmailAccounts: 1,
    features: [
      '50 facturas por mes',
      'Extracción de datos con IA',
      'Conexión de 1 correo (Gmail / Outlook)',
      'Backup en Google Drive / OneDrive',
      'Alertas de vencimiento',
      'Dashboard completo y análisis',
      'Soporte',
    ],
  },
  PRO: {
    key: 'PRO',
    name: 'Profesional',
    price: 119000,
    maxInvoicesPerMonth: 200,
    maxEmailAccounts: 2,
    features: [
      '200 facturas por mes',
      'Extracción de datos con IA',
      'Conexión de 2 correos (Gmail / Outlook)',
      'Backup en Google Drive / OneDrive',
      'Alertas de vencimiento',
      'Dashboard completo y análisis',
      'Soporte',
    ],
  },
  BUSINESS: {
    key: 'BUSINESS',
    name: 'Empresarial',
    price: 265000,
    maxInvoicesPerMonth: 500,
    maxEmailAccounts: 3,
    features: [
      '500 facturas por mes',
      'Extracción de datos con IA',
      'Conexión de 3 correos (Gmail / Outlook)',
      'Backup en Google Drive / OneDrive',
      'Alertas de vencimiento',
      'Dashboard completo y análisis',
      'Soporte',
    ],
  },
};

export const PLAN_KEYS: PlanKey[] = ['STARTER', 'PRO', 'BUSINESS'];

export const DEFAULT_PLAN: PlanKey = 'STARTER';

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === 'string' && PLAN_KEYS.includes(value as PlanKey);
}

export function getPlanDefinition(plan?: string | null): PlanDefinition {
  return isPlanKey(plan) ? PLANS[plan] : PLANS[DEFAULT_PLAN];
}

// Kept for backwards compatibility with existing trial UI references.
export const TRIAL_MAX_INVOICES = PLANS.STARTER.maxInvoicesPerMonth;
