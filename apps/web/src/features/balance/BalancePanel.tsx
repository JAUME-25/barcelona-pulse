import { t } from '../../i18n';
import { formatLocalDay } from '../history/time';
import { stationName } from '../stations/names';
import {
  clocksAfter,
  clocksBefore,
  signed,
  signedDecimal,
  storyDistricts,
  type Balance,
  type BalanceBand,
  type BalanceRow,
} from './balance';
import './balance.css';

interface BarRow {
  key: string;
  name: string;
  /** El idioma del nombre si no es el de la interfaz (los distritos van en catalán). */
  lang?: string;
  stations: number;
  net: number;
  perStation: number;
}

/** Barras divergentes: pérdidas a la izquierda y ganancias a la derecha, en bicis por estación. */
function Bars({ rows }: { rows: readonly BarRow[] }) {
  const m = t().balance;
  const max = Math.max(0, ...rows.map((r) => Math.abs(r.perStation)));
  return (
    <ol className="balance-bars">
      {rows.map((r) => {
        const kind = r.perStation >= 0 ? 'gain' : 'loss';
        const width = max === 0 ? 0 : (Math.abs(r.perStation) / max) * 50;
        return (
          <li key={r.key}>
            <span
              className="balance-bars__name"
              lang={r.lang}
              translate={r.lang === undefined ? undefined : 'no'}
            >
              {r.name}
            </span>
            <span className="balance-bars__track" aria-hidden="true">
              <span
                className={`balance-bars__bar balance-bars__bar--${kind}`}
                style={{ width: `${width.toFixed(1)}%` }}
              />
            </span>
            <span className={`balance-bars__value balance-bars__value--${kind}`}>
              {m.perStation(signedDecimal(r.perStation))}
              <small>{m.districtMeta(r.stations, signed(r.net))}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function bandName(band: BalanceBand): string {
  const m = t().balance.band;
  if (band.key === 'low') return m.low(band.max ?? 0);
  if (band.key === 'high') return m.high(band.min ?? 0);
  return m.mid(band.min ?? 0, band.max ?? 0);
}

interface BalancePanelProps {
  days: readonly string[];
  day: string;
  from: string;
  to: string;
  onDay: (day: string) => void;
  onFrom: (clock: string) => void;
  onTo: (clock: string) => void;
  /** Null mientras llega el momento de partida. */
  balance: Balance | null;
  failed: boolean;
  onRetry: () => void;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

/** Las opciones de un selector de hora, con la hora actual aunque no caiga en la media hora. */
function withCurrent(clocks: readonly string[], current: string): string[] {
  return clocks.includes(current) ? [...clocks] : [...clocks, current].sort();
}

function Row({
  row,
  current,
  onSelect,
}: {
  row: BalanceRow;
  current: boolean;
  onSelect: (id: number) => void;
}) {
  const m = t().balance;
  const { station, delta } = row;
  const place = station.neighbourhood;
  return (
    <li>
      <button
        type="button"
        className="station-list__item"
        data-station-id={station.id}
        aria-current={current ? 'true' : undefined}
        onClick={() => {
          onSelect(station.id);
        }}
      >
        <span className="station-list__text">
          <span className="station-list__name" lang="ca" translate="no">
            {stationName(station)}
          </span>
          <span className="station-list__summary">
            {place !== null && (
              <span lang="ca" translate="no">
                {place} ·{' '}
              </span>
            )}
            <span className="balance__arrow">
              {m.place(row.before ?? 0, row.after ?? 0, station.capacity)}
            </span>
            <span className="visually-hidden"> {m.unit}</span>
          </span>
        </span>
        <span className="station-list__figures">
          <span className="station-list__figure">
            <span
              className={`station-list__number balance__num balance__num--${delta !== null && delta < 0 ? 'loss' : 'gain'}`}
            >
              {signed(delta ?? 0)}
            </span>
            <span className="station-list__unit">{m.unit}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * El panel de «Balance»: el día y las dos horas, los totales, los distritos con barras
 * divergentes (por estación, para comparar distritos de distinto tamaño) y las estaciones que
 * más se llenan y más se vacían. Cada estación abre su ficha del segundo momento.
 */
export function BalancePanel({
  days,
  day,
  from,
  to,
  onDay,
  onFrom,
  onTo,
  balance,
  failed,
  onRetry,
  selectedId,
  onSelect,
}: BalancePanelProps) {
  const m = t().balance;
  const story = balance === null ? null : storyDistricts(balance.districts);

  return (
    <section className="balance" aria-label={m.title}>
      <h2 className="visually-hidden">{m.title}</h2>
      <div className="balance__when">
        <label className="list-order">
          <span>{m.day}</span>
          <select
            className="balance__day"
            value={day}
            onChange={(e) => {
              onDay(e.target.value);
            }}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {formatLocalDay(d)}
              </option>
            ))}
          </select>
        </label>
        <span className="balance__range list-order">
          <label>
            <span>{m.from} </span>
            <select
              className="balance__from"
              value={from}
              onChange={(e) => {
                onFrom(e.target.value);
              }}
            >
              {withCurrent(clocksBefore(to), from).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{m.to} </span>
            <select
              className="balance__to"
              value={to}
              onChange={(e) => {
                onTo(e.target.value);
              }}
            >
              {withCurrent(clocksAfter(from), to).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </span>
      </div>
      <p className="balance__hint">{m.hint(from, to)}</p>

      {failed ? (
        <div className="panel-status" role="alert">
          <p>{m.failed}</p>
          <button type="button" className="button" onClick={onRetry}>
            {t().app.retry}
          </button>
        </div>
      ) : balance === null ? (
        <p className="panel-status" role="status">
          {m.loading}
        </p>
      ) : balance.known === 0 ? (
        <p className="panel-status" role="status">
          {m.none}
        </p>
      ) : (
        <>
          <div className="balance__totals">
            <div className="balance__total balance__total--gain">
              <span className="balance__big">{signed(balance.gained)}</span>
              <span className="balance__what">{m.gained(balance.counts.gain)}</span>
            </div>
            <div className="balance__total balance__total--loss">
              <span className="balance__big">{signed(balance.lost)}</span>
              <span className="balance__what">{m.lost(balance.counts.loss)}</span>
            </div>
          </div>
          <p className="balance__rest">
            {m.rest(
              balance.counts.same,
              balance.counts.nodata,
              balance.known,
              balance.bikesBefore,
              balance.bikesAfter,
            )}
          </p>
          {story !== null && (story.gainers.length > 0 || story.losers.length > 0) && (
            <p className="balance__story">{m.story(story.gainers, story.losers)}</p>
          )}
          {balance.districts.length > 0 && (
            <>
              <h3 className="balance__h">{m.byDistrict}</h3>
              <Bars rows={balance.districts.map((d) => ({ ...d, lang: 'ca' }))} />
            </>
          )}
          {balance.altitudeBands.length > 0 && (
            <>
              <h3 className="balance__h">{m.byAltitude}</h3>
              <Bars rows={balance.altitudeBands.map((b) => ({ ...b, name: bandName(b) }))} />
              <p className="balance__hint">{m.altitudeNote}</p>
            </>
          )}
          {balance.topGain.length > 0 && (
            <>
              <h3 className="balance__h">{m.topGain}</h3>
              <ul className="station-list">
                {balance.topGain.map((row) => (
                  <Row
                    key={row.station.id}
                    row={row}
                    current={row.station.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </>
          )}
          {balance.topLoss.length > 0 && (
            <>
              <h3 className="balance__h">{m.topLoss}</h3>
              <ul className="station-list">
                {balance.topLoss.map((row) => (
                  <Row
                    key={row.station.id}
                    row={row}
                    current={row.station.id === selectedId}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
