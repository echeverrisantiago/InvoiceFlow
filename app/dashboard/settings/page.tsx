import { getTenantContext, isAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Cloud, Mail } from 'lucide-react';
import { EmailAccountsForm } from '@/components/email-accounts-form';
import { OrganizationNitForm } from '@/components/organization-nit-form';
import { getPlanDefinition } from '@/types';
import Link from 'next/link';

async function getSettings(organizationId: string) {
  const [organization, subscription, emailAccounts] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        nit: true,
      },
    }),
    prisma.subscription.findUnique({
      where: { organizationId },
    }),
    prisma.emailAccount.findMany({
      where: { organizationId },
      select: { id: true, provider: true, email: true },
    }),
  ]);

  const gmailAccount = emailAccounts.find(a => a.provider === 'GMAIL');
  const outlookAccount = emailAccounts.find(a => a.provider === 'OUTLOOK');

  return {
    organization,
    subscription,
    plan: getPlanDefinition(subscription?.plan),
    emailAccounts,
    hasGmail: emailAccounts.some(a => a.provider === 'GMAIL'),
    hasOutlook: emailAccounts.some(a => a.provider === 'OUTLOOK'),
    activeProvider: gmailAccount ? 'gmail' : outlookAccount ? 'outlook' : null,
    activeEmail: gmailAccount?.email || outlookAccount?.email || null,
  };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const context = await getTenantContext();

  if (!context) {
    redirect('/login');
  }

  const { organization, subscription, plan, hasGmail, hasOutlook, activeProvider } = await getSettings(
    context.organization.id
  );
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {sp.success === 'email_connected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {sp.provider === 'gmail' ? 'Gmail' : 'Outlook'} conectado correctamente.
        </div>
      )}
      {sp.success === 'email_disconnected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Conexión de email desconectada correctamente.
        </div>
      )}
      {sp.error === 'email_auth_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al conectar el correo: {sp.message || 'Error desconocido'}
        </div>
      )}
      {sp.error === 'email_disconnect_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al desconectar el correo: {sp.message || 'Error desconocido'}
        </div>
      )}
      {sp.error === 'email_limit_reached' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Alcanzaste el límite de correos de tu plan
          {sp.limit ? ` (${sp.limit})` : ''}. Elimina una cuenta o mejora tu
          plan para conectar más.
        </div>
      )}

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
          </div>
        </CardContent>
      </Card>

      {/* NIT (filtro de facturas emitidas) */}
      <Card>
        <CardHeader>
          <CardTitle>Datos de facturación</CardTitle>
          <CardDescription>
            El NIT permite distinguir las facturas que recibes de las que emites.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!organization?.nit && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Configura el NIT de tu empresa para que las facturas electrónicas que
              emites no se registren como cuentas por pagar.
            </div>
          )}
          <OrganizationNitForm
            initialNit={organization?.nit ?? null}
            isAdmin={isAdmin(context)}
          />
        </CardContent>
      </Card>

      {/* Email accounts card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {hasGmail && <Mail className="h-5 w-5 text-red-600" />}
            {!hasGmail && hasOutlook && <Mail className="h-5 w-5 text-blue-600" />}
            {!hasGmail && !hasOutlook && <Cloud className="h-5 w-5 text-muted-foreground" />}
            <div>
              <CardTitle>Correos</CardTitle>
              <CardDescription>
                {activeProvider
                  ? `Sincroniza hasta ${plan.maxEmailAccounts} correo(s) e importa tus facturas automáticamente`
                  : 'Conecta un proveedor para importar tus facturas automáticamente'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Connected accounts + actions (client) */}
          <div className="rounded-lg border p-4">
            <EmailAccountsForm
              isAdmin={isAdmin(context)}
              maxAccounts={plan.maxEmailAccounts}
            />
          </div>
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
                  Plan {plan.name}
                  <span className="text-base font-medium text-muted-foreground">
                    {' '}
                    · {subscription.interval === 'YEARLY' ? 'Anual' : 'Mensual'}
                  </span>
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
