'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { NAV_EVENT } from '@/lib/navigation-events';

function TopProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);

  // A route change means the navigation finished.
  useEffect(() => {
    setActive(false);
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (
        !href ||
        href.startsWith('#') ||
        anchor.hasAttribute('download') ||
        anchor.getAttribute('target') === '_blank'
      ) {
        return;
      }

      try {
        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        ) {
          return;
        }
        setActive(true);
      } catch {
        // ignore malformed URLs
      }
    };

    const onNavigate = (event: Event) => {
      setActive(Boolean((event as CustomEvent<boolean>).detail));
    };

    document.addEventListener('click', onClick, true);
    window.addEventListener(NAV_EVENT, onNavigate);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener(NAV_EVENT, onNavigate);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-pending', active);
    return () => {
      document.body.classList.remove('nav-pending');
    };
  }, [active]);

  // Safety net: never leave the bar stuck if a navigation never resolves.
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setActive(false), 10000);
    return () => clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden bg-primary/15">
      <div className="animate-app-progress h-full w-1/3 rounded-full bg-primary" />
    </div>
  );
}

export function TopProgress() {
  return (
    <Suspense fallback={null}>
      <TopProgressInner />
    </Suspense>
  );
}
