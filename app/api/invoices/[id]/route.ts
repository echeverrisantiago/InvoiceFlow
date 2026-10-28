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
        subtotal: true,
        iva: true,
        status: true,
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

    const toNumber = (value: unknown): number | null => {
      if (value === '' || value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    // Prefer the totals sent by the client (the detail view already computes
    // them from the extracted values). Fall back to deriving them from the
    // line items using the invoice's effective IVA rate.
    let subtotal = toNumber(body.subtotal);
    let iva = toNumber(body.iva);
    let total = toNumber(body.total);

    if (subtotal === null || iva === null || total === null) {
      const itemBase = round2(
        invoiceItems.reduce((sum, item) => sum + (item.total ?? 0), 0)
      );
      const rate =
        invoice.subtotal && invoice.subtotal > 0
          ? (invoice.iva ?? 0) / invoice.subtotal
          : 0.19;
      subtotal = itemBase;
      iva = round2(itemBase * rate);
      total = round2(itemBase + iva);
    }

    // Si el usuario completa a mano una factura que había fallado, deja de
    // estar en error y se cancelan los reintentos pendientes.
    const manuallyCompleted =
      invoice.status === 'FAILED' && Boolean(body.supplier) && total !== null;

    await prisma.invoice.update({
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
        ...(manuallyCompleted
          ? { status: 'EXTRACTED' as const, retryCount: 0, nextRetryAt: null }
          : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Invoice update error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar factura' },
      { status: 500 }
    );
  }
}