import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendDueAlert } from '@/lib/email';

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Find invoices due in the next 3 days
    const upcomingInvoices = await prisma.invoice.findMany({
      where: {
        dueDate: {
          gte: now,
          lte: threeDaysFromNow,
        },
        paymentStatus: 'PENDING',
        status: {
          notIn: ['FAILED', 'PROCESSING'],
        },
      },
      include: {
        organization: {
          include: {
            members: {
              where: {
                role: 'ADMIN',
              },
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    // Group invoices by organization
    const invoicesByOrg = upcomingInvoices.reduce((acc, invoice) => {
      const orgId = invoice.organizationId;
      if (!acc[orgId]) {
        acc[orgId] = {
          organization: invoice.organization,
          invoices: [],
        };
      }
      acc[orgId].invoices.push(invoice);
      return acc;
    }, {} as Record<string, any>);

    // Send alerts
    const results = [];
    for (const [orgId, data] of Object.entries(invoicesByOrg)) {
      const { organization, invoices } = data as any;

      // Get admin emails
      const adminEmails = organization.members.map((m: any) => m.user.email);

      // Check if we already sent alert today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const alreadySent = await prisma.alertLog.findFirst({
        where: {
          organizationId: orgId,
          type: 'due_date',
          sentAt: {
            gte: today,
          },
        },
      });

      if (alreadySent) {
        results.push({
          organization: organization.name,
          status: 'skipped',
          reason: 'Already sent today',
        });
        continue;
      }

      // Send email to each admin
      for (const email of adminEmails) {
        try {
          await sendDueAlert({
            to: email,
            invoices: invoices.map((inv: any) => ({
              supplier: inv.supplier || 'Sin proveedor',
              total: inv.total || 0,
              dueDate: inv.dueDate,
            })),
          });

          // Log alert
          await prisma.alertLog.create({
            data: {
              organizationId: orgId,
              type: 'due_date',
              message: `Alert sent to ${email} for ${invoices.length} invoice(s)`,
              metadata: {
                recipientEmail: email,
                invoiceCount: invoices.length,
                invoiceIds: invoices.map((inv: any) => inv.id),
              },
            },
          });

          results.push({
            organization: organization.name,
            email,
            status: 'sent',
            invoiceCount: invoices.length,
          });
        } catch (error: any) {
          console.error(`Failed to send alert to ${email}:`, error);
          results.push({
            organization: organization.name,
            email,
            status: 'failed',
            error: error.message,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      alertsSent: results.filter((r) => r.status === 'sent').length,
      alertsFailed: results.filter((r) => r.status === 'failed').length,
      alertsSkipped: results.filter((r) => r.status === 'skipped').length,
      details: results,
    });
  } catch (error: any) {
    console.error('Cron error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar alertas' },
      { status: 500 }
    );
  }
}

