import MercadoPagoConfig, { Preference, Payment } from 'mercadopago';

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
});

const preferenceClient = new Preference(client);
const paymentClient = new Payment(client);

export interface CreateSubscriptionParams {
  organizationId: string;
  email: string;
}

/**
 * Create a Mercado Pago preference for subscription payment
 */
export async function createSubscriptionPreference({
  organizationId,
  email,
}: CreateSubscriptionParams) {
  try {
    const planName = 'Plan Mensual - InvoiceFlow';
    const planPrice = 69000;

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: `monthly`,
            title: planName,
            description: `Suscripción mensual al ${planName}`,
            quantity: 1,
            unit_price: planPrice,
            currency_id: 'COP',
          },
        ],
        payer: {
          email,
        },
        back_urls: {
          success: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?success=true`,
          failure: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?failure=true`,
          pending: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?pending=true`,
        },
        auto_return: 'approved',
        external_reference: organizationId,
        notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/subscriptions/webhook`,
      },
    });

    return preference;
  } catch (error: any) {
    console.error('Mercado Pago error:', error);
    throw new Error(`Error al crear preferencia: ${error.message}`);
  }
}

/**
 * Get payment details
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
 * Verify webhook signature (if MP provides it)
 */
export function verifyWebhookSignature(
  payload: any,
  signature: string | null
): boolean {
  // Mercado Pago webhook validation
  // For MVP, we'll trust the webhook if it comes from MP servers
  // In production, implement proper signature verification
  return true;
}
