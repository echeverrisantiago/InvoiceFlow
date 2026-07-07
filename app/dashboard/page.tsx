import { Suspense } from 'react';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, invoiceStatusLabels } from '@/lib/utils';
import { FileText, TrendingUp, Users, AlertCircle } from 'lucide-react';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

async function getDashboardData(organizationId: string) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get invoices count and total for this month
  const [totalInvoices, monthlyInvoices, totalAmount, upcomingDue] =
    await Promise.all([
      prisma.invoice.count({
        where: {
          organizationId,
          status: { notIn: ['FAILED'] },
        },
      }),
      prisma.invoice.count({
        where: {
          organizationId,
          createdAt: { gte: startOfMonth },
          status: { notIn: ['FAILED'] },
        },
      }),
      prisma.invoice.aggregate({
        where: {
          organizationId,
          createdAt: { gte: startOfMonth },
          status: { notIn: ['FAILED'] },
        },
        _sum: {
          total: true,
        },
      }),
      prisma.invoice.count({
        where: {
          organizationId,
          dueDate: {
            gte: now,
            lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
          },
          paymentStatus: 'PENDING',
          status: { notIn: ['FAILED', 'PROCESSING'] },
        },
      }),
    ]);

  // Top suppliers this month
  const topSuppliers = await prisma.invoice.groupBy({
    by: ['supplier'],
    where: {
      organizationId,
      createdAt: { gte: startOfMonth },
      supplier: { not: null },
      status: { notIn: ['FAILED'] },
    },
    _sum: {
      total: true,
    },
    _count: {
      id: true,
    },
    orderBy: {
      _sum: {
        total: 'desc',
      },
    },
    take: 5,
  });

  // Recent invoices
  const recentInvoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: { notIn: ['FAILED', 'PROCESSING'] },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 5,
    select: {
      id: true,
      supplier: true,
      total: true,
      issueDate: true,
      status: true,
      paymentStatus: true,
    },
  });

  return {
    totalInvoices,
    monthlyInvoices,
    totalAmount: totalAmount._sum.total || 0,
    upcomingDue,
    topSuppliers,
    recentInvoices,
  };
}

export default async function DashboardPage() {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const data = await getDashboardData(context.organization.id);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bienvenido a {context.organization.name}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Facturas Este Mes
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.monthlyInvoices}</div>
            <p className="text-xs text-muted-foreground">
              {data.totalInvoices} en total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mes</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.totalAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              Facturas procesadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Proveedores Activos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.topSuppliers.length}</div>
            <p className="text-xs text-muted-foreground">Este mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Próximas a Vencer
            </CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.upcomingDue}</div>
            <p className="text-xs text-muted-foreground">Próximos 7 días</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Suppliers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Proveedores del Mes</CardTitle>
        </CardHeader>
        <CardContent>
          {data.topSuppliers.length > 0 ? (
            <div className="space-y-4">
              {data.topSuppliers.map((supplier, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{supplier.supplier}</p>
                    <p className="text-sm text-muted-foreground">
                      {supplier._count.id} factura
                      {supplier._count.id !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <p className="font-semibold">
                    {formatCurrency(supplier._sum.total || 0)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No hay datos de proveedores este mes
            </p>
          )}
        </CardContent>
      </Card>

      {/* Recent Invoices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Facturas Recientes</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/invoices">Ver Todas</Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data.recentInvoices.length > 0 ? (
            <div className="space-y-4">
              {data.recentInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{invoice.supplier || 'Sin proveedor'}</p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.issueDate
                        ? new Date(invoice.issueDate).toLocaleDateString('es-CO')
                        : 'Sin fecha'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {formatCurrency(invoice.total || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {invoice.status === 'PROCESSING' || invoice.status === 'FAILED'
                        ? invoiceStatusLabels[invoice.status]
                        : invoiceStatusLabels[invoice.paymentStatus]}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-4">
                No hay facturas aún
              </p>
              <Button asChild>
                <Link href="/dashboard/invoices/upload">
                  Subir Primera Factura
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
