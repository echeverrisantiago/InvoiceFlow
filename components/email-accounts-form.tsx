'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Loader2,
  Trash2,
  Wifi,
  Mail,
  Server,
  Shield,
  ChevronDown,
  ChevronRight,
  LogOut,
} from 'lucide-react';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  imapHost: string | null;
  imapPort: number | null;
  imapUsername: string | null;
  useTls: boolean;
  isActive: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  GMAIL: 'Gmail',
  OUTLOOK: 'Outlook',
  IMAP: 'IMAP Manual',
};

const PROVIDER_COLORS: Record<string, string> = {
  GMAIL: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400',
  OUTLOOK: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
  IMAP: 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-400',
};

export function EmailAccountsForm({ isAdmin }: { isAdmin: boolean }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManualForm, setShowManualForm] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: '',
    imapHost: '',
    imapPort: '993',
    imapUsername: '',
    imapPassword: '',
    useTls: true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const res = await fetch('/api/email-accounts');
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {
      console.error('Error loading email accounts');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/email-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          imapPort: parseInt(form.imapPort),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Error al crear cuenta');
        return;
      }

      setSuccess('Cuenta IMAP creada exitosamente');
      setShowManualForm(false);
      setForm({
        email: '',
        imapHost: '',
        imapPort: '993',
        imapUsername: '',
        imapPassword: '',
        useTls: true,
      });
      loadAccounts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setSaving(false);
    }
  }

  async function handleOAuthConnect(provider: string) {
    setConnecting(provider);
    setError('');

    try {
      const res = await fetch(`/api/auth/email/${provider}`);
      if (res.redirected) {
        window.location.href = res.url;
      } else {
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al conectar');
      setConnecting(null);
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/email-accounts/${id}/test`, {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        setSuccess('Conexión exitosa');
      } else {
        setError(data.error || 'Error de conexión');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setTestingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Estás seguro de eliminar esta cuenta de email?')) return;

    setDeletingId(id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`/api/email-accounts/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Error al eliminar');
        return;
      }

      setSuccess('Cuenta eliminada');
      loadAccounts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setDeletingId(null);
    }
  }

  const oauthAccounts = accounts.filter((a) => a.provider === 'GMAIL' || a.provider === 'OUTLOOK');
  const imapAccounts = accounts.filter((a) => a.provider === 'IMAP');
  const hasOAuth = oauthAccounts.length > 0;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conexión de Email</CardTitle>
          <CardDescription>
            Conecta cuentas de correo para extraer facturas automáticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexión de Email</CardTitle>
        <CardDescription>
          Conecta cuentas de correo electrónico para extraer facturas
          automáticamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-400">
            {success}
          </div>
        )}

        {/* OAuth Connection Section */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">
            Conexión rápida (OAuth)
          </h4>
          <p className="text-xs text-muted-foreground">
            Conecta tu bandeja de entrada con un solo clic. Solo puedes tener una conexión
            Gmail o Outlook activa a la vez.
          </p>

          {hasOAuth ? (
            <div className="space-y-3">
              {oauthAccounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{account.email}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PROVIDER_COLORS[account.provider] || PROVIDER_COLORS.IMAP}`}
                        >
                          {PROVIDER_LABELS[account.provider] || account.provider}
                        </span>
                        {account.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-400">
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            Inactiva
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {account.lastCheckedAt
                        ? `Última revisión: ${new Date(account.lastCheckedAt).toLocaleString('es-CO')}`
                        : 'Aún no se ha revisado'}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(account.id)}
                        disabled={testingId === account.id}
                      >
                        {testingId === account.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Wifi className="h-3 w-3 mr-1" />
                        )}
                        Probar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                        disabled={deletingId === account.id}
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 mr-1" />
                        )}
                        Eliminar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOAuthConnect(
                          account.provider === 'GMAIL' ? 'outlook' : 'gmail'
                        )}
                        disabled={connecting !== null}
                      >
                        <LogOut className="h-3 w-3 mr-1" />
                        Cambiar a {account.provider === 'GMAIL' ? 'Outlook' : 'Gmail'}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            isAdmin && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-auto py-4 px-4 justify-start gap-3 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                  onClick={() => handleOAuthConnect('gmail')}
                  disabled={connecting !== null}
                >
                  {connecting === 'gmail' ? (
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  ) : (
                    <Mail className="h-5 w-5 text-red-600 shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="font-medium">Conectar con Gmail</div>
                    <div className="text-xs text-muted-foreground">
                      Cuentas de Google
                    </div>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto py-4 px-4 justify-start gap-3 border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-950"
                  onClick={() => handleOAuthConnect('outlook')}
                  disabled={connecting !== null}
                >
                  {connecting === 'outlook' ? (
                    <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                  ) : (
                    <Mail className="h-5 w-5 text-blue-600 shrink-0" />
                  )}
                  <div className="text-left">
                    <div className="font-medium">Conectar con Outlook</div>
                    <div className="text-xs text-muted-foreground">
                      Outlook, Hotmail, Office 365
                    </div>
                  </div>
                </Button>
              </div>
            )
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">o</span>
          </div>
        </div>

        {/* Manual IMAP Accounts */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowManualForm(!showManualForm)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {showManualForm ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Conexión manual IMAP
          </button>

          {showManualForm && (
            <>
              {imapAccounts.length === 0 && (
                <div className="text-center py-4">
                  <Server className="mx-auto h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    No hay cuentas IMAP configuradas
                  </p>
                </div>
              )}

              {imapAccounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{account.email}</span>
                        {account.isActive ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-400">
                            Activa
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            Inactiva
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Server className="h-3 w-3" />
                          {account.imapHost}:{account.imapPort}
                        </span>
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {account.useTls ? 'TLS' : 'Sin TLS'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {account.lastCheckedAt
                        ? `Última revisión: ${new Date(account.lastCheckedAt).toLocaleString('es-CO')}`
                        : 'Aún no se ha revisado'}
                    </span>
                  </div>

                  {isAdmin && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTest(account.id)}
                        disabled={testingId === account.id}
                      >
                        {testingId === account.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Wifi className="h-3 w-3 mr-1" />
                        )}
                        Probar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(account.id)}
                        disabled={deletingId === account.id}
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3 mr-1" />
                        )}
                        Eliminar
                      </Button>
                    </div>
                  )}
                </div>
              ))}

              {isAdmin && (
                <div className="border rounded-lg p-4 space-y-4">
                  <h4 className="font-medium text-sm">Nueva Cuenta IMAP</h4>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Dirección de Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="correo@ejemplo.com"
                          value={form.email}
                          onChange={(e) => setForm({ ...form, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapHost">Servidor IMAP</Label>
                        <Input
                          id="imapHost"
                          placeholder="imap.ejemplo.com"
                          value={form.imapHost}
                          onChange={(e) => setForm({ ...form, imapHost: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapPort">Puerto</Label>
                        <Input
                          id="imapPort"
                          type="number"
                          placeholder="993"
                          value={form.imapPort}
                          onChange={(e) => setForm({ ...form, imapPort: e.target.value })}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapUsername">Usuario</Label>
                        <Input
                          id="imapUsername"
                          placeholder="correo@ejemplo.com"
                          value={form.imapUsername}
                          onChange={(e) =>
                            setForm({ ...form, imapUsername: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="imapPassword">Contraseña</Label>
                        <Input
                          id="imapPassword"
                          type="password"
                          placeholder="Contraseña del correo"
                          value={form.imapPassword}
                          onChange={(e) =>
                            setForm({ ...form, imapPassword: e.target.value })
                          }
                          required
                        />
                      </div>
                      <div className="space-y-2 flex items-end">
                        <label className="flex items-center gap-2 pb-2">
                          <input
                            type="checkbox"
                            checked={form.useTls}
                            onChange={(e) =>
                              setForm({ ...form, useTls: e.target.checked })
                            }
                            className="rounded border-gray-300"
                          />
                          <span className="text-sm">Usar TLS</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button type="submit" disabled={saving}>
                        {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Guardar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowManualForm(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </div>
              )}
            </>
          )}
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-400">
          <p className="font-medium mb-1">¿Cómo funciona?</p>
          <p>
            FactuMeIA revisará automáticamente tu bandeja de entrada cada 5
            minutos en busca de facturas adjuntas (PDF o imágenes). Las facturas
            encontradas se procesarán y agregarán a tu lista automáticamente.
            Recomendamos usar la conexión OAuth para Gmail o Outlook por ser más
            segura y sencilla.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
