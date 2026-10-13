import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import type { InvoiceData, InvoiceLineItem } from '@/types';
import { isZipFile } from '@/lib/file-types';

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

const INVOICE_ROOTS = ['Invoice', 'CreditNote', 'DebitNote'];

export interface ZipParseResult {
  data?: InvoiceData;
  pdf?: { buffer: Buffer; fileName: string };
  xmlFileName?: string;
}

type XmlNode = Record<string, unknown>;

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    return textOf((value as XmlNode)['#text']);
  }
  return undefined;
}

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    const text = textOf(value);
    if (text !== undefined) return text;
  }
  return undefined;
}

function amountOf(value: unknown): number | null {
  const text = textOf(value);
  if (text === undefined) return null;
  const parsed = Number(text.replace(/\s/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function isoDateOnly(value: unknown): string | null {
  const text = textOf(value);
  if (!text) return null;
  const match = text.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function baseName(entryName: string): string {
  return entryName.split(/[\\/]/).pop() || entryName;
}

function parseXml(xml: string): XmlNode | null {
  const cleaned = xml.replace(/^\uFEFF/, '');
  if (!cleaned.trim()) return null;
  try {
    const parsed = parser.parse(cleaned) as XmlNode;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractParty(party: XmlNode | undefined): { name?: string; nit?: string } {
  const taxSchemes = toArray(party?.PartyTaxScheme) as XmlNode[];
  const legalEntities = toArray(party?.PartyLegalEntity) as XmlNode[];
  const names = toArray(party?.PartyName) as XmlNode[];

  const name =
    firstText(taxSchemes.map((s) => s?.RegistrationName)) ??
    firstText(legalEntities.map((s) => s?.RegistrationName)) ??
    firstText(names.map((n) => n?.Name));

  const nit =
    firstText(taxSchemes.map((s) => s?.CompanyID)) ??
    firstText(legalEntities.map((s) => s?.CompanyID));

  return { name, nit };
}

/**
 * Normalizes a NIT/company ID to digits only (removes spaces, dashes, etc.).
 */
export function normalizeNit(value?: string | null): string {
  return (value || '').replace(/\D/g, '');
}

/**
 * Compares two NITs, tolerating an optional trailing verification digit.
 */
export function nitsMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeNit(a);
  const right = normalizeNit(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length === right.length + 1 && left.startsWith(right)) return true;
  if (right.length === left.length + 1 && right.startsWith(left)) return true;
  return false;
}

/**
 * Returns true when the organization is the issuer (supplier) of the invoice,
 * i.e. an invoice the company emitted rather than one it must pay.
 */
export function isInvoiceIssuedByOrganization(
  data: Pick<InvoiceData, 'supplierNit' | 'customerNit'>,
  organizationNit?: string | null
): boolean {
  const org = normalizeNit(organizationNit);
  if (!org) return false;

  const isSupplier = nitsMatch(data.supplierNit, org);
  const isCustomer = nitsMatch(data.customerNit, org);
  return isSupplier && !isCustomer;
}

/**
 * Extracts the invoice data from a Colombian DIAN UBL 2.1 XML string.
 * Returns null when the XML is not a recognizable invoice document.
 */
export function parseDianInvoiceXml(xml: string): InvoiceData | null {
  const parsed = parseXml(xml);
  if (!parsed) return null;

  const rootKey = Object.keys(parsed).find((key) => INVOICE_ROOTS.includes(key));
  if (!rootKey) return null;

  const root = parsed[rootKey] as XmlNode | undefined;
  if (!root || typeof root !== 'object') return null;

  const supplierParty = (root.AccountingSupplierParty as XmlNode | undefined)
    ?.Party as XmlNode | undefined;
  const customerParty = (root.AccountingCustomerParty as XmlNode | undefined)
    ?.Party as XmlNode | undefined;

  const supplierInfo = extractParty(supplierParty);
  const customerInfo = extractParty(customerParty);

  const supplier = supplierInfo.name ?? null;
  const supplierNit = supplierInfo.nit ?? '';
  const customerName = customerInfo.name;
  const customerNit = customerInfo.nit;

  const issueDate = isoDateOnly(root.IssueDate);

  const paymentMeans = toArray(root.PaymentMeans) as XmlNode[];
  const paymentTerms = toArray(root.PaymentTerms) as XmlNode[];
  let dueDate =
    firstText(paymentMeans.map((p) => isoDateOnly(p?.PaymentDueDate))) ??
    firstText(paymentTerms.map((p) => isoDateOnly(p?.PaymentDueDate))) ??
    firstText(
      paymentTerms.map((p) => isoDateOnly((p?.SettlementPeriod as XmlNode)?.EndDate))
    ) ??
    isoDateOnly(root.DueDate);

  if (!dueDate) {
    dueDate = issueDate ? addDays(issueDate, 30) : null;
  }

  const legalTotal = (root.LegalMonetaryTotal as XmlNode) ?? {};
  const subtotal =
    amountOf(legalTotal.LineExtensionAmount) ??
    amountOf(legalTotal.TaxExclusiveAmount) ??
    0;
  const total =
    amountOf(legalTotal.PayableAmount) ??
    amountOf(legalTotal.TaxInclusiveAmount) ??
    subtotal;

  const taxTotals = toArray(root.TaxTotal) as XmlNode[];
  let iva = 0;
  let foundIva = false;
  for (const taxTotal of taxTotals) {
    for (const sub of toArray(taxTotal?.TaxSubtotal) as XmlNode[]) {
      const category = sub?.TaxCategory as XmlNode | undefined;
      const scheme = category?.TaxScheme as XmlNode | undefined;
      const schemeId = textOf(scheme?.ID);
      const schemeName = textOf(scheme?.Name);
      if (schemeId === '01' || (schemeName || '').toUpperCase() === 'IVA') {
        const amount = amountOf(sub?.TaxAmount);
        if (amount !== null) {
          iva += amount;
          foundIva = true;
        }
      }
    }
  }
  if (!foundIva) {
    for (const taxTotal of taxTotals) {
      const amount = amountOf(taxTotal?.TaxAmount);
      if (amount !== null) iva += amount;
    }
  }
  iva = round2(iva);
  if (iva === 0 && total !== null && subtotal !== null) {
    iva = round2(Math.max(0, total - subtotal));
  }

  const lines = toArray(
    root.InvoiceLine ?? root.CreditNoteLine ?? root.DebitNoteLine
  ) as XmlNode[];

  const items: InvoiceLineItem[] = lines.map((line) => {
    const item = line?.Item as XmlNode | undefined;
    const price = line?.Price as XmlNode | undefined;
    return {
      description: textOf(item?.Description) ?? textOf(item?.Name) ?? '',
      quantity: amountOf(
        line?.InvoicedQuantity ?? line?.CreditedQuantity ?? line?.DebitedQuantity
      ),
      unitPrice: amountOf(price?.PriceAmount),
      total: amountOf(line?.LineExtensionAmount),
    };
  });

  const description = items
    .map((item) => item.description)
    .filter((value) => value && value.length > 0)
    .join(', ')
    .slice(0, 500);

  if (!supplier || total === null) {
    return null;
  }

  const fallbackDate = new Date().toISOString().slice(0, 10);
  const resolvedIssueDate = issueDate ?? fallbackDate;

  return {
    supplier,
    supplierNit,
    issueDate: resolvedIssueDate,
    dueDate: dueDate ?? addDays(resolvedIssueDate, 30),
    subtotal: round2(subtotal),
    iva,
    total: round2(total),
    description,
    items,
    customerName,
    customerNit,
  };
}

function looksLikeInvoiceXml(value: string): boolean {
  return /<([A-Za-z0-9]+:)?(Invoice|CreditNote|DebitNote)[\s/>]/i.test(value);
}

function extractEmbeddedInvoiceXml(xml: string): string | null {
  const parsed = parseXml(xml);
  if (!parsed) return null;

  const attached = parsed.AttachedDocument as XmlNode | undefined;
  if (!attached) return null;

  for (const attachment of toArray(attached.Attachment) as XmlNode[]) {
    const externalReference = attachment?.ExternalReference as XmlNode | undefined;
    const description = textOf(externalReference?.Description);
    if (description && looksLikeInvoiceXml(description)) {
      return description;
    }

    const embedded = textOf(attachment?.EmbeddedDocumentBinaryObject);
    if (embedded) {
      try {
        const decoded = Buffer.from(embedded, 'base64').toString('utf8');
        if (looksLikeInvoiceXml(decoded)) return decoded;
      } catch {
        // ignore malformed base64
      }
    }
  }

  return null;
}

/**
 * Reads a DIAN electronic invoice ZIP: parses the embedded XML and, when
 * present, returns the PDF so it can be used as a fallback / preview.
 */
export function parseInvoiceFromZip(buffer: Buffer): ZipParseResult {
  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    return {};
  }

  let entries: AdmZip.IZipEntry[];
  try {
    entries = zip.getEntries();
  } catch {
    return {};
  }

  const files = entries.filter((entry) => !entry.isDirectory);

  let pdf: { buffer: Buffer; fileName: string } | undefined;
  const pdfEntry = files.find((entry) =>
    entry.entryName.toLowerCase().endsWith('.pdf')
  );
  if (pdfEntry) {
    try {
      pdf = { buffer: pdfEntry.getData(), fileName: baseName(pdfEntry.entryName) };
    } catch {
      pdf = undefined;
    }
  }

  const xmlEntries = files.filter((entry) =>
    entry.entryName.toLowerCase().endsWith('.xml')
  );

  const xmlDocuments: { content: string; fileName: string }[] = [];
  for (const entry of xmlEntries) {
    try {
      xmlDocuments.push({
        content: entry.getData().toString('utf8'),
        fileName: baseName(entry.entryName),
      });
    } catch {
      // ignore unreadable entry
    }
  }

  for (const document of xmlDocuments) {
    const data = parseDianInvoiceXml(document.content);
    if (data) {
      return { data, pdf, xmlFileName: document.fileName };
    }
  }

  // Fallback: an AttachedDocument that embeds the invoice XML.
  for (const document of xmlDocuments) {
    const embedded = extractEmbeddedInvoiceXml(document.content);
    if (!embedded) continue;
    const data = parseDianInvoiceXml(embedded);
    if (data) return { data, pdf, xmlFileName: document.fileName };
  }

  return { pdf };
}

/**
 * Given any invoice file, returns a preview-friendly version: for ZIPs it
 * extracts the embedded PDF; otherwise returns the original file untouched.
 */
export function getPreviewFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): { buffer: Buffer; mimeType: string; fileName: string } {
  if (!isZipFile(mimeType, fileName)) {
    return { buffer, mimeType, fileName };
  }

  const { pdf } = parseInvoiceFromZip(buffer);
  if (pdf) {
    return { buffer: pdf.buffer, mimeType: 'application/pdf', fileName: pdf.fileName };
  }

  return { buffer, mimeType, fileName };
}
