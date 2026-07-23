import sgMail from '@sendgrid/mail';

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

interface DueAlertParams {
  to: string;
  invoices: {
    supplier: string;
    total: number;
    dueDate: Date;
  }[];
}

export async function sendDueAlert({ to, invoices }: DueAlertParams) {
  try {
    const html = generateDueAlertHtml(invoices);

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject: `⚠️ Recordatorio: ${invoices.length} factura${
        invoices.length > 1 ? 's' : ''
      } próxima${invoices.length > 1 ? 's' : ''} a vencer`,
      html,
    };

    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('SendGrid error:', error);
    throw new Error(`Error al enviar email: ${error.message}`);
  }
}

function generateDueAlertHtml(
  invoices: { supplier: string; total: number; dueDate: Date }[]
): string {
  const invoiceRows = invoices
    .map(
      (inv) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        ${inv.supplier}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        ${new Intl.NumberFormat('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
        }).format(inv.total)}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        ${inv.dueDate.toLocaleDateString('es-CO')}
      </td>
    </tr>
  `
    )
    .join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facturas Próximas a Vencer</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">FactuMeIA</h1>
              <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Gestión Inteligente de Facturas</p>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #dc2626; margin: 0 0 10px 0; font-size: 22px;">
                ⚠️ Facturas Próximas a Vencer
              </h2>
              <p style="color: #6b7280; margin: 0 0 30px 0; font-size: 16px; line-height: 1.5;">
                Las siguientes facturas vencen en los próximos días. Te recomendamos realizar el pago a tiempo para evitar inconvenientes.
              </p>
              
              <!-- Invoices Table -->
              <table width="100%" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; color: #374151; font-size: 14px; border-bottom: 2px solid #e5e7eb;">
                      Proveedor
                    </th>
                    <th style="padding: 12px; text-align: right; color: #374151; font-size: 14px; border-bottom: 2px solid #e5e7eb;">
                      Total
                    </th>
                    <th style="padding: 12px; text-align: center; color: #374151; font-size: 14px; border-bottom: 2px solid #e5e7eb;">
                      Vencimiento
                    </th>
                  </tr>
                </thead>
                <tbody>
                  ${invoiceRows}
                </tbody>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 30px;">
                <tr>
                  <td align="center">
                    <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/invoices" 
                       style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Ver Todas las Facturas
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">
                © 2026 FactuMeIA. Todos los derechos reservados.
              </p>
              <p style="color: #9ca3af; margin: 10px 0 0 0; font-size: 12px;">
                Este es un correo automático, por favor no responder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
