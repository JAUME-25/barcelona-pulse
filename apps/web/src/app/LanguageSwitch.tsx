import { useEffect, useRef } from 'react';
import { LANG_NAMES, LANGS, t } from '../i18n';
import { takeRefocus, useLanguage } from '../i18n/language';

/**
 * ES · CA · EN en la cabecera, a la derecha y en su fila bajo el nombre (opción A, elegida el
 * 6-10-2026 entre tres). Cambiar de idioma vuelve a montar la aplicación; lo que va en la URL se
 * conserva.
 */
export function LanguageSwitch() {
  const { lang, choose } = useLanguage();
  const currentRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (takeRefocus()) currentRef.current?.focus();
  }, []);

  return (
    <div className="lang-switch" role="group" aria-label={t().languages.label}>
      {LANGS.map((l) => (
        <button
          key={l}
          ref={l === lang ? currentRef : undefined}
          type="button"
          lang={l}
          aria-pressed={l === lang}
          aria-label={LANG_NAMES[l]}
          title={LANG_NAMES[l]}
          onClick={() => {
            if (l !== lang) choose(l);
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
