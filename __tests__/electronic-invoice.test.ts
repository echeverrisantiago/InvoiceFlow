/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import AdmZip from 'adm-zip';
import { parseDianInvoiceXml, parseInvoiceFromZip, isInvoiceIssuedByOrganization } from '@/lib/electronic-invoice';
import {
  isXmlFile,
  isZipFile,
  looksLikeDianInvoiceXml,
} from '@/lib/file-types';

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:ID>SETP990000002</cbc:ID>
  <cbc:IssueDate>2019-06-20</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>Nombre Tienda</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>DIAN</cbc:RegistrationName>
        <cbc:CompanyID schemeID="4" schemeName="31">800197268</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName>
        <cbc:Name>Mi Empresa SAS</cbc:Name>
      </cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>Mi Empresa SAS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="3" schemeName="31">900108281</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentDueDate>2019-06-30</cbc:PaymentDueDate>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="COP">2424.01</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="COP">12600.06</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="COP">2424.01</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:Percent>19.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>01</cbc:ID>
          <cbc:Name>IVA</cbc:Name>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">12600.06</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">15024.07</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">14024.07</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1.000000</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="COP">12600.06</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>AV OASYS -2.25 (8.4) LENTE DE CONTACTO</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="COP">18900.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

describe('parseDianInvoiceXml', () => {
  it('extracts supplier, NIT, dates, totals and items', () => {
    const data = parseDianInvoiceXml(SAMPLE_XML);
    expect(data).not.toBeNull();
    expect(data!.supplier).toBe('DIAN');
    expect(data!.supplierNit).toBe('800197268');
    expect(data!.issueDate).toBe('2019-06-20');
    expect(data!.dueDate).toBe('2019-06-30');
    expect(data!.subtotal).toBe(12600.06);
    expect(data!.iva).toBe(2424.01);
    expect(data!.total).toBe(14024.07);
    expect(data!.items).toHaveLength(1);
    expect(data!.items[0].description).toContain('AV OASYS');
    expect(data!.items[0].quantity).toBe(1);
    expect(data!.items[0].unitPrice).toBe(18900);
    expect(data!.items[0].total).toBe(12600.06);
    expect(data!.customerName).toBe('Mi Empresa SAS');
    expect(data!.customerNit).toBe('900108281');
  });

  it('returns null for non-invoice XML', () => {
    expect(parseDianInvoiceXml('<ApplicationResponse/>')).toBeNull();
  });
});

describe('isInvoiceIssuedByOrganization', () => {
  const received = { supplierNit: '800197268', customerNit: '900108281' };
  const issued = { supplierNit: '900108281', customerNit: '800197268' };

  it('detects invoices emitted by the organization', () => {
    expect(isInvoiceIssuedByOrganization(issued, '900108281')).toBe(true);
    // tolerates the verification digit
    expect(isInvoiceIssuedByOrganization(issued, '900108281-1')).toBe(true);
    expect(isInvoiceIssuedByOrganization(issued, '900.108.281')).toBe(true);
  });

  it('keeps invoices received by the organization', () => {
    expect(isInvoiceIssuedByOrganization(received, '900108281')).toBe(false);
  });

  it('does not filter without a configured NIT', () => {
    expect(isInvoiceIssuedByOrganization(issued, null)).toBe(false);
    expect(isInvoiceIssuedByOrganization(issued, '')).toBe(false);
  });

  it('does not filter when the NIT matches neither party', () => {
    expect(isInvoiceIssuedByOrganization(received, '111111111')).toBe(false);
  });
});

describe('parseInvoiceFromZip', () => {
  it('extracts the invoice XML and the embedded PDF', () => {
    const zip = new AdmZip();
    zip.addFile('factura.xml', Buffer.from(SAMPLE_XML, 'utf8'));
    zip.addFile('factura.pdf', Buffer.from('%PDF-1.4 fake', 'utf8'));

    const result = parseInvoiceFromZip(zip.toBuffer());
    expect(result.data?.supplier).toBe('DIAN');
    expect(result.xmlFileName).toBe('factura.xml');
    expect(result.pdf?.fileName).toBe('factura.pdf');
  });
});

describe('file type detection', () => {
  it('detects zip and xml files by name or mime', () => {
    expect(isZipFile('application/zip', 'factura.zip')).toBe(true);
    expect(isZipFile('application/octet-stream', 'factura.zip')).toBe(true);
    expect(isZipFile(undefined, 'factura.zip')).toBe(true);
    expect(isZipFile('application/octet-stream', 'factura.pdf')).toBe(false);
    expect(isXmlFile('text/xml', 'factura.xml')).toBe(true);
    expect(isXmlFile(undefined, 'factura.xml')).toBe(true);
  });

  it('recognizes DIAN invoice XML content', () => {
    expect(looksLikeDianInvoiceXml(SAMPLE_XML)).toBe(true);
    expect(looksLikeDianInvoiceXml('<fe:Invoice xmlns:fe="x"/>')).toBe(true);
    expect(looksLikeDianInvoiceXml('<AttachedDocument/>')).toBe(true);
    expect(looksLikeDianInvoiceXml('<?xml version="1.0"?><notaCredito/>')).toBe(false);
    expect(looksLikeDianInvoiceXml('<OtherDocument/>')).toBe(false);
  });
});
