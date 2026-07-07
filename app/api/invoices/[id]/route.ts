import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';

function normalizeInvoiceItems(items: unknown) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item) => {
    const current = item as Record<string, unknown>;
    return {
      description: String(current.description || ''),
      quantity:
        current.quantity === '' || current.quantity === null || current.quantity === undefined
          ? null
          : Number(current.quantity),
      unitPrice:
        current.unitPrice === '' || current.unitPrice === null || current.unitPrice === undefined
          ? null
          : Number(current.unitPrice),
      total:
        current.total === '' || current.total === null || current.total === undefined
          ? null
          : Number(current.total),
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

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        supplier: body.supplier || null,
        supplierNit: body.supplierNit || null,
        issueDate: body.issueDate ? new Date(body.issueDate) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        subtotal:
          body.subtotal === '' || body.subtotal === null || body.subtotal === undefined
            ? null
            : Number(body.subtotal),
        iva:
          body.iva === '' || body.iva === null || body.iva === undefined
            ? null
            : Number(body.iva),
        total:
          body.total === '' || body.total === null || body.total === undefined
            ? null
            : Number(body.total),
        description: body.description || null,
        internalNotes: body.internalNotes || null,
        invoiceItems: normalizeInvoiceItems(body.invoiceItems),
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