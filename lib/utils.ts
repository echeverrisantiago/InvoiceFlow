import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatShortDate(date: Date | string): string {
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
}

export const invoiceStatusLabels = {
  PROCESSING: 'Procesando',
  EXTRACTED: 'Extraído',
  BACKED_UP: 'Guardado',
  FAILED: 'Error',
  PAID: 'Pagado',
  PENDING: 'Pendiente',
  OVERDUE: 'Vencido',
} as const;

export const invoiceStatusColors = {
  PROCESSING: 'bg-yellow-100 text-yellow-800',
  EXTRACTED: 'bg-blue-100 text-blue-800',
  BACKED_UP: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  PAID: 'bg-orange-100 text-gray-800',
  PENDING: 'bg-orange-100 text-orange-800',
  OVERDUE: 'bg-red-100 text-red-800',
} as const;

export function toDateInputValue(date?: Date | string | null): string {
  if (!date) return '';

  const parsed = new Date(date);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function generateTemporaryPassword(length = 16): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%&*_-+=';
  const all = upper + lower + digits + special;

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  let password = '';
  for (let i = 0; i < length; i++) {
    password += all[array[i] % all.length];
  }

  password += upper[array[0] % upper.length];
  password += lower[array[1] % lower.length];
  password += digits[array[2] % digits.length];
  password += special[array[3] % special.length];

  return password;
}
