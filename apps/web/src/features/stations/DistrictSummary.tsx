import { useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { totalRow, type DistrictRow } from './districts';
import { OctagonGlyph } from './OctagonGlyph';
import './districts.css';

interface DistrictProps {
  rows: readonly DistrictRow[];
  /** Distrito elegido (clave de la fuente), o null si se ven todos. */
  active: string | null;
  onPick: (key: string | null) => void;
}

const ALL = '*';
/** Si la tabla está plegada: una comodidad de cada navegador, no un estado de la aplicación. */
const OPEN_KEY = 'bp.districts.open';

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== 'closed';
  } catch {
    return true;
  }
}

function writeOpen(open: boolean): void {
  try {
    localStorage.setItem(OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // Sin almacenamiento (ventana privada): no se recuerda y ya está.
  }
}

/** Una cifra de vacías o llenas; si en el distrito nadie informó, no se dice ni cero. */
function Figure({ value, known }: { value: number; known: number }) {
  return known === 0 ? <span className="district-table__dash">–</span> : <>{value}</>;
}

function Head({ glyph, text }: { glyph?: ReactNode; text: string }) {
  return (
    <th scope="col">
      <span className="district-table__head">
        {glyph}
        <span className="district-table__head-text">{text}</span>
      </span>
    </th>
  );
}

/**
 * La tabla: una fila por distrito y la suma arriba. Estaciones, sin bicis, llenas y, aparte,
 * sin dato, que no cuenta como vacía. El nombre de cada fila es un botón que filtra la lista y
 * el mapa (pulsado otra vez, deja de filtrar); el elegido va en negrita, ámbar y con una marca.
 */
export function DistrictTable({ rows, active, onPick }: DistrictProps) {
  const m = t().districts;
  const all = [totalRow(rows), ...rows];
  return (
    <table className="district-table">
      <thead>
        <tr>
          <Head text={m.label} />
          <Head text={m.stations} />
          <Head glyph={<OctagonGlyph category="empty" size={16} />} text={m.empty} />
          <Head glyph={<OctagonGlyph category="full" size={16} />} text={m.full} />
          <Head glyph={<OctagonGlyph category="unknown" size={16} />} text={m.unknown} />
        </tr>
      </thead>
      <tbody>
        {all.map((r) => {
          const key = r.key === ALL ? null : r.key;
          const current = active === key;
          return (
            <tr
              key={r.key}
              className={r.key === ALL ? 'district-table__total' : undefined}
              data-active={current && key !== null ? 'true' : undefined}
            >
              <th scope="row">
                <button
                  type="button"
                  className="district-table__pick"
                  aria-pressed={current}
                  // Los distritos van en catalán, como los publica la fuente; «Toda la ciudad», no.
                  lang={key === null ? undefined : 'ca'}
                  translate={key === null ? undefined : 'no'}
                  onClick={() => {
                    onPick(key);
                  }}
                >
                  {r.name}
                </button>
              </th>
              <td>{r.stations}</td>
              <td>
                <Figure value={r.empty} known={r.known} />
              </td>
              <td>
                <Figure value={r.full} known={r.known} />
              </td>
              <td>{r.unknown}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * El resumen por distrito del momento mostrado (elegido el 7-10-2026 entre tres propuestas): la
 * tabla bajo la búsqueda, plegable para llegar a la lista sin pasar por sus filas, y se
 * recuerda si se plegó. Al reproducir cambia a cada paso sin anunciarse, como el recuento.
 */
export function DistrictSummary(props: DistrictProps) {
  const m = t().districts;
  const [open, setOpen] = useState(readOpen);
  return (
    <details
      className="district-section"
      open={open}
      onToggle={(e) => {
        const next = e.currentTarget.open;
        if (next === open) return;
        setOpen(next);
        writeOpen(next);
      }}
    >
      <summary className="district-section__summary">
        <h2 className="list-title district-section__title">{m.title}</h2>
      </summary>
      <div aria-live="off">
        <DistrictTable {...props} />
      </div>
      <p className="district-note">{m.note}</p>
    </details>
  );
}
