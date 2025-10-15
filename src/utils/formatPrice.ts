export type FormatPriceOptions = {
  locale?: string;
  currency?: string;
  accounting?: boolean; // negativos con paréntesis
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

/**
 * Formatea valores monetarios con separador de miles y millones.
 * Estilo contable opcional (negativos entre paréntesis).
 */
export function formatPriceAccounting(
  amount: number | string,
  options: FormatPriceOptions = {}
): string {
  const n = Number(amount ?? 0);
  const locale = options.locale ?? "es-CO";
  const currency = options.currency ?? "COP";
  const minimumFractionDigits = options.minimumFractionDigits ?? 2;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  const accounting = options.accounting ?? true;

  const fmt = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "symbol",
    minimumFractionDigits,
    maximumFractionDigits,
  });

  if (n < 0 && accounting) {
    // Formato contable: (valor)
    return `(${fmt.format(Math.abs(n))})`;
  }
  return fmt.format(n);
}