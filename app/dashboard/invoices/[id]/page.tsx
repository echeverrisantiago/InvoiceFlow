import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { Button } from '@/components/ui/button';
import { InvoiceDetailForm } from './invoice-detail-form';

async function getInvoice(invoiceId: string, organizationId: string) {
  return prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      organizationId,
    },
    include: {
      uploadedBy: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const { id } = await params;
  const invoice = await getInvoice(id, context.organization.id);

  if (!invoice) {
    redirect('/dashboard/invoices');
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/dashboard/invoices">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a facturas
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Detalle de factura</h1>
        <p className="text-muted-foreground">
          Revisa, corrige y complementa la información extraída por la IA.
        </p>
      </div>

      <InvoiceDetailForm invoice={invoice} />
    </div>
  );
}