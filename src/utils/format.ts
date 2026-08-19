/**
 * Formatting utilities for currency, gold, and dates.
 */

export const formatCash = (amount: number): string => {
  if (amount === 0) return '₹0';
  return `₹${amount.toLocaleString('en-IN')}`;
};

export const formatGold = (weight: number): string => {
  if (weight === 0) return '0 g';
  return `${weight % 1 === 0 ? weight : weight.toFixed(2)} g`;
};

export const formatDate = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
};

export const formatDateTime = (isoDate?: string | null): string => {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoDate ?? '';
  }
};

export const isoToDateInput = (iso?: string): string => {
  if (!iso) return '';
  return iso.split('T')[0];
};

export const dateInputToISO = (dateStr: string): string => {
  if (!dateStr) return new Date().toISOString();
  return new Date(dateStr).toISOString();
};
