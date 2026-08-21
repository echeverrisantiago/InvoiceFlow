'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';

function ResetPasswordForm() {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const [tokenState, setTokenState] = useState<'loading' | 'valid' | 'expired' | 'invalid'>('loading');
  const [success, setSuccess] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setTokenState('invalid');
      setValidating(false);
      return;
    }

    fetch(`/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          setTokenState('valid');
        } else if (data.reason === 'expired') {
          setTokenState('expired');
        } else {
          setTokenState('invalid');
        }
      })
      .catch(() => setTokenState('invalid'))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      return;
    }

    if (newPassword.length < 8) {
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.reason === 'expired') {
          setTokenState('expired');
        } else {
          setTokenState('invalid');
        }
        return;
      }

      setSuccess(true);
    } catch {
      setTokenState('invalid');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Contraseña actualizada</CardTitle>
            <CardDescription>
              Tu contraseña ha sido cambiada exitosamente. Ahora puedes iniciar sesión con tu nueva contraseña.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Ir al inicio de sesión
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (tokenState === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Enlace expirado</CardTitle>
            <CardDescription>
              El enlace de recuperación ha expirado. Los enlaces son válidos por 10 minutos por seguridad. Solicita uno nuevo para continuar.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/forgot-password">Solicitar nuevo enlace</Link>
            </Button>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors text-center"
            >
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (tokenState === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Enlace inválido</CardTitle>
            <CardDescription>
              El enlace de recuperación no es válido o ya ha sido utilizado. Solicita uno nuevo para continuar.
            </CardDescription>
          </CardHeader>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/forgot-password">Solicitar nuevo enlace</Link>
            </Button>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-primary transition-colors text-center"
            >
              Volver al inicio de sesión
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Nueva Contraseña</CardTitle>
          <CardDescription>
            Ingresa tu nueva contraseña. Mínimo 8 caracteres.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva Contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Actualizando...' : 'Cambiar Contraseña'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
