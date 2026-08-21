'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { X, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';

const ONBOARDING_KEY = 'invoiceflow_onboarding_completed';

interface Step {
  target: string | null;
  title: string;
  description: string;
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    target: null,
    title: '¡Bienvenido a FactuMeIA!',
    description:
      'Gestiona tus facturas de forma inteligente con IA. Extrae datos automáticamente, recibe alertas de vencimiento y mantén todo organizado en un solo lugar.',
    position: 'center',
  },
  {
    target: 'dashboard-stats',
    title: 'Panel Principal',
    description:
      'Aquí verás un resumen de tus facturas, montos totales y proveedores activos. Ideal para tener una visión rápida de tus finanzas.',
    position: 'bottom',
  },
  {
    target: 'sidebar-facturas',
    title: 'Tus Facturas',
    description:
      'Desde esta sección puedes ver, filtrar y buscar todas tus facturas. Cada factura se procesa con IA para extraer proveedor, NIT, fechas y montos.',
    position: 'right',
  },
  {
    target: 'upload-invoice',
    title: 'Subir Facturas',
    description:
      'Sube facturas en PDF o imagen. La inteligencia artificial extraerá automáticamente los datos clave sin que tengas que escribir nada.',
    position: 'bottom',
  },
  {
    target: 'sidebar-config',
    title: 'Configuración',
    description:
      'Conecta tu correo electrónico (Gmail/Outlook) para recibir facturas automáticamente. También puedes vincular Google Drive o OneDrive.',
    position: 'right',
  },
  {
    target: 'theme-toggle',
    title: 'Modo Oscuro',
    description:
      '¿Prefieres el tema oscuro? Haz clic aquí para cambiar entre modo claro y oscuro cuando quieras.',
    position: 'top',
  },
  {
    target: null,
    title: '¡Todo listo!',
    description:
      'Ya conoces lo esencial. Comienza subiendo tu primera factura o conectando tu correo para automatizar todo. Tu periodo de prueba de 30 días comienza ahora.',
    position: 'center',
  },
];

function useTargetRect(target: string | null) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      if (!target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(`[data-onboarding="${target}"]`) as HTMLElement | null;
      if (el) {
        setRect(el.getBoundingClientRect());
      }
    };

    update();

    const onResize = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);

    const interval = setInterval(update, 500);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
      clearInterval(interval);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target]);

  return rect;
}

function getTooltipStyle(
  rect: DOMRect,
  position: Step['position']
): React.CSSProperties | null {
  const gap = 16;
  const maxWidth = 360;

  switch (position) {
    case 'bottom':
      return {
        top: rect.bottom + gap,
        left: Math.max(16, rect.left + rect.width / 2 - maxWidth / 2),
        maxWidth,
      };
    case 'top':
      return {
        top: rect.top - gap,
        left: Math.max(16, rect.left + rect.width / 2 - maxWidth / 2),
        maxWidth,
        transform: 'translateY(-100%)',
      };
    case 'right':
      return {
        top: Math.max(16, rect.top + rect.height / 2),
        left: rect.right + gap,
        maxWidth,
        transform: 'translateY(-50%)',
      };
    case 'left':
      return {
        top: Math.max(16, rect.top + rect.height / 2),
        left: Math.max(16, rect.left - maxWidth - gap),
        maxWidth,
        transform: 'translateY(-50%)',
      };
    default:
      return null;
  }
}

export function OnboardingTour() {
  const [stepIndex, setStepIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const step = STEPS[stepIndex];
  const targetRect = useTargetRect(step.target);

  useEffect(() => {
    setMounted(true);
    const completed = localStorage.getItem(ONBOARDING_KEY);
    if (!completed) {
      setIsVisible(true);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isVisible, stepIndex]);

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((s) => s + 1);
    } else {
      finish();
    }
  }, [stepIndex]);

  const goPrev = useCallback(() => {
    if (stepIndex > 0) setStepIndex((s) => s - 1);
  }, [stepIndex]);

  function finish() {
    localStorage.setItem(ONBOARDING_KEY, 'true');
    setIsVisible(false);
    document.body.style.overflow = '';
  }

  if (!mounted || !isVisible) return null;

  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;
  const isCentered = step.position === 'center';
  const tooltipStyle = targetRect ? getTooltipStyle(targetRect, step.position) : null;

  return (
    <>
      {/* Spotlight ring */}
      {targetRect && !isCentered && (
        <div
          className="fixed z-50 pointer-events-none rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent animate-pulse"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      {/* Tooltip */}
      <div
        className={`fixed z-50 ${isCentered ? 'inset-0 flex items-center justify-center p-4' : ''}`}
      >
        {isCentered ? (
          <div className="fixed inset-0 z-40 bg-black/60" onClick={finish} />
        ) : tooltipStyle ? (
          <div
            className="fixed z-40 bg-black/60"
            style={{
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              clipPath: `polygon(
                0% 0%, 0% 100%,
                ${targetRect!.left}px 100%, ${targetRect!.left}px ${targetRect!.top}px,
                ${targetRect!.right}px ${targetRect!.top}px, ${targetRect!.right}px ${targetRect!.bottom}px,
                ${targetRect!.left}px ${targetRect!.bottom}px, ${targetRect!.left}px 100%,
                100% 100%, 100% 0%
              )`,
            }}
            onClick={finish}
          />
        ) : (
          <div className="fixed inset-0 z-40 bg-black/60" onClick={finish} />
        )}

        <Card
          className={`relative z-50 shadow-2xl animate-in fade-in zoom-in-95 duration-200 ${
            isCentered ? 'w-full max-w-md' : 'fixed'
          }`}
          style={isCentered ? undefined : (tooltipStyle ?? undefined)}
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                {isCentered && stepIndex === 0 && (
                  <span className="text-2xl">👋</span>
                )}
                {isCentered && isLast && (
                  <CheckCircle className="h-6 w-6 text-green-500" />
                )}
                <h3 className="text-lg font-bold">{step.title}</h3>
              </div>
              <button
                onClick={finish}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Cerrar tour"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {step.description}
            </p>

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      i === stepIndex
                        ? 'w-6 bg-primary'
                        : i < stepIndex
                          ? 'w-1.5 bg-primary/40'
                          : 'w-1.5 bg-muted-foreground/30'
                    }`}
                  />
                ))}
              </div>
              <div className="flex gap-2">
                {!isFirst && (
                  <Button variant="ghost" size="sm" onClick={goPrev}>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Atrás
                  </Button>
                )}
                <Button size="sm" onClick={goNext}>
                  {isLast ? 'Comenzar' : 'Siguiente'}
                  {!isLast && <ChevronRight className="h-4 w-4 ml-1" />}
                </Button>
              </div>
            </div>

            {!isFirst && (
              <button
                onClick={finish}
                className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
              >
                Saltar tour
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
