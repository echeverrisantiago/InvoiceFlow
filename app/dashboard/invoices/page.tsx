import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  formatCurrency,
  formatShortDate,
  invoiceStatusColors,
  invoiceStatusLabels,
} from '@/lib/utils';
import { Upload, FileText, Eye, Download } from 'lucide-react';
import { InvoiceFilters } from '@/components/invoice-filters';
import type { Prisma } from '@prisma/client';

type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE';

async function getInvoices(
  organizationId: string,
  searchParams: { [key: string]: string | undefined }
) {
  const {
    supplier,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    status,
  } = searchParams;

  const where: Prisma.InvoiceWhereInput = {
    organizationId,
  };

  if (supplier) {
    where.supplier = { contains: supplier, mode: 'insensitive' };
  }

  if (dateFrom || dateTo) {
    where.issueDate = {};
    if (dateFrom) where.issueDate.gte = new Date(dateFrom);
    if (dateTo) where.issueDate.lte = new Date(dateTo);
  }

  if (amountMin || amountMax) {
    where.total = {};
    if (amountMin) where.total.gte = parseFloat(amountMin);
    if (amountMax) where.total.lte = parseFloat(amountMax);
  }

  if (status) {
    const paymentStatuses = ['PENDING', 'PAID', 'OVERDUE'];
    if (paymentStatuses.includes(status)) {
      where.paymentStatus = status as PaymentStatus;
    } else {
      where.status = status;
    }
  }

  return await prisma.invoice.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      supplier: true,
      supplierNit: true,
      issueDate: true,
      dueDate: true,
      total: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
    },
  });
}

function getDisplayStatus(invoice: {
  status: keyof typeof invoiceStatusLabels;
  paymentStatus: 'PENDING' | 'PAID' | 'OVERDUE';
}) {
  if (invoice.status === 'PROCESSING' || invoice.status === 'FAILED') {
    return invoice.status;
  }

  return invoice.paymentStatus;
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const sp = await searchParams;
  const invoices = await getInvoices(context.organization.id, sp);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturas</h1>
          <p className="text-muted-foreground">
            Gestiona todas tus facturas en un solo lugar
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/api/invoices/export" target="_blank">
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </a>
          </Button>
          <Button asChild>
            <Link href="/dashboard/invoices/upload">
              <Upload className="mr-2 h-4 w-4" />
              Subir Factura
            </Link>
          </Button>
        </div>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todas las Facturas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Suspense fallback={null}>
            <InvoiceFilters />
          </Suspense>

          {invoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>NIT</TableHead>
                  <TableHead>Fecha Emisión</TableHead>
                  <TableHead>Vencimiento</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => {
                  const displayStatus = getDisplayStatus(invoice);

                  return (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">
                      {invoice.supplier || 'Sin proveedor'}
                    </TableCell>
                    <TableCell>{invoice.supplierNit || '-'}</TableCell>
                    <TableCell>
                      {invoice.issueDate
                        ? formatShortDate(invoice.issueDate)
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {invoice.dueDate
                        ? formatShortDate(invoice.dueDate)
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {invoice.total ? formatCurrency(invoice.total) : '-'}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${invoiceStatusColors[displayStatus]}`}
                      >
                        {invoiceStatusLabels[displayStatus]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/dashboard/invoices/${invoice.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalle
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )})}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                No hay facturas aún
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Comienza subiendo tu primera factura
              </p>
              <Button asChild>
                <Link href="/dashboard/invoices/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Factura
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
