import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import Link from 'next/link';
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
import { Upload, FileText, Eye } from 'lucide-react';

async function getInvoices(organizationId: string) {
  return await prisma.invoice.findMany({
    where: {
      organizationId,
    },
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

export default async function InvoicesPage() {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const invoices = await getInvoices(context.organization.id);

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
        <Button asChild>
          <Link href="/dashboard/invoices/upload">
            <Upload className="mr-2 h-4 w-4" />
            Subir Factura
          </Link>
        </Button>
      </div>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todas las Facturas</CardTitle>
        </CardHeader>
        <CardContent>
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
