import { getTenantContext, isAdmin } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Link as LinkIcon, LogOut, Cloud, Mail } from 'lucide-react';
import { getAuthUrl } from '@/lib/drive';
import { getOneDriveAuthUrl } from '@/lib/onedrive';
import { EmailAccountsForm } from '@/components/email-accounts-form';
import Link from 'next/link';

async function getSettings(organizationId: string) {
  const [organization, subscription, emailAccounts] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        name: true,
        driveRefreshToken: true,
        onedriveRefreshToken: true,
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

  const { organization, subscription, activeProvider, activeEmail } = await getSettings(
    context.organization.id
  );
  const driveAuthUrl = getAuthUrl();
  const oneDriveAuthUrl = getOneDriveAuthUrl();
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {sp.success === 'drive_connected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Google Drive conectado correctamente.
        </div>
      )}
      {sp.success === 'drive_disconnected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Google Drive desconectado correctamente.
        </div>
      )}
      {sp.error === 'drive_auth_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al conectar Google Drive: {sp.message || 'Error desconocido'}
        </div>
      )}
      {sp.error === 'drive_disconnect_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al desconectar Google Drive: {sp.message || 'Error desconocido'}
        </div>
      )}

      {sp.success === 'onedrive_connected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          OneDrive conectado correctamente.
        </div>
      )}
      {sp.success === 'onedrive_disconnected' && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          OneDrive desconectado correctamente.
        </div>
      )}
      {sp.error === 'onedrive_auth_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al conectar OneDrive: {sp.message || 'Error desconocido'}
        </div>
      )}
      {sp.error === 'onedrive_disconnect_failed' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Error al desconectar OneDrive: {sp.message || 'Error desconocido'}
        </div>
      )}

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

      {/* Unified Provider + Email + Storage Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {activeProvider === 'gmail' && <Mail className="h-5 w-5 text-red-600" />}
            {activeProvider === 'outlook' && <Mail className="h-5 w-5 text-blue-600" />}
            {!activeProvider && <Cloud className="h-5 w-5 text-muted-foreground" />}
            <div>
              <CardTitle>
                {activeProvider === 'gmail' && 'Google (Gmail + Drive)'}
                {activeProvider === 'outlook' && 'Microsoft (Outlook + OneDrive)'}
                {!activeProvider && 'Conectar proveedor'}
              </CardTitle>
              <CardDescription>
                {activeProvider
                  ? `Conectado como ${activeEmail}`
                  : 'Elige un proveedor para recibir facturas y guardarlas automáticamente'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {activeProvider ? (
            <>
              {/* Connected provider info + actions (client) */}
              <div className="rounded-lg border p-4">
                <EmailAccountsForm isAdmin={isAdmin(context)} />
              </div>

              {/* Storage section */}
              {activeProvider === 'gmail' && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-green-600" />
                    <p className="font-medium">Google Drive</p>
                  </div>
                  {organization?.driveRefreshToken ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">Conectado</p>
                          <p className="text-sm text-muted-foreground">
                            Las facturas se guardarán automáticamente en tu Drive
                          </p>
                        </div>
                      </div>
                      {isAdmin(context) && (
                        <form action="/api/auth/google-drive/disconnect" method="POST">
                          <Button type="submit" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                            <LogOut className="mr-2 h-4 w-4" />
                            Desconectar Google Drive
                          </Button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Conecta tu Google Drive para guardar las facturas automáticamente
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
                          Solo los administradores pueden conectar el almacenamiento
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeProvider === 'outlook' && (
                <div className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Cloud className="h-5 w-5 text-blue-600" />
                    <p className="font-medium">OneDrive</p>
                  </div>
                  {organization?.onedriveRefreshToken ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="font-medium">Conectado</p>
                          <p className="text-sm text-muted-foreground">
                            Las facturas se guardarán automáticamente en tu OneDrive
                          </p>
                        </div>
                      </div>
                      {isAdmin(context) && (
                        <form action="/api/auth/onedrive/disconnect" method="POST">
                          <Button type="submit" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
                            <LogOut className="mr-2 h-4 w-4" />
                            Desconectar OneDrive
                          </Button>
                        </form>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Conecta tu OneDrive para guardar las facturas automáticamente
                      </p>
                      {isAdmin(context) ? (
                        <Button asChild>
                          <a href={oneDriveAuthUrl}>
                            <LinkIcon className="mr-2 h-4 w-4" />
                            Conectar OneDrive
                          </a>
                        </Button>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Solo los administradores pueden conectar el almacenamiento
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <EmailAccountsForm isAdmin={isAdmin(context)} />
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
