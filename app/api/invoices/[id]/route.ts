import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

function normalizeInvoiceItems(items: unknown) {
  if (!Array.isArray(items)) {
    return [];
  }

  const round2 = (value: number) => Math.round(value * 100) / 100;

  return items.map((item) => {
    const current = item as Record<string, unknown>;
    const quantity =
      current.quantity === '' || current.quantity === null || current.quantity === undefined
        ? null
        : Number(current.quantity);
    const unitPrice =
      current.unitPrice === '' || current.unitPrice === null || current.unitPrice === undefined
        ? null
        : Number(current.unitPrice);
    return {
      description: String(current.description || ''),
      quantity,
      unitPrice,
      total: round2((quantity ?? 0) * (unitPrice ?? 0)),
    };
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!invoice || invoice.organizationId !== context.organization.id) {
      return NextResponse.json(
        { error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    const invoiceItems = normalizeInvoiceItems(body.invoiceItems);
    const round2 = (value: number) => Math.round(value * 100) / 100;
    const total = round2(invoiceItems.reduce((sum, item) => sum + (item.total ?? 0), 0));
    const subtotal = round2(total / 1.19);
    const iva = round2(total - subtotal);

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        supplier: body.supplier || null,
        supplierNit: body.supplierNit || null,
        issueDate: body.issueDate ? new Date(body.issueDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        subtotal,
        iva,
        total,
        description: body.description || null,
        internalNotes: body.internalNotes || null,
        invoiceItems,
        paymentStatus: body.paymentStatus,
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, invoice: updatedInvoice });
  } catch (error: any) {
    console.error('Invoice update error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar factura' },
      { status: 500 }
    );
  }
}