import { useMemo } from 'react';
import type { TimelinePoint } from '../../api/client';
import { dayLabel, weekScale } from './controls';
import { dialPaths, type DialShape } from './dial';
import { dayOfMonth, formatShortWeekday } from './time';
import type { Replay } from './useReplay';

/** 44 px de lado; la semana se pide por horas: 24 barras por banda. */
const MINI: DialShape = { c: 22, emptyR: 6, fullR: 14, band: 7, stepAngle: (2 * Math.PI) / 24 };

function MiniDial({
  points,
  scale,
}: {
  points: readonly TimelinePoint[] | undefined;
  scale: number;
}) {
  const paths = useMemo(
    () => (points === undefined ? null : dialPaths(points, scale, MINI)),
    [points, scale],
  );
  return (
    <svg
      className="week-dial"
      width="44"
      height="44"
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
    >
      {paths === null ? (
        <>
          <circle cx={MINI.c} cy={MINI.c} r={MINI.emptyR} className="week-dial__gap" />
          <circle cx={MINI.c} cy={MINI.c} r={MINI.fullR} className="week-dial__gap" />
        </>
      ) : (
        <>
          <path d={paths.rings} className="week-dial__ring" />
          <path d={paths.gaps} className="week-dial__gap" />
          <path d={paths.empty} className="week-dial__empty" />
          <path d={paths.full} className="week-dial__full" />
        </>
      )}
    </svg>
  );
}

/**
 * La semana en relojes de 24 horas, uno por día, con la misma escala y los mismos colores que
 * el gráfico del día: sirven para ver el patrón de cada día y para elegirlo.
 */
export function WeekDials({ replay }: { replay: Replay }) {
  const scale = weekScale(replay);
  return (
    <div className="week-dials" role="group" aria-label="Día">
      {replay.days.map((d) => (
        <button
          key={d}
          type="button"
          className="week-dials__day"
          aria-pressed={d === replay.day}
          aria-label={dayLabel(d)}
          onClick={() => {
            replay.selectDay(d);
          }}
        >
          <MiniDial points={replay.weekByDay.get(d)} scale={scale} />
          <span aria-hidden="true">
            {formatShortWeekday(d)}
            <br />
            {dayOfMonth(d)}
          </span>
        </button>
      ))}
    </div>
  );
}
