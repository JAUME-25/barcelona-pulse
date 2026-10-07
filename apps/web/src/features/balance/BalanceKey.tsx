import { THEME } from '../../app/theme';
import { t } from '../../i18n';
import { MarkerGlyph } from '../stations/OctagonGlyph';
import { BALANCE_KINDS, type BalanceKind } from './balance';
import './balance.css';

/** El dibujo de cada clase en la clave: el mismo que en el mapa, con su tamaño relativo. */
function glyphOf(kind: BalanceKind) {
  switch (kind) {
    case 'gain':
      return <MarkerGlyph style={THEME.balance.gain} size={22} />;
    case 'loss':
      return <MarkerGlyph style={THEME.balance.loss} size={22} />;
    case 'same':
      return <MarkerGlyph style={THEME.balance.same} size={22} scale={0.6} />;
    case 'nodata':
      return <MarkerGlyph style={THEME.markers.unknown} size={22} scale={0.7} />;
  }
}

/**
 * La clave del balance, en la leyenda del mapa: qué dicen forma, color y tamaño, y cuántas
 * estaciones hay de cada clase. Sin recuentos mientras llega el momento de partida.
 */
export function BalanceKey({
  counts,
  from,
  to,
}: {
  counts: Record<BalanceKind, number> | null;
  from: string;
  to: string;
}) {
  const m = t().balance.key;
  return (
    <div className="balance-key__box">
      <p className="balance-key__title">{m.title(from, to)}</p>
      <ul className="balance-key">
        {BALANCE_KINDS.map((kind) => (
          <li key={kind}>
            {glyphOf(kind)}
            <span>{m[kind]}</span>
            <span className="balance-key__count">{counts === null ? '…' : counts[kind]}</span>
          </li>
        ))}
      </ul>
      <p className="balance-key__hint">{m.hint}</p>
    </div>
  );
}
