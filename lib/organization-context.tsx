'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Organization {
  id: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
}

interface OrganizationContextType {
  organization: Organization | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  loading: true,
  refetch: async () => {},
});

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}

export function OrganizationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchOrganization = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setOrganization(null);
        setLoading(false);
        return;
      }

      const response = await fetch('/api/organization/current');
      if (response.ok) {
        const data = await response.json();
        setOrganization(data.organization);
      } else {
        setOrganization(null);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganization();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      fetchOrganization();
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <OrganizationContext.Provider
      value={{ organization, loading, refetch: fetchOrganization }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
