import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { applyLang, LanguageContext } from './language';
import { getLang, type Lang } from './state';

/**
 * Al cambiar de idioma, todo lo de dentro se vuelve a montar con la clave del idioma: así se
 * pintan con él hasta las filas que no cambian de datos. Lo que importa (modo, día, estación,
 * escenario) va en la URL y se conserva; lo demás vuelve a empezar.
 */
export function LanguageRoot({ children }: { children: (lang: Lang) => ReactNode }) {
  const [lang, setState] = useState<Lang>(getLang);
  const choose = useCallback((next: Lang) => {
    applyLang(next);
    setState(next);
  }, []);
  const value = useMemo(() => ({ lang, choose }), [lang, choose]);
  return <LanguageContext.Provider value={value}>{children(lang)}</LanguageContext.Provider>;
}
