'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { emitNavigating } from '@/lib/navigation-events';

interface InvoicePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

export function InvoicePagination({ currentPage, totalPages, totalCount }: InvoicePaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [targetPage, setTargetPage] = useState<number | null>(null);

  useEffect(() => {
    setTargetPage(null);
  }, [searchParams]);

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(page));
    setTargetPage(page);
    emitNavigating(true);
    startTransition(() => {
      router.push(`/dashboard/invoices?${params.toString()}`);
    });
  }

  if (totalPages <= 1) return null;

  const goingPrev = isPending && targetPage === currentPage - 1;
  const goingNext = isPending && targetPage === currentPage + 1;

  return (
    <div className="flex items-center justify-between pt-4">
      <p className="text-sm text-muted-foreground">
        {totalCount} factura{totalCount !== 1 ? 's' : ''} — Página {currentPage} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || currentPage <= 1}
          onClick={() => goToPage(currentPage - 1)}
        >
          {goingPrev ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <ChevronLeft className="mr-1 h-4 w-4" />
          )}
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || currentPage >= totalPages}
          onClick={() => goToPage(currentPage + 1)}
        >
          Siguiente
          {goingNext ? (
            <Loader2 className="ml-1 h-4 w-4 animate-spin" />
          ) : (
            <ChevronRight className="ml-1 h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
