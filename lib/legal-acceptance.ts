import { prisma } from '@/lib/prisma';
import { getClientIp } from '@/lib/ratelimit';
import {
  PRIVACY_HASH,
  PRIVACY_VERSION,
  TERMS_HASH,
  TERMS_VERSION,
  isCurrentAcceptance,
} from '@/lib/legal';

export type AcceptanceSource = 'REGISTER' | 'TRIAL' | 'REACCEPT';

/** Metadatos de la petición para el registro probatorio. */
export function getAcceptanceRequestMeta(request: Request) {
  return {
    ip: getClientIp(request),
    userAgent: request.headers.get('user-agent'),
  };
}

/**
 * Construye los datos de un registro de aceptación de la versión vigente.
 * Se puede usar tanto con `prisma` como dentro de una transacción (`tx`).
 */
export function buildAcceptanceData(params: {
  userId: string;
  source: AcceptanceSource;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return {
    userId: params.userId,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    termsHash: TERMS_HASH,
    privacyHash: PRIVACY_HASH,
    source: params.source,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  };
}

/**
 * Inserta un registro inmutable de aceptación de la versión vigente.
 * Solo se inserta (nunca se actualiza ni se borra).
 */
export async function recordTermsAcceptance(params: {
  userId: string;
  source: AcceptanceSource;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.termsAcceptance.create({
    data: buildAcceptanceData(params),
  });
}

export async function getLatestAcceptance(userId: string) {
  return prisma.termsAcceptance.findFirst({
    where: { userId },
    orderBy: { acceptedAt: 'desc' },
    select: { termsVersion: true, privacyVersion: true, acceptedAt: true },
  });
}

/** True si el usuario no tiene una aceptación de la versión vigente. */
export async function needsReacceptance(userId: string): Promise<boolean> {
  const latest = await getLatestAcceptance(userId);
  return !isCurrentAcceptance(latest);
}
