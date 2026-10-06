import type { TimelinePoint } from '../../api/client';
import { t } from '../../i18n';
import { Term, TermGroup } from '../limits/Notes';
import { OctagonGlyph } from '../stations/OctagonGlyph';
import { formatLocalDay, localClock } from './time';
import { DAY_STEP_MINUTES, SPEEDS, type Replay, type Speed } from './useReplay';
import './replay.css';

export type Mode = 'explore' | 'replay' | 'experiment';

const MODES: readonly Mode[] = ['explore', 'replay', 'experiment'];

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const m = t().modes;
  return (
    <div className="mode-switch" role="group" aria-label={m.label}>
      {MODES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => {
            onChange(value);
          }}
        >
          {m[value]}
        </button>
      ))}
    </div>
  );
}

export function PlayButton({ replay }: { replay: Replay }) {
  const label = replay.playing ? t().replay.pause : t().replay.play;
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
  const m = t().replay;
  const minutes = String(DAY_STEP_MINUTES);
  const label = direction < 0 ? m.stepBack(DAY_STEP_MINUTES) : m.stepForward(DAY_STEP_MINUTES);
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
  const m = t().replay;
  return (
    <label className="speed-select">
      <span className="speed-select__label">{m.speed}</span>
      <select
        value={replay.speed}
        onChange={(e) => {
          replay.setSpeed(e.target.value as Speed);
        }}
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {m.speeds[s]}
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
  onRetry,
}: {
  point: TimelinePoint | undefined;
  toleranceMinutes?: number | null;
  /** Si la línea temporal del día ha fallado: lo dice y deja reintentar, no «cargando» sin fin. */
  onRetry?: (() => void) | undefined;
}) {
  const m = t().replay;
  if (onRetry !== undefined) {
    return (
      <div className="replay-counts replay-counts--note replay-counts--failed" role="alert">
        <p>{m.dayFailed}</p>
        <button type="button" className="button" onClick={onRetry}>
          {t().app.retry}
        </button>
      </div>
    );
  }
  if (point === undefined) {
    return <p className="replay-counts replay-counts--note">{m.loadingDay}</p>;
  }
  if (point.stationsWithData === 0) {
    return <p className="replay-counts replay-counts--note">{m.noData}</p>;
  }
  const list = (
    <ul className="replay-counts">
      <li>
        <OctagonGlyph category="empty" size={16} />
        {m.countEmpty(<strong>{point.stationsEmpty}</strong>)}
      </li>
      <li>
        <OctagonGlyph category="full" size={16} />
        {m.countFull(<strong>{point.stationsFull}</strong>)}
      </li>
      <li className="replay-counts__coverage">
        <Term note={m.withDataNote(String(toleranceMinutes ?? ''))}>
          {m.withData(point.stationsWithData, point.stationsKnown)}
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
