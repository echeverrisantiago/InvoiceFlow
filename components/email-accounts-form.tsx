'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  Trash2,
  Mail,
  AlertTriangle,
  RefreshCw,
  LogOut,
} from 'lucide-react';

interface EmailAccount {
  id: string;
  email: string;
  provider: string;
  isActive: boolean;
  lastCheckedAt: string | null;
  needsReconnect: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
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

export function EmailAccountsForm({
  isAdmin,
  maxAccounts,
}: {
  isAdmin: boolean;
  maxAccounts: number;
}) {
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showGmailNotice, setShowGmailNotice] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (!showGmailNotice) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowGmailNotice(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGmailNotice]);

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

  /**
   * Solo la primera vez (sin ningún correo conectado) se avisa del cartel de
   * app no verificada de Google. Al añadir o cambiar una cuenta, va directo.
   */
  function handleGmailClick() {
    if (accounts.length === 0) {
      setShowGmailNotice(true);
      return;
    }
    handleOAuthConnect('gmail');
  }

  async function changeAccountState(id: string, permanent: boolean) {
    const message = permanent
      ? '¿Eliminar definitivamente esta cuenta? Las facturas importadas desde este correo perderán la vista previa.'
      : '¿Desconectar esta cuenta? Dejará de sincronizar, pero podrás reconectarla sin perder tus facturas.';

    if (!confirm(message)) return;

    setDeletingId(id);
    setError('');
    setSuccess('');

    try {
      const res = await fetch(
        `/api/email-accounts/${id}${permanent ? '?permanent=1' : ''}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Error al actualizar la cuenta');
        return;
      }

      setSuccess(permanent ? 'Cuenta eliminada' : 'Cuenta desconectada');
      loadAccounts();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error de conexión');
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeCount = accounts.filter((account) => account.isActive).length;
  const atLimit = activeCount >= maxAccounts;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Correos sincronizados</span>
        <span className="text-muted-foreground">
          {activeCount} de {maxAccounts}
        </span>
      </div>

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

      {accounts.length > 0 && (
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
                    {account.needsReconnect ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                        Reconexión requerida
                      </span>
                    ) : account.isActive ? (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-400">
                        Activa
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        Desconectada
                      </span>
                    )}
                  </div>
                </div>

                {account.needsReconnect && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium">Este correo dejó de sincronizarse</p>
                      <p className="text-xs">
                        El acceso fue revocado o caducó, así que no se están
                        importando facturas nuevas.
                        {account.lastErrorAt
                          ? ` (${new Date(account.lastErrorAt).toLocaleString('es-CO')})`
                          : ''}
                      </p>
                      {isAdmin && (
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() =>
                            handleOAuthConnect(
                              account.provider === 'OUTLOOK' ? 'outlook' : 'gmail'
                            )
                          }
                          disabled={connecting !== null}
                        >
                          {connecting !== null ? (
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3 w-3" />
                          )}
                          Reconectar
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  {account.lastCheckedAt
                    ? `Última revisión: ${new Date(account.lastCheckedAt).toLocaleString('es-CO')}`
                    : 'Aún no se ha revisado'}
                </div>

                {isAdmin && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {account.isActive ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => changeAccountState(account.id, false)}
                        disabled={deletingId === account.id}
                      >
                        {deletingId === account.id ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <LogOut className="mr-1 h-3 w-3" />
                        )}
                        Desconectar
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() =>
                          handleOAuthConnect(
                            account.provider === 'OUTLOOK'
                              ? 'outlook'
                              : 'gmail'
                          )
                        }
                        disabled={connecting !== null}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Reconectar
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => changeAccountState(account.id, true)}
                      disabled={deletingId === account.id}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Eliminar definitivamente
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAdmin && !atLimit && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="h-auto py-4 px-4 justify-start gap-3 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
            onClick={handleGmailClick}
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
      )}

      {isAdmin && atLimit && (
        <p className="text-sm text-muted-foreground">
          Alcanzaste el límite de {maxAccounts} correo(s) de tu plan. Elimina
          una cuenta o mejora tu plan para conectar más.
        </p>
      )}

      {!isAdmin && accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Solo los administradores pueden conectar correos.
        </p>
      )}

      {showGmailNotice && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onClick={() => setShowGmailNotice(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gmail-notice-title"
            className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>

            <h2
              id="gmail-notice-title"
              className="text-xl font-semibold tracking-tight"
            >
              Google mostrará un aviso
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              Mientras terminamos la verificación con Google, al conectar Gmail
              verás una pantalla que dice{' '}
              <strong>&ldquo;Google no ha verificado esta aplicación&rdquo;</strong>.
              Es normal y solo aparece la primera vez.
            </p>

            <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">Para continuar:</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
                <li>
                  Pulsa <strong>Configuración avanzada</strong> (abajo a la
                  izquierda).
                </li>
                <li>
                  Pulsa <strong>Ir a Entrafactura (no seguro)</strong>.
                </li>
                <li>Autoriza el acceso a tu correo.</li>
              </ol>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              EntraFactura solo lee los correos y adjuntos necesarios para
              registrar tus facturas. No envía, modifica ni elimina nada.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setShowGmailNotice(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  setShowGmailNotice(false);
                  handleOAuthConnect('gmail');
                }}
              >
                Entendido, continuar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
