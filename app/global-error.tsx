'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body>
        {/* NextError con statusCode 0 para no exponer códigos de App Router. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
