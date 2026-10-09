'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Organization {
  id: string;
  name: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface SubscriptionInfo {
  status: string;
  plan: string;
  interval: string;
  currentPeriodEnd: string | null;
  isActive: boolean;
  isTrial: boolean;
  requiresRenewal: boolean;
}

export interface InvoiceQuotaInfo {
  limit: number;
  used: number;
  remaining: number;
  planName: string;
  periodStart: string | null;
  periodEnd: string | null;
}

interface OrganizationContextType {
  organization: Organization | null;
  subscription: SubscriptionInfo | null;
  invoiceCount: number;
  quota: InvoiceQuotaInfo | null;
  loading: boolean;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType>({
  organization: null,
  subscription: null,
  invoiceCount: 0,
  quota: null,
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
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [quota, setQuota] = useState<InvoiceQuotaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient(); // still needed for onAuthStateChange

  const fetchOrganization = async () => {
    try {
      // Single fetch — avoids redundant supabase.auth.getUser() client call
      const response = await fetch('/api/organization/current');
      if (response.ok) {
        const data = await response.json();
        setOrganization(data.organization);
        setSubscription(data.subscription ?? null);
        setInvoiceCount(data.invoiceCount ?? 0);
        setQuota(data.quota ?? null);
      } else {
        setOrganization(null);
        setSubscription(null);
        setQuota(null);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
      setOrganization(null);
      setSubscription(null);
      setQuota(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganization();
    // onAuthStateChange removed — it was triggering re-fetches on every navigation
    // refetch() is available manually when needed (e.g. after login/logout)
  }, []);

  return (
    <OrganizationContext.Provider
      value={{
        organization,
        subscription,
        invoiceCount,
        quota,
        loading,
        refetch: fetchOrganization,
      }}
    >
      {children}
    </OrganizationContext.Provider>
  );
}
