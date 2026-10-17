import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';
import { getInvoiceQuota } from '@/lib/plans';
import {
  ACCEPTED_UPLOAD_MIME_TYPES,
  isXmlFileName,
  isZipFileName,
} from '@/lib/file-types';
import { enforceRateLimit, uploadOrgLimiter } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContext();

    if (!context) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const limited = await enforceRateLimit(
      uploadOrgLimiter,
      `org:${context.organization.id}`
    );
    if (limited) return limited;

    if (!context.subscription.isActive) {
      return NextResponse.json(
        {
          error:
            'Tu periodo de prueba ha terminado. Suscríbete para continuar subiendo facturas.',
          code: 'SUBSCRIPTION_REQUIRED',
        },
        { status: 402 }
      );
    }

    if (context.subscription.isTrial) {
      const quota = await getInvoiceQuota(context.organization.id);
      if (quota.used >= quota.limit) {
        return NextResponse.json(
          {
            error: `Has alcanzado el límite de ${quota.limit} facturas de tu periodo de prueba. Suscríbete para continuar.`,
            code: 'TRIAL_LIMIT_REACHED',
          },
          { status: 402 }
        );
      }
    } else {
      const quota = await getInvoiceQuota(context.organization.id);
      if (quota.used >= quota.limit) {
        return NextResponse.json(
          {
            error: `Has alcanzado el límite de ${quota.limit} facturas por mes de tu plan ${quota.plan.name}. Mejora tu plan para continuar.`,
            code: 'PLAN_LIMIT_REACHED',
          },
          { status: 402 }
        );
      }
    }

    // Get file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No se proporcionó archivo' },
        { status: 400 }
      );
    }

    // Validate file type (by MIME and, for ZIP/XML, by extension)
    const mimeType = (file.type || '').toLowerCase();
    const hasAllowedMime = ACCEPTED_UPLOAD_MIME_TYPES.includes(mimeType);
    const hasAllowedExtension = isZipFileName(file.name) || isXmlFileName(file.name);

    if (!hasAllowedMime && !hasAllowedExtension) {
      return NextResponse.json(
        { error: 'Tipo de archivo no permitido' },
        { status: 400 }
      );
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Archivo muy grande (máximo 10MB)' },
        { status: 400 }
      );
    }

    const supabase = getAdminClient();

    // Generate unique file path
    const fileExt = file.name.split('.').pop();
    const storageName = `${nanoid()}.${fileExt}`;
    const filePath = `${context.organization.id}/${storageName}`;

    // Upload to Supabase Storage (private bucket, service-role client)
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Error al subir archivo' },
        { status: 500 }
      );
    }

    // Create invoice record in database. `filePath` is the Storage object path
    // (served via signed URL); `fileUrl` is the internal API endpoint.
    const invoiceId = nanoid();
    const invoice = await prisma.invoice.create({
      data: {
        id: invoiceId,
        organizationId: context.organization.id,
        uploadedById: context.user.id,
        fileName: file.name,
        filePath,
        fileUrl: `/api/invoices/${invoiceId}/file`,
        fileSize: file.size,
        status: 'PROCESSING',
        paymentStatus: 'PENDING',
      },
    });

    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      fileUrl: invoice.fileUrl,
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al procesar archivo' },
      { status: 500 }
    );
  }
}
