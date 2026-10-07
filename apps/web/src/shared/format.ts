import { t } from '../i18n';
import { numberFormat } from '../i18n/intl';

// Fechas y cifras en el idioma de la interfaz (i18n/intl.ts) y siempre en hora de Barcelona, sea
// cual sea la zona del navegador. Las frases alrededor son de cada idioma (i18n/es.tsx…).
export {
  DISPLAY_TIME_ZONE,
  formatDateTime,
  formatDay,
  formatDayMonth,
  formatTime,
} from '../i18n/intl';

/** «4958» en castellano y catalán, «12,345» en inglés: una cifra entera con el formato del idioma. */
export function formatWhole(n: number): string {
  return numberFormat({ maximumFractionDigits: 0 }).format(n);
}

/** «2 h 15 min», «40 min», «menos de 1 min», «9 días» */
export function formatDuration(fromIso: string, toIso: string): string {
  return t().format.duration(fromIso, toIso);
}

/** «2 anclajes», «1 bici»: el número con la palabra en singular o en plural. */
export function plural(count: number, singular: string, pluralForm: string): string {
  return t().format.count(count, singular, pluralForm);
}

/**
 * Meses que cubren unos días locales («2026-05-04»…): «mayo de 2026», «mayo y agosto de 2026» o
 * «diciembre de 2025 y enero de 2026». Sin días, null.
 */
export function formatMonths(days: readonly string[]): string | null {
  return t().format.months(days);
}
