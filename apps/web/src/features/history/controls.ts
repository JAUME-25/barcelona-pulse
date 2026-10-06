import type { KeyboardEvent } from 'react';
import { t } from '../../i18n';
import { niceMax } from './series';
import { dayOfMonth, formatLocalDay, formatShortWeekday, localClock } from './time';
import { STEPS_PER_HOUR, type Replay } from './useReplay';

/** Lo que lee un lector de pantalla en el control de tiempo. */
export function valueText(replay: Replay): string {
  const m = t().replay;
  const { point, day } = replay;
  if (point === undefined || day === null) return m.valueLoading;
  const moment = `${localClock(point.at)}, ${formatLocalDay(day)}`;
  if (point.stationsWithData === 0) return m.valueNoData(moment);
  return m.value(
    moment,
    point.stationsEmpty,
    point.stationsFull,
    point.stationsWithData,
    point.stationsKnown,
  );
}

/** Teclado de los controles de tiempo: flechas, una hora con Re Pág/Av Pág, inicio y fin. */
export function onTimeKey(replay: Replay, vertical = false) {
  return (e: KeyboardEvent) => {
    const forward = vertical ? 'ArrowDown' : 'ArrowRight';
    const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
    const moves: Record<string, number> = {
      [forward]: 1,
      [backward]: -1,
      PageDown: STEPS_PER_HOUR,
      PageUp: -STEPS_PER_HOUR,
    };
    if (e.key === ' ') {
      e.preventDefault();
      replay.togglePlay();
      return;
    }
    if (e.key === 'Home') replay.seek(0);
    else if (e.key === 'End') replay.seek(replay.points.length - 1);
    else if (e.key in moves) replay.seek(replay.index + (moves[e.key] ?? 0));
    else return;
    e.preventDefault();
  };
}

/** Atributos de un control deslizante de tiempo. */
export function sliderProps(replay: Replay, label: string) {
  return {
    role: 'slider',
    tabIndex: 0,
    'aria-label': label,
    'aria-valuemin': 0,
    'aria-valuemax': Math.max(replay.points.length - 1, 0),
    'aria-valuenow': Math.max(replay.index, 0),
    'aria-valuetext': valueText(replay),
  } as const;
}

/** Escala común a toda la semana: los días se comparan entre sí. */
export function weekScale(replay: Replay): number {
  return niceMax([...replay.weekByDay.values()].flat());
}

/** «jue 20» */
export function dayLabel(day: string): string {
  return `${formatShortWeekday(day)} ${String(dayOfMonth(day))}`;
}
