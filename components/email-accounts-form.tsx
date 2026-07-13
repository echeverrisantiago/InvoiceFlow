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
  Plus,
  Trash2,
  Wifi,
  Mail,
  Server,
  Shield,
} from 'lucide-react';

interface EmailAccount {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapUsername: string;
  useTls: boolean;
  isActive: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function EmailAccountsForm({ isAdmin }: { isAdmin: boolean }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

      setSuccess('Cuenta creada exitosamente');
      setShowForm(false);
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

        {accounts.length === 0 && !showForm && (
          <div className="text-center py-6">
            <Mail className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              No hay cuentas de email configuradas
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Conecta tu bandeja de entrada para recibir facturas automáticamente
            </p>
          </div>
        )}

        {accounts.map((account) => (
          <div
            key={account.id}
            className="rounded-lg border p-4 space-y-3"
          >
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
                  ? `Última revisión: ${new Date(
                      account.lastCheckedAt
                    ).toLocaleString('es-CO')}`
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

        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4">
            <h4 className="font-medium text-sm">Nueva Cuenta de Email</h4>

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
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          isAdmin && (
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Cuenta de Email
            </Button>
          )
        )}

        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-400">
          <p className="font-medium mb-1">¿Cómo funciona?</p>
          <p>
            InvoiceFlow revisará automáticamente tu bandeja de entrada cada 5
            minutos en busca de facturas adjuntas (PDF o imágenes). Las facturas
            encontradas se procesarán y agregarán a tu lista automáticamente.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
