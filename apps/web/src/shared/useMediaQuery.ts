import { useEffect, useState } from 'react';

/**
 * Si la ventana cumple una consulta de medios ahora, y cada vez que cambie. Sin `matchMedia`
 * (jsdom en las pruebas), no la cumple.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const update = () => {
      setMatches(list.matches);
    };
    list.addEventListener('change', update);
    return () => {
      list.removeEventListener('change', update);
    };
  }, [query]);
  return matches;
}

/** Móvil: la distribución apilada, por debajo del punto de corte de `App.css`. */
export const MOBILE_QUERY = '(max-width: 767px)';
