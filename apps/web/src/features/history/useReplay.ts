import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SourceSummary, TimelinePoint } from '../../api/client';
import { writeParam } from '../../shared/url';
import { useTimeline, type TimelineRange } from '../stations/useStationData';
import { byLocalDay } from './series';
import { addDays, lastLocalDays, localClock, localMidnight, weekDates, weekStart } from './time';

/** Paso de la reproducción de un día: 288 pasos en un día normal. */
export const DAY_STEP_MINUTES = 5;
export const STEPS_PER_HOUR = 60 / DAY_STEP_MINUTES;
/** La semana se pide por horas: basta para el resumen de cada día. */
const WEEK_STEP_MINUTES = 60;
const MAX_DAYS = 7;

export type Speed = 'lenta' | 'normal' | 'rapida';
export const SPEEDS: readonly Speed[] = ['lenta', 'normal', 'rapida'];
export const SPEED_LABEL: Record<Speed, string> = {
  lenta: 'Lenta',
  normal: 'Normal',
  rapida: 'Rápida',
};
/**
 * Milisegundos por paso de 5 minutos: un día entero en 3 min 22 s, 1 min 41 s o 43 s. Los
 * estados llegan en fotogramas de una hora (`useFrames`): a la velocidad más alta son unas 33
 * peticiones por minuto, lejos del límite de 120 de la API.
 */
const SPEED_MS: Record<Speed, number> = { lenta: 700, normal: 350, rapida: 150 };

const NO_POINTS: readonly TimelinePoint[] = [];

function rangeOfDays(first: string, last: string, stepMinutes: number): TimelineRange {
  return {
    from: new Date(localMidnight(first)).toISOString(),
    to: new Date(localMidnight(addDays(last, 1)) - stepMinutes * 60_000).toISOString(),
    stepMinutes,
  };
}

/** Paso inicial: la hora pedida en la URL o, si no, el primer paso con datos. */
function initialIndex(points: readonly TimelinePoint[], time: string | null): number {
  if (time !== null) {
    const exact = points.findIndex((p) => localClock(p.at) === time);
    if (exact >= 0) return exact;
  }
  return Math.max(
    0,
    points.findIndex((p) => p.stationsWithData > 0),
  );
}

/**
 * Días que se pueden reproducir: los que cubren las ingestas de la fuente. Una base anterior a
 * ese dato no los tiene: entonces, los últimos días de su periodo.
 */
function availableDays(source: SourceSummary | undefined): string[] {
  if (source === undefined) return [];
  if (source.days.length > 0) return source.days;
  const period = source.period;
  return period === null ? [] : lastLocalDays(period.from, period.to, MAX_DAYS);
}

/**
 * Estado de la reproducción de un día de una fuente: días disponibles, semana del día elegido,
 * línea temporal del día (cada 5 min) y de la semana (cada hora), paso actual y reproducción
 * con pausa. Sin fuente no pide nada. Si `stalled` se activa (no llega el estado de las
 * estaciones), la reproducción se para en vez de seguir con el mapa congelado.
 */
export function useReplay(
  source: SourceSummary | undefined,
  initialDay: string | null,
  initialTime: string | null,
  stalled?: { readonly current: boolean },
) {
  const days = useMemo(() => availableDays(source), [source]);
  const [chosenDay, setChosenDay] = useState(initialDay);
  const day = chosenDay !== null && days.includes(chosenDay) ? chosenDay : (days.at(-1) ?? null);
  const sourceId = source?.id ?? null;

  // La semana (de lunes a domingo) del día elegido, con los días sin datos a la vista.
  const monday = day === null ? null : weekStart(day);
  const week = useMemo(() => (monday === null ? [] : weekDates(monday)), [monday]);
  const previousWeekDay = monday === null ? undefined : days.findLast((d) => d < monday);
  const nextWeekDay = monday === null ? undefined : days.find((d) => d > addDays(monday, 6));

  const dayRange = useMemo(
    () => (day === null ? null : rangeOfDays(day, day, DAY_STEP_MINUTES)),
    [day],
  );
  const weekRange = useMemo(
    () => (monday === null ? null : rangeOfDays(monday, addDays(monday, 6), WEEK_STEP_MINUTES)),
    [monday],
  );
  const { state: dayState, retry: retryDay } = useTimeline(sourceId, dayRange);
  const { state: weekState } = useTimeline(sourceId, weekRange);

  const points = dayState.status === 'ready' ? dayState.data.points : NO_POINTS;
  const weekPoints = weekState.status === 'ready' ? weekState.data.points : NO_POINTS;
  const weekByDay = useMemo(() => byLocalDay(weekPoints), [weekPoints]);

  const [time] = useState(initialTime);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const fallbackIndex = useMemo(() => initialIndex(points, time), [points, time]);
  const count = points.length;
  const index = count === 0 ? -1 : Math.min(chosenIndex ?? fallbackIndex, count - 1);
  const point = index >= 0 ? points[index] : undefined;

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  });

  useEffect(() => {
    if (!playing || count === 0) return;
    const timer = window.setInterval(() => {
      const current = indexRef.current;
      if (stalled?.current === true || current >= count - 1) {
        setPlaying(false);
        return;
      }
      setChosenIndex(current + 1);
    }, SPEED_MS[speed]);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, speed, count, stalled]);

  // La URL guarda el día y la hora al parar, no en cada paso de la reproducción.
  const pausedClock = !playing && point !== undefined ? localClock(point.at) : null;
  useEffect(() => {
    if (pausedClock !== null) writeParam('hora', pausedClock);
  }, [pausedClock]);

  const seek = useCallback(
    (target: number) => {
      if (count === 0) return;
      setChosenIndex(Math.max(0, Math.min(Math.round(target), count - 1)));
    },
    [count],
  );

  const togglePlay = useCallback(() => {
    if (!playing && indexRef.current >= count - 1) setChosenIndex(0);
    setPlaying(!playing);
  }, [playing, count]);

  const selectDay = useCallback((next: string) => {
    setChosenDay(next);
    writeParam('dia', next);
  }, []);

  return {
    days,
    day,
    week,
    previousWeekDay,
    nextWeekDay,
    selectDay,
    dayState,
    retryDay,
    weekState,
    weekByDay,
    points,
    index,
    point,
    seek,
    playing,
    togglePlay,
    speed,
    setSpeed,
  };
}

export type Replay = ReturnType<typeof useReplay>;
