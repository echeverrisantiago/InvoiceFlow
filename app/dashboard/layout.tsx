'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { OrganizationProvider } from '@/lib/organization-context';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  FileText,
  Settings,
  LogOut,
  Menu,
  X,
} from 'lucide-react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Facturas', href: '/dashboard/invoices', icon: FileText },
    { name: 'Configuración', href: '/dashboard/settings', icon: Settings },
  ];

  return (
    <OrganizationProvider>
      <div className="flex h-screen bg-background">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`
            fixed inset-y-0 left-0 z-50 w-64 border-r bg-card
            transform transition-transform duration-200 ease-in-out lg:static lg:translate-x-0
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          `}
        >
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className="flex h-16 items-center justify-between border-b px-6">
              <h1 className="text-xl font-bold text-primary">InvoiceFlow</h1>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1 px-3 py-4">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
                      transition-colors
                      ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }
                    `}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* User section */}
            <div className="border-t p-4">
              <div className="mb-3 rounded-lg bg-muted px-3 py-2">
                <p className="text-sm font-medium">{user?.email}</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                className="w-full justify-start"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </Button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile header */}
          <header className="flex h-16 items-center border-b bg-card px-4 lg:hidden">
            <button onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="ml-4 text-xl font-bold text-primary">
              InvoiceFlow
            </h1>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto bg-background p-4 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </OrganizationProvider>
  );
}
