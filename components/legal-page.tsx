import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

interface LegalPageProps {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export function LegalPage({ title, updatedAt, children }: LegalPageProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="text-2xl font-bold text-primary">
            EntraFactura
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="container mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Última actualización: {updatedAt}
          </p>

          <article
            className="mt-8 space-y-4 text-sm leading-relaxed
              [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight
              [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold
              [&_p]:text-muted-foreground
              [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:text-muted-foreground
              [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ol]:text-muted-foreground
              [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4
              [&_strong]:font-semibold [&_strong]:text-foreground
              [&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm
              [&_th]:border [&_th]:border-border [&_th]:p-2 [&_th]:text-left [&_th]:font-semibold
              [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:text-muted-foreground"
          >
            {children}
          </article>
        </div>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto flex flex-col items-center gap-3 px-4 text-center text-sm text-muted-foreground">
          <nav className="flex flex-wrap justify-center gap-4">
            <Link href="/privacidad" className="transition-colors hover:text-foreground">
              Política de Privacidad
            </Link>
            <Link href="/terminos" className="transition-colors hover:text-foreground">
              Términos y Condiciones
            </Link>
          </nav>
          <p>&copy; {new Date().getFullYear()} EntraFactura. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}
