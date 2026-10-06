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

function WeekArrow({ replay, direction }: { replay: Replay; direction: -1 | 1 }) {
  const target = direction < 0 ? replay.previousWeekDay : replay.nextWeekDay;
  const label = direction < 0 ? 'Semana anterior' : 'Semana siguiente';
  return (
    <button
      type="button"
      className="week-dials__arrow"
      aria-label={label}
      title={label}
      disabled={target === undefined}
      onClick={() => {
        if (target !== undefined) replay.selectDay(target);
      }}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        <path
          d={direction < 0 ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/**
 * La semana del día elegido en relojes de 24 horas, uno por día, con la misma escala y los
 * mismos colores que el gráfico del día: sirven para ver el patrón de cada día y para elegirlo.
 * Los días sin datos importados se ven, pero no se pueden elegir. Si hay más semanas, flechas.
 */
export function WeekDials({ replay }: { replay: Replay }) {
  const scale = weekScale(replay);
  const available = useMemo(() => new Set(replay.days), [replay.days]);
  const moreWeeks = replay.previousWeekDay !== undefined || replay.nextWeekDay !== undefined;
  return (
    <div className="week-dials">
      {moreWeeks && <WeekArrow replay={replay} direction={-1} />}
      <div className="week-dials__days" role="group" aria-label="Día">
        {replay.week.map((d) => {
          const hasData = available.has(d);
          return (
            <button
              key={d}
              type="button"
              className="week-dials__day"
              aria-pressed={d === replay.day}
              aria-label={hasData ? dayLabel(d) : `${dayLabel(d)}, sin datos`}
              title={hasData ? undefined : 'Sin datos importados'}
              disabled={!hasData}
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
          );
        })}
      </div>
      {moreWeeks && <WeekArrow replay={replay} direction={1} />}
    </div>
  );
}
