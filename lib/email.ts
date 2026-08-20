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

interface ActivationEmailParams {
  to: string;
  name: string;
  temporaryPassword: string;
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

export async function sendActivationEmail({
  to,
  name,
  temporaryPassword,
}: ActivationEmailParams) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const html = generateActivationEmailHtml({
      name,
      temporaryPassword,
      loginUrl: `${appUrl}/login`,
    });

    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL!,
      subject: 'Activa tu cuenta en FactuMeIA - Acceso a tu periodo de prueba',
      html,
    };

    await sgMail.send(msg);
    return { success: true };
  } catch (error: any) {
    console.error('SendGrid activation error:', error);
    throw new Error(`Error al enviar email de activación: ${error.message}`);
  }
}

function generateActivationEmailHtml({
  name,
  temporaryPassword,
  loginUrl,
}: {
  name: string;
  temporaryPassword: string;
  loginUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activa tu Cuenta</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #2563eb; padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">FactuMeIA</h1>
              <p style="color: #e0e7ff; margin: 10px 0 0 0; font-size: 14px;">Gestión Inteligente de Facturas</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #111827; margin: 0 0 10px 0; font-size: 22px;">
                ¡Hola ${name}!
              </h2>
              <p style="color: #6b7280; margin: 0 0 20px 0; font-size: 16px; line-height: 1.5;">
                Tu cuenta en FactuMeIA ha sido creada exitosamente. Has comenzado tu <strong>periodo de prueba gratuito de 30 días</strong> con acceso completo a todas las funcionalidades.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f0fdf4; border-left: 4px solid #22c55e; margin-bottom: 25px;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <h3 style="color: #166534; margin: 0 0 8px 0; font-size: 16px;">Tus Datos de Acceso</h3>
                    <p style="color: #374151; margin: 0 0 4px 0; font-size: 14px;">
                      <strong>Email:</strong> Tu dirección de correo electrónico
                    </p>
                    <p style="color: #374151; margin: 0; font-size: 14px;">
                      <strong>Contraseña temporal:</strong> <code style="background-color: #dcfce7; padding: 2px 6px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 15px; letter-spacing: 1px;">${temporaryPassword}</code>
                    </p>
                  </td>
                </tr>
              </table>

              <p style="color: #6b7280; margin: 0 0 10px 0; font-size: 14px; line-height: 1.5;">
                Por seguridad, al iniciar sesión por primera vez deberás crear una nueva contraseña personal.
              </p>

              <p style="color: #dc2626; margin: 0 0 25px 0; font-size: 13px; line-height: 1.5;">
                Esta contraseña temporal expirará después de 30 días si no la utilizas.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 25px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}"
                       style="display: inline-block; padding: 14px 32px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
                      Iniciar Sesión Ahora
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color: #9ca3af; margin: 0; font-size: 13px; line-height: 1.5;">
                Si tienes alguna duda, no dudes en contactarnos respondiendo a este correo.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; margin: 0; font-size: 14px;">
                &copy; 2026 FactuMeIA. Todos los derechos reservados.
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
