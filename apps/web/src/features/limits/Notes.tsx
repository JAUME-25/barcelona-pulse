import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react';
import type { TimelinePoint } from '../../api/client';
import { t } from '../../i18n';
import { gapText } from './limits';
import './limits.css';

interface TermGroupState {
  open: string | null;
  noteId: string;
  toggle: (note: string) => void;
  close: () => void;
}

const TermGroupContext = createContext<TermGroupState | null>(null);

/**
 * Bloque con palabras que llevan nota (subrayadas con puntos). La nota abierta sale debajo del
 * bloque entero: no parte la frase ni tapa nada.
 */
export function TermGroup({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const noteId = useId();
  const value = useMemo<TermGroupState>(
    () => ({
      open,
      noteId,
      toggle: (note) => {
        setOpen((current) => (current === note ? null : note));
      },
      close: () => {
        setOpen(null);
      },
    }),
    [open, noteId],
  );
  return (
    <div className={className === undefined ? 'term-group' : `term-group ${className}`}>
      <TermGroupContext.Provider value={value}>{children}</TermGroupContext.Provider>
      {open !== null && (
        <p id={noteId} className="term-note" role="note">
          {open}
        </p>
      )}
    </div>
  );
}

/** Palabra con nota: al pulsarla se abre (o se cierra) debajo de su bloque. Fuera de un grupo, solo el texto. */
export function Term({ children, note }: { children: ReactNode; note: string }) {
  const group = useContext(TermGroupContext);
  if (group === null) return <>{children}</>;
  const expanded = group.open === note;
  return (
    <button
      type="button"
      className="term"
      aria-expanded={expanded}
      aria-controls={expanded ? group.noteId : undefined}
      onClick={() => {
        group.toggle(note);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') group.close();
      }}
    >
      {children}
    </button>
  );
}

/** En «Experimentar», junto al resultado: qué mide el porcentaje y qué no (supuestos del modelo). */
export function ScopeNotes() {
  const m = t().scope;
  return (
    <TermGroup className="scope-notes">
      <p className="scope-notes__terms">
        <Term note={m.straight.note}>{m.straight.term}</Term>
        <Term note={m.surface.note}>{m.surface.term}</Term>
        <Term note={m.trips.note}>{m.trips.term}</Term>
      </p>
    </TermGroup>
  );
}

/** Bajo la pista de «Reproducir»: a qué horas faltan datos ese día, si faltan. */
export function GapCaption({ points }: { points: readonly TimelinePoint[] }) {
  const text = useMemo(() => gapText(points), [points]);
  if (text === null) return null;
  return <p className="gap-caption">{text}</p>;
}
