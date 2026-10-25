import { prisma } from '@/lib/prisma';
import { sendPaymentFailedEmail } from '@/lib/email';
import { graceEndsAt } from '@/lib/subscription-status';

/**
 * Avisa a los administradores de la organización de que un cobro recurrente
 * falló y de la fecha límite antes de suspender el acceso.
 */
export async function notifyPaymentFailed({
  organizationId,
  currentPeriodEnd,
  reason,
}: {
  organizationId: string;
  currentPeriodEnd: Date | null;
  reason?: string;
}): Promise<void> {
  try {
    const admins = await prisma.organizationMember.findMany({
      where: { organizationId, role: 'ADMIN' },
      include: { user: { select: { email: true, name: true } } },
    });

    const recipients = new Map<string, string | null>();
    for (const member of admins) {
      if (member.user.email) {
        recipients.set(member.user.email, member.user.name);
      }
    }

    const grace = graceEndsAt(currentPeriodEnd);

    for (const [to, name] of recipients) {
      try {
        await sendPaymentFailedEmail({ to, name, graceEndsAt: grace });
      } catch (sendError) {
        console.error(`Error enviando aviso de pago fallido a ${to}:`, sendError);
      }
    }

    await prisma.alertLog.create({
      data: {
        organizationId,
        type: 'payment_failed',
        message: 'Cobro recurrente rechazado',
        metadata: {
          reason: reason ?? null,
          graceEndsAt: grace?.toISOString() ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Error en notifyPaymentFailed:', error);
  }
}
