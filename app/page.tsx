import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <h1 className="text-2xl font-bold text-primary">FactuMeIA</h1>
          <nav className="flex gap-4">
            <Button asChild variant="ghost">
              <Link href="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Registrarse</Link>
            </Button>
          </nav>
        </div>
      </header>
      
      <main className="flex-1">
        <section className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-5xl font-bold tracking-tight">
            Gestión Inteligente de Facturas
          </h2>
          <p className="mt-6 text-xl text-muted-foreground">
            Automatiza la gestión de facturas de tu PYME con inteligencia artificial
          </p>
          <div className="mt-10 flex justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/register">Comenzar Gratis</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="#features">Ver Características</Link>
            </Button>
          </div>
        </section>

        <section id="features" className="bg-muted/50 py-24">
          <div className="container mx-auto px-4">
            <h3 className="text-center text-3xl font-bold">Características</h3>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h4 className="text-xl font-semibold">Extracción con IA</h4>
                <p className="mt-2 text-muted-foreground">
                  Extrae automáticamente datos de facturas usando inteligencia artificial
                </p>
              </div>
              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h4 className="text-xl font-semibold">Backup en Drive</h4>
                <p className="mt-2 text-muted-foreground">
                  Guarda automáticamente tus facturas en Google Drive
                </p>
              </div>
              <div className="rounded-lg bg-card p-6 shadow-sm">
                <h4 className="text-xl font-semibold">Alertas Inteligentes</h4>
                <p className="mt-2 text-muted-foreground">
                  Recibe notificaciones de vencimiento por email
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2026 FactuMeIA. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
