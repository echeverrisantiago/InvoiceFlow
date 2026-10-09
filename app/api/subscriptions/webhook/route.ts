import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getPayment,
  getPreapproval,
  getSubscriptionInvoice,
  verifyWebhookSignature,
} from '@/lib/mercadopago';
import {
  BillingInterval,
  PlanKey,
  getIntervalMonths,
  isBillingInterval,
  isPlanKey,
} from '@/types';

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function intervalFromFrequency(frequency?: number): BillingInterval {
  return frequency && frequency >= 12 ? 'YEARLY' : 'MONTHLY';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, data } = body;

    const dataId =
      request.nextUrl.searchParams.get('data.id') ??
      (data?.id != null ? String(data.id) : null);

    const signatureOk = verifyWebhookSignature({
      xSignature: request.headers.get('x-signature'),
      xRequestId: request.headers.get('x-request-id'),
      dataId,
    });

    if (!signatureOk) {
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }

    // Subscription linking / status changes
    if (type === 'subscription_preapproval' || type === 'preapproval') {
      if (!data?.id) return NextResponse.json({ received: true });

      const preapproval = await getPreapproval(String(data.id));
      const organizationId = preapproval.external_reference
        ? String(preapproval.external_reference)
        : null;
      if (!organizationId) {
        console.error('No organization reference in preapproval');
        return NextResponse.json({ received: true });
      }

      const subscription = await prisma.subscription.findUnique({
        where: { organizationId },
      });

      // Ignore events for a preapproval that is no longer the current one
      // (e.g. the old subscription we cancelled when switching plans).
      if (
        subscription?.mercadoPagoSubscriptionId &&
        subscription.mercadoPagoSubscriptionId !== String(preapproval.id)
      ) {
        return NextResponse.json({ received: true });
      }

      const statusMap: Record<string, 'ACTIVE' | 'CANCELED' | 'PAST_DUE'> = {
        authorized: 'ACTIVE',
        cancelled: 'CANCELED',
        paused: 'PAST_DUE',
      };

      const mappedStatus = preapproval.status
        ? statusMap[preapproval.status]
        : undefined;

      const interval = intervalFromFrequency(
        preapproval.auto_recurring?.frequency
      );

      const now = new Date();

      await prisma.subscription.update({
        where: { organizationId },
        data: {
          interval,
          mercadoPagoSubscriptionId: preapproval.id ?? undefined,
          mercadoPagoCustomerId: preapproval.payer_id
            ? String(preapproval.payer_id)
            : undefined,
          ...(mappedStatus ? { status: mappedStatus } : {}),
          ...(mappedStatus === 'ACTIVE'
            ? {
                currentPeriodStart: now,
                currentPeriodEnd: addMonths(now, getIntervalMonths(interval)),
              }
            : {}),
        },
      });

      console.log(
        `Preapproval ${preapproval.status} for org ${organizationId}`
      );
    }

    // Recurring charge of a subscription
    if (type === 'subscription_authorized_payment') {
      if (!data?.id) return NextResponse.json({ received: true });

      const invoice = await getSubscriptionInvoice(String(data.id));
      if (!invoice.preapproval_id) {
        return NextResponse.json({ received: true });
      }

      const subscription = await prisma.subscription.findFirst({
        where: { mercadoPagoSubscriptionId: invoice.preapproval_id },
      });

      if (!subscription) {
        console.error('No subscription for preapproval', invoice.preapproval_id);
        return NextResponse.json({ received: true });
      }

      if (invoice.payment?.status === 'approved') {
        const baseDate = invoice.debit_date
          ? new Date(invoice.debit_date)
          : new Date();
        const months = getIntervalMonths(
          subscription.interval as BillingInterval
        );

        await prisma.subscription.update({
          where: { id: subscription.id },
          data: {
            status: 'ACTIVE',
            currentPeriodStart: baseDate,
            currentPeriodEnd: addMonths(baseDate, months),
          },
        });

        console.log(`Subscription payment approved for org ${subscription.organizationId}`);
      }
    }

    // Fallback: one-time payment events
    if (type === 'payment' && data?.id) {
      const payment = await getPayment(String(data.id));

      if (payment.status === 'approved' && payment.external_reference) {
        const organizationId = String(payment.external_reference);

        const subscription = await prisma.subscription.findUnique({
          where: { organizationId },
        });

        if (subscription) {
          const paidPlan = (payment.metadata as any)?.plan;
          const paidInterval = (payment.metadata as any)?.interval;

          const interval: BillingInterval = isBillingInterval(paidInterval)
            ? paidInterval
            : (subscription.interval as BillingInterval);

          const now = new Date();

          await prisma.subscription.update({
            where: { organizationId },
            data: {
              status: 'ACTIVE',
              interval,
              ...(isPlanKey(paidPlan) ? { plan: paidPlan as PlanKey } : {}),
              currentPeriodStart: now,
              currentPeriodEnd: addMonths(now, getIntervalMonths(interval)),
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
