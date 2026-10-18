import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  // Desactivado si no hay DSN (p. ej. en local sin configurar).
  enabled: Boolean(dsn),

  // Muestreo bajo en producción para no gastar cuota; los errores se capturan siempre.
  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  // Privacidad: no enviar datos de identificación del usuario (se manejan facturas).
  dataCollection: {
    userInfo: false,
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
