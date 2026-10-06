// Idioma de la interfaz. Va en un módulo aparte y sin dependencias: lo leen tanto los mensajes
// como los formatos de fechas y cifras. Al cambiarlo, la aplicación se vuelve a montar (main.tsx):
// todo lo que se pinta después lo lee de aquí.

export type Lang = 'es' | 'ca' | 'en';
export const LANGS: readonly Lang[] = ['es', 'ca', 'en'];
/** Parámetro de la URL: ?idioma=ca. Con el mismo nombre en los tres idiomas. */
export const LANG_PARAM = 'idioma';

const INTL_LOCALE: Record<Lang, string> = { es: 'es-ES', ca: 'ca-ES', en: 'en-GB' };

let current: Lang = 'es';

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  current = lang;
}

/** Locale para Intl: fechas en hora de Barcelona con los nombres de cada idioma. */
export function intlLocale(): string {
  return INTL_LOCALE[current];
}

export function isLang(value: string | null | undefined): value is Lang {
  return value === 'es' || value === 'ca' || value === 'en';
}

/**
 * El de la URL si lo hay; si no, el primero del navegador que tenga la aplicación. Si el navegador
 * no pide ninguno de los tres (alemán, francés…), inglés: lo entiende más gente que el castellano.
 */
export function detectLang(param: string | null, languages: readonly string[]): Lang {
  if (isLang(param)) return param;
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLang(base)) return base;
  }
  return 'en';
}
