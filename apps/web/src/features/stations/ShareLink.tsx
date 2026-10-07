import { useEffect, useRef, useState } from 'react';
import { t } from '../../i18n';

const NOTICE_MS = 2500;

type Notice = { kind: 'copied' } | { kind: 'failed'; url: string } | null;

/**
 * «Copiar enlace»: la URL de ahora mismo, que ya lleva el modo, el momento, la estación, el
 * escenario y la cámara. En un teléfono (puntero grueso y `navigator.share`) abre la hoja de
 * compartir; si no, copia al portapapeles y lo dice. Si el navegador no deja copiar, enseña la
 * URL en un campo para copiarla a mano.
 */
export function ShareLink() {
  const m = t().source;
  const [notice, setNotice] = useState<Notice>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const share = async () => {
    const url = window.location.href;
    const coarse =
      typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    if (coarse && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch {
        // Cancelado o no admitido: se intenta copiar.
      }
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ kind: 'copied' });
      timerRef.current = window.setTimeout(() => {
        setNotice(null);
      }, NOTICE_MS);
    } catch {
      setNotice({ kind: 'failed', url });
    }
  };

  return (
    <span className="share-link">
      <button
        type="button"
        className="limits-link"
        onClick={() => {
          void share();
        }}
      >
        {m.share}
      </button>
      <span className="share-link__notice" role="status">
        {notice?.kind === 'copied' ? m.shared : notice?.kind === 'failed' ? m.shareFailed : ''}
      </span>
      {notice?.kind === 'failed' && (
        <input
          className="share-link__url"
          type="text"
          readOnly
          value={notice.url}
          aria-label={m.shareUrl}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
        />
      )}
    </span>
  );
}
