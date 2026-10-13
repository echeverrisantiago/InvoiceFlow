import { NextRequest, NextResponse } from 'next/server';
import { getTenantContext } from '@/lib/with-tenant';
import { prisma } from '@/lib/prisma';
import { getInvoiceFileFromEmail } from '@/lib/email-file';
import { getPreviewFile } from '@/lib/electronic-invoice';
import { isZipFile } from '@/lib/file-types';

interface PreviewFile {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

function fileResponse(file: PreviewFile): Response {
  return new Response(new Uint8Array(file.buffer), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const context = await getTenantContext();

  if (!context) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: {
      id,
      organizationId: context.organization.id,
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
  }

  // Manual uploads are stored in Supabase Storage.
  if (invoice.source !== 'EMAIL' || !invoice.emailAccountId || !invoice.messageUid) {
    if (!invoice.fileUrl) {
      return NextResponse.json(
        { error: 'Vista previa no disponible para esta factura' },
        { status: 404 }
      );
    }

    // Electronic invoices (ZIP): extract the embedded PDF for preview.
    if (isZipFile(undefined, invoice.fileName)) {
      try {
        const response = await fetch(invoice.fileUrl);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const mimeType = response.headers.get('content-type') || 'application/zip';
          return fileResponse(getPreviewFile(buffer, mimeType, invoice.fileName));
        }
      } catch (error: unknown) {
        console.error('Error obteniendo preview del ZIP:', error);
      }
    }

    return NextResponse.redirect(invoice.fileUrl, 307);
  }

  try {
    const file = await getInvoiceFileFromEmail({
      emailAccountId: invoice.emailAccountId,
      messageUid: invoice.messageUid,
      attachmentFilename: invoice.attachmentFilename,
    });

    if (!file) {
      return NextResponse.json(
        {
          error:
            'Vista previa no disponible. El correo asociado fue eliminado, el mensaje ya no existe en el buzón o los permisos cambiaron.',
        },
        { status: 410 }
      );
    }

    return fileResponse(getPreviewFile(file.buffer, file.mimeType, file.fileName));
  } catch (error: unknown) {
    console.error('Error obteniendo preview desde email:', error);
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { error: `No se pudo obtener la vista previa desde el correo: ${message}` },
      { status: 500 }
    );
  }
}
