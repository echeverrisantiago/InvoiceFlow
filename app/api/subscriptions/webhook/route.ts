import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPayment } from '@/lib/mercadopago';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Mercado Pago webhook payload
    const { type, data } = body;

    if (type === 'payment') {
      const paymentId = data.id;

      // Get payment details
      const payment = await getPayment(paymentId);

      if (payment.status === 'approved') {
        const organizationId = payment.external_reference;

        if (!organizationId) {
          console.error('No organization ID in payment');
          return NextResponse.json({ received: true });
        }

        // Update subscription
        const subscription = await prisma.subscription.findUnique({
          where: { organizationId },
        });

        if (subscription) {
          const now = new Date();
          const nextPeriodEnd = new Date(now);
          nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

          await prisma.subscription.update({
            where: { organizationId },
            data: {
              status: 'ACTIVE',
              mercadoPagoSubscriptionId: payment.id?.toString(),
              currentPeriodStart: now,
              currentPeriodEnd: nextPeriodEnd,
            },
          });

          console.log(`Subscription activated for org ${organizationId}`);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
