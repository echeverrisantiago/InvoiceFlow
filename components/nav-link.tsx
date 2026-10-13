'use client';

import Link, { useLinkStatus } from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();

  if (pending) {
    return <Loader2 className="h-5 w-5 animate-spin" />;
  }

  return <Icon className="h-5 w-5" />;
}

export function NavLink({
  href,
  name,
  icon,
  active,
  onboardingKey,
  onNavigate,
}: {
  href: string;
  name: string;
  icon: LucideIcon;
  active: boolean;
  onboardingKey?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      data-onboarding={onboardingKey}
      onClick={onNavigate}
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium
        transition-colors
        ${
          active
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }
      `}
    >
      <NavIcon icon={icon} />
      {name}
    </Link>
  );
}
