import MercadoPagoConfig, {
  Payment,
  PreApproval,
  Invoice,
  WebhookSignatureValidator,
} from 'mercadopago';
import {
  BillingInterval,
  PlanKey,
  getIntervalMonths,
  getPlanDefinition,
  getPlanPrice,
} from '@/types';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

const paymentClient = new Payment(client);
const preApprovalClient = new PreApproval(client);
const invoiceClient = new Invoice(client);

export interface CreatePreapprovalParams {
  organizationId: string;
  email: string;
  plan: PlanKey;
  interval: BillingInterval;
}

/**
 * Create a recurring subscription (pre-approval) with Mercado Pago.
 * Returns a `pending` subscription with an `init_point` the buyer must visit
 * to authorize the recurring charge.
 */
export async function createPreapproval({
  organizationId,
  email,
  plan,
  interval,
}: CreatePreapprovalParams) {
  try {
    const planDef = getPlanDefinition(plan);
    const amount = getPlanPrice(planDef, interval);
    const frequency = getIntervalMonths(interval);
    const intervalLabel = interval === 'YEARLY' ? 'Anual' : 'Mensual';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const body = {
      reason: `Plan ${planDef.name} (${intervalLabel}) - EntraFactura`,
      external_reference: organizationId,
      //payer_email: email,
      payer_email: "testuser9179256862855185971xx@testuser.com",
      back_url: `${appUrl}/dashboard/settings/billing`,
      status: 'pending',
      auto_recurring: {
        frequency,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: 'COP',
      },
      // Accepted by the API but not part of the SDK type surface.
      notification_url: `${appUrl}/api/subscriptions/webhook`,
    };

    const preapproval = await preApprovalClient.create({
      body: body as any,
    });

    return preapproval;
  } catch (error: any) {
    console.error('Mercado Pago preapproval error:', error);
    throw new Error(`Error al crear la suscripción: ${error.message}`);
  }
}

/**
 * Retrieve a subscription (pre-approval) by id.
 */
export async function getPreapproval(id: string) {
  try {
    return await preApprovalClient.get({ id });
  } catch (error: any) {
    console.error('Mercado Pago get preapproval error:', error);
    throw new Error(`Error al obtener la suscripción: ${error.message}`);
  }
}

/**
 * Cancel a subscription (pre-approval) so it stops charging.
 */
export async function cancelPreapproval(id: string) {
  try {
    return await preApprovalClient.update({
      id,
      body: { status: 'cancelled' },
    });
  } catch (error: any) {
    console.error('Mercado Pago cancel preapproval error:', error);
    throw new Error(`Error al cancelar la suscripción: ${error.message}`);
  }
}

/**
 * Retrieve a subscription invoice (authorized payment) by id.
 */
export async function getSubscriptionInvoice(id: string) {
  try {
    return await invoiceClient.get({ id });
  } catch (error: any) {
    console.error('Mercado Pago get invoice error:', error);
    throw new Error(`Error al obtener la factura de suscripción: ${error.message}`);
  }
}

/**
 * Get payment details (fallback for one-time payments).
 */
export async function getPayment(paymentId: string) {
  try {
    const payment = await paymentClient.get({ id: paymentId });
    return payment;
  } catch (error: any) {
    console.error('Mercado Pago get payment error:', error);
    throw new Error(`Error al obtener pago: ${error.message}`);
  }
}

/**
 * Validate a Mercado Pago webhook signature.
 * When no secret is configured it trusts the request (local/dev).
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
}): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true;

  try {
    WebhookSignatureValidator.validate({
      xSignature: params.xSignature,
      xRequestId: params.xRequestId,
      dataId: params.dataId,
      secret,
      toleranceSeconds: 300,
    });
    return true;
  } catch (error) {
    console.error('Webhook signature validation failed:', error);
    return false;
  }
}
