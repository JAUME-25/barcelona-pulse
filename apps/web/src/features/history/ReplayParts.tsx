import type { TimelinePoint } from '../../api/client';
import { Term, TermGroup } from '../limits/Notes';
import { OctagonGlyph } from '../stations/OctagonGlyph';
import { formatLocalDay, localClock } from './time';
import { DAY_STEP_MINUTES, SPEED_LABEL, SPEEDS, type Replay, type Speed } from './useReplay';
import './replay.css';

export type Mode = 'explore' | 'replay' | 'experiment';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'explore', label: 'Explorar' },
  { mode: 'replay', label: 'Reproducir' },
  { mode: 'experiment', label: 'Experimentar' },
];

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="mode-switch" role="group" aria-label="Modo">
      {MODES.map((m) => (
        <button
          key={m.mode}
          type="button"
          aria-pressed={mode === m.mode}
          onClick={() => {
            onChange(m.mode);
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function PlayButton({ replay }: { replay: Replay }) {
  const label = replay.playing ? 'Pausar' : 'Reproducir el día';
  return (
    <button
      type="button"
      className="play-button"
      aria-label={label}
      title={label}
      disabled={replay.points.length === 0}
      onClick={replay.togglePlay}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        {replay.playing ? (
          <path d="M6.5 5h4v14h-4zM13.5 5h4v14h-4z" fill="currentColor" />
        ) : (
          <path d="M8 4.8v14.4L19.2 12z" fill="currentColor" />
        )}
      </svg>
    </button>
  );
}

/** Un paso atrás o adelante: para examinar un cambio concreto. */
export function StepButton({ replay, direction }: { replay: Replay; direction: -1 | 1 }) {
  const minutes = String(DAY_STEP_MINUTES);
  const label = direction < 0 ? `${minutes} minutos antes` : `${minutes} minutos después`;
  const atEdge = direction < 0 ? replay.index <= 0 : replay.index >= replay.points.length - 1;
  return (
    <button
      type="button"
      className="step-button"
      aria-label={label}
      title={label}
      disabled={replay.points.length === 0 || atEdge}
      onClick={() => {
        replay.seek(replay.index + direction);
      }}
    >
      {direction < 0 ? `−${minutes} min` : `+${minutes} min`}
    </button>
  );
}

export function SpeedSelect({ replay }: { replay: Replay }) {
  return (
    <label className="speed-select">
      <span className="speed-select__label">Velocidad</span>
      <select
        value={replay.speed}
        onChange={(e) => {
          replay.setSpeed(e.target.value as Speed);
        }}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {SPEED_LABEL[s]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Clock({ replay }: { replay: Replay }) {
  const { point, day } = replay;
  return (
    <p className="replay-clock">
      <time className="replay-clock__time" dateTime={point?.at}>
        {point === undefined ? '--:--' : localClock(point.at)}
      </time>
      <span className="replay-clock__day">{day === null ? '' : formatLocalDay(day)}</span>
    </p>
  );
}

/**
 * Recuentos del momento. «Con dato» lleva su nota: quién cuenta y quién no (las que no
 * informaron no son vacías ni llenas).
 */
export function Counts({
  point,
  toleranceMinutes = null,
}: {
  point: TimelinePoint | undefined;
  toleranceMinutes?: number | null;
}) {
  if (point === undefined) {
    return <p className="replay-counts replay-counts--note">Cargando el día…</p>;
  }
  if (point.stationsWithData === 0) {
    return (
      <p className="replay-counts replay-counts--note">
        Sin datos en este momento: ninguna estación había informado.
      </p>
    );
  }
  const list = (
    <ul className="replay-counts">
      <li>
        <OctagonGlyph category="empty" size={16} />
        <strong>{point.stationsEmpty}</strong> sin bicis
      </li>
      <li>
        <OctagonGlyph category="full" size={16} />
        <strong>{point.stationsFull}</strong> llenas
      </li>
      <li className="replay-counts__coverage">
        <Term
          note={`Las que informaron en los ${String(toleranceMinutes ?? '')} minutos anteriores. Las demás no cuentan como vacías ni como llenas.`}
        >
          {point.stationsWithData} de {point.stationsKnown} con dato
        </Term>
      </li>
    </ul>
  );
  return toleranceMinutes === null ? (
    list
  ) : (
    <TermGroup className="replay-counts-group">{list}</TermGroup>
  );
}
