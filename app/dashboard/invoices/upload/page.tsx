'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Upload, FileText, Loader2, CheckCircle2 } from 'lucide-react';

export default function UploadInvoicePage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
  });

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress('Subiendo archivo...');

    try {
      // Create form data
      const formData = new FormData();
      formData.append('file', file);

      // Upload file
      const uploadResponse = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json();
        throw new Error(errorData.error || 'Error al subir archivo');
      }

      const { invoiceId } = await uploadResponse.json();
      setProgress('Extrayendo datos con IA...');

      // Trigger extraction
      const extractResponse = await fetch(`/api/invoices/${invoiceId}/extract`, {
        method: 'POST',
      });

      if (!extractResponse.ok) {
        const errorData = await extractResponse.json();
        throw new Error(errorData.error || 'Error al extraer datos');
      }

      setProgress('¡Completado!');
      toast.success('Factura procesada exitosamente');
      
      // Redirect to invoices list
      setTimeout(() => {
        router.push('/dashboard/invoices');
        router.refresh();
      }, 1000);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'Error al procesar factura');
      setProgress('');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Subir Factura</h1>
        <p className="text-muted-foreground">
          Sube un PDF o imagen de tu factura para extraer los datos automáticamente
        </p>
      </div>

      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle>Selecciona un archivo</CardTitle>
          <CardDescription>
            Formatos aceptados: PDF, PNG, JPG. Tamaño máximo: 10MB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
              transition-colors
              ${
                isDragActive
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }
            `}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center">
              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg font-medium">Suelta el archivo aquí</p>
              ) : (
                <>
                  <p className="text-lg font-medium mb-2">
                    Arrastra tu factura aquí
                  </p>
                  <p className="text-sm text-muted-foreground">
                    o haz clic para seleccionar un archivo
                  </p>
                </>
              )}
            </div>
          </div>

          {/* File preview */}
          {file && (
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <FileText className="h-8 w-8 text-primary" />
              <div className="flex-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              {!uploading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFile(null)}
                >
                  Eliminar
                </Button>
              )}
            </div>
          )}

          {/* Progress */}
          {uploading && (
            <div className="flex items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4">
              {progress === '¡Completado!' ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              )}
              <p className="text-sm font-medium">{progress}</p>
            </div>
          )}

          {/* Upload button */}
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
            size="lg"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Subir y Procesar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>¿Cómo funciona?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              1
            </div>
            <p>
              <strong>Sube tu factura:</strong> PDF o imagen de tu factura
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              2
            </div>
            <p>
              <strong>IA extrae los datos:</strong> Proveedor, NIT, fechas, montos automáticamente
            </p>
          </div>
          <div className="flex gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
              3
            </div>
            <p>
              <strong>Guardado automático:</strong> Se guarda en Supabase y Google Drive
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
