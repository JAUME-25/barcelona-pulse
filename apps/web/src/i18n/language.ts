import { createContext, useContext } from 'react';
import { writeParam } from '../shared/url';
import { getLang, LANG_PARAM, setLang, type Lang } from './state';

export interface LanguageState {
  lang: Lang;
  choose: (lang: Lang) => void;
}

let refocus = false;

/** Elegir otro idioma: queda en la URL (?idioma=ca) y en el atributo lang de la página. */
export function applyLang(lang: Lang): void {
  setLang(lang);
  writeParam(LANG_PARAM, lang);
  document.documentElement.lang = lang;
  refocus = true;
}

/**
 * Al volver a montar la aplicación en otro idioma, el foco se perdería: el selector lo recupera
 * una sola vez, en el botón del idioma elegido.
 */
export function takeRefocus(): boolean {
  const pending = refocus;
  refocus = false;
  return pending;
}

export const LanguageContext = createContext<LanguageState>({
  lang: getLang(),
  choose: applyLang,
});

export function useLanguage(): LanguageState {
  return useContext(LanguageContext);
}
