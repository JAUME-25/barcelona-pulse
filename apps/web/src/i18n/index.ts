import { ca } from './ca';
import { en } from './en';
import { es, type Messages } from './es';
import { getLang, type Lang } from './state';

export type { Messages } from './es';
export { detectLang, getLang, intlLocale, isLang, LANG_PARAM, LANGS, setLang } from './state';
export type { Lang } from './state';

const MESSAGES: Record<Lang, Messages> = { es, ca, en };

/** Los textos del idioma de la interfaz. Se lee al pintar: al cambiar de idioma se vuelve a montar. */
export function t(): Messages {
  return MESSAGES[getLang()];
}

/** Nombre de cada idioma en su propio idioma, para el selector. */
export const LANG_NAMES: Record<Lang, string> = { es: 'Español', ca: 'Català', en: 'English' };
