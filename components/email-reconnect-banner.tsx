'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, X } from 'lucide-react';

interface Account {
  id: string;
  email: string;
  needsReconnect: boolean;
}

export function EmailReconnectBanner() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/email-accounts');
        if (!res.ok) return;
        const data = await res.json();
        if (active) {
          setAccounts(
            (data.accounts || []).filter((account: Account) => account.needsReconnect)
          );
        }
      } catch {
        /* silencioso */
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (dismissed || accounts.length === 0) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          {accounts.length === 1
            ? 'Un correo dejó de sincronizarse'
            : `${accounts.length} correos dejaron de sincronizarse`}
        </p>
        <p className="text-xs">
          {accounts.map((account) => account.email).join(', ')} —{' '}
          <Link href="/dashboard/settings" className="font-medium underline">
            reconéctalo en Configuración
          </Link>
          .
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar aviso"
        className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
