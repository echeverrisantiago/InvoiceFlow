'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Trash2,
  Mail,
  LogOut,
} from 'lucide-react';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROVIDER_META: Record<string, { label: string; color: string; iconColor: string }> = {
  GMAIL: {
    label: 'Gmail',
    color: 'text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-400',
    iconColor: 'text-red-600',
  },
  OUTLOOK: {
    label: 'Outlook',
    color: 'text-blue-600 bg-blue-50 dark:bg-blue-950 dark:text-blue-400',
    iconColor: 'text-blue-600',
  },
};

export function EmailAccountsForm({ isAdmin }: { isAdmin: boolean }) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  async function handleOAuthConnect(provider: string) {
    setConnecting(provider);
    setError('');
    window.location.href = `/api/auth/email/${provider}`;
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

  const hasOAuth = accounts.length > 0;

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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

      {hasOAuth ? (
        <div className="space-y-3">
          {accounts.map((account) => {
            const meta = PROVIDER_META[account.provider] || PROVIDER_META.GMAIL;
            return (
              <div key={account.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className={`h-4 w-4 ${meta.iconColor}`} />
                    <span className="font-medium">{account.email}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
                    >
                      {meta.label}
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

                <div className="text-xs text-muted-foreground">
                  {account.lastCheckedAt
                    ? `Última revisión: ${new Date(account.lastCheckedAt).toLocaleString('es-CO')}`
                    : 'Aún no se ha revisado'}
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-1">
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
            );
          })}
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
  );
}
