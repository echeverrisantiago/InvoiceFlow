import { NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { invoiceStatusLabels } from '@/lib/utils';
import * as XLSX from 'xlsx';

function getDisplayLabel(status: string, paymentStatus: string): string {
  if (status === 'PROCESSING' || status === 'FAILED') {
    return invoiceStatusLabels[status as keyof typeof invoiceStatusLabels];
  }
  return invoiceStatusLabels[paymentStatus as keyof typeof invoiceStatusLabels];
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export async function GET() {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        organizationId: context.organization.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        supplier: true,
        supplierNit: true,
        issueDate: true,
        dueDate: true,
        subtotal: true,
        iva: true,
        total: true,
        description: true,
        status: true,
        paymentStatus: true,
        createdAt: true,
      },
    });

    const rows = invoices.map((inv) => ({
      Proveedor: inv.supplier || '-',
      NIT: inv.supplierNit || '-',
      'Fecha Emisión': formatDate(inv.issueDate),
      'Fecha Vencimiento': formatDate(inv.dueDate),
      Subtotal: formatCurrency(inv.subtotal),
      IVA: formatCurrency(inv.iva),
      Total: formatCurrency(inv.total),
      Descripción: inv.description || '-',
      Estado: getDisplayLabel(inv.status, inv.paymentStatus),
      'Fecha Subida': formatDate(inv.createdAt),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    const colWidths = [
      { wch: 30 },
      { wch: 18 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 40 },
      { wch: 14 },
      { wch: 16 },
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Facturas');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="facturas-${new Date().toISOString().split('T')[0]}.xlsx"`,
      },
    });
  } catch (error: any) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al exportar facturas' },
      { status: 500 }
    );
  }
}
