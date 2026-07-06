import { getTenantContext, isAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Link as LinkIcon } from 'lucide-react';
import { getAuthUrl } from '@/lib/drive';
import Link from 'next/link';

async function getSettings(organizationId: string) {
  const [organization, subscription] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        driveRefreshToken: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { organizationId },
    }),
  ]);

  return { organization, subscription };
}

export default async function SettingsPage() {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const { organization, subscription } = await getSettings(
    context.organization.id
  );
  const driveAuthUrl = getAuthUrl();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Administra la configuración de tu organización
        </p>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle>Información de la Organización</CardTitle>
          <CardDescription>Detalles de tu empresa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Nombre
              </p>
              <p className="text-lg font-semibold">{organization?.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tu Rol</p>
              <p className="text-lg font-semibold capitalize">
                {context.organization.role.toLowerCase()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Drive Integration */}
      <Card>
        <CardHeader>
          <CardTitle>Integración con Google Drive</CardTitle>
          <CardDescription>
            Conecta tu cuenta de Google Drive para guardar automáticamente las
            facturas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {organization?.driveRefreshToken ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium">Conectado</p>
                <p className="text-sm text-muted-foreground">
                  Las facturas se guardarán automáticamente en tu Drive
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                Conecta tu cuenta para activar el backup automático en Google
                Drive
              </p>
              {isAdmin(context) ? (
                <Button asChild>
                  <a href={driveAuthUrl}>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Conectar Google Drive
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Solo los administradores pueden conectar Google Drive
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card>
        <CardHeader>
          <CardTitle>Suscripción</CardTitle>
          <CardDescription>
            Administra tu plan y facturación
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subscription ? (
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Plan Actual
                </p>
                <p className="text-2xl font-bold">
                  {subscription.plan === 'STARTER' ? 'Starter' : 'Pro'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Estado
                </p>
                <p className="font-semibold capitalize">
                  {subscription.status.toLowerCase()}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Período Actual
                </p>
                <p className="text-sm">
                  {subscription.currentPeriodStart.toLocaleDateString('es-CO')}{' '}
                  -{' '}
                  {subscription.currentPeriodEnd.toLocaleDateString('es-CO')}
                </p>
              </div>
              {isAdmin(context) && (
                <Button asChild variant="outline">
                  <Link href="/dashboard/settings/billing">
                    Administrar Suscripción
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-4">
                No tienes una suscripción activa
              </p>
              {isAdmin(context) && (
                <Button asChild>
                  <Link href="/dashboard/settings/billing">
                    Ver Planes
                  </Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
