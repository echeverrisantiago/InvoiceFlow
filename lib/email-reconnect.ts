import { prisma } from '@/lib/prisma';
import { sendReconnectAlert } from '@/lib/email';

/**
 * Notifies the organization admins that a connected mailbox needs to be
 * reconnected (its OAuth access was revoked/expired). Called once per
 * transition to `needsReconnect`.
 */
export async function notifyEmailReconnect({
  accountId,
  organizationId,
  email,
  provider,
  error,
}: {
  accountId: string;
  organizationId: string;
  email: string;
  provider: string;
  error?: string;
}): Promise<void> {
  try {
    const admins = await prisma.organizationMember.findMany({
      where: { organizationId, role: 'ADMIN' },
      include: { user: { select: { email: true } } },
    });

    const recipients = Array.from(
      new Set(
        admins
          .map((member) => member.user.email)
          .filter((value): value is string => Boolean(value))
      )
    );

    for (const to of recipients) {
      try {
        await sendReconnectAlert({ to, email, provider });
      } catch (sendError) {
        console.error(`Error enviando aviso de reconexión a ${to}:`, sendError);
      }
    }

    await prisma.alertLog.create({
      data: {
        organizationId,
        type: 'email_reconnect',
        message: `Reconexión requerida para ${email}`,
        metadata: { accountId, email, provider, error: error ?? null },
      },
    });
  } catch (notifyError) {
    console.error('Error en notifyEmailReconnect:', notifyError);
  }
}
