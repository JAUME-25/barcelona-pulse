import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SourceSummary, TimelinePoint } from '../../api/client';
import { writeParam } from '../../shared/url';
import { useTimeline, type TimelineRange } from '../stations/useStationData';
import { availableDays, DEFAULT_CLOCK, defaultDay } from './moment';
import { byLocalDay } from './series';
import { addDays, localClock, localMidnight, weekDates, weekStart } from './time';

/** Paso de la reproducción de un día: 288 pasos en un día normal. */
export const DAY_STEP_MINUTES = 5;
export const STEPS_PER_HOUR = 60 / DAY_STEP_MINUTES;
/** La semana se pide por horas: basta para el resumen de cada día. */
const WEEK_STEP_MINUTES = 60;

export type Speed = 'lenta' | 'normal' | 'rapida';
export const SPEEDS: readonly Speed[] = ['lenta', 'normal', 'rapida'];
/**
 * Milisegundos por paso de 5 minutos: un día entero en 3 min 22 s, 1 min 41 s o 43 s. Los
 * estados llegan en fotogramas de una hora (`useFrames`): a la velocidad más alta son unas 33
 * peticiones por minuto, lejos del límite de 120 de la API.
 */
const SPEED_MS: Record<Speed, number> = { lenta: 700, normal: 350, rapida: 150 };

const NO_POINTS: readonly TimelinePoint[] = [];
/** La hora va a la URL cuando la pista lleva este rato quieta. */
const URL_SETTLE_MS = 400;

function rangeOfDays(first: string, last: string, stepMinutes: number): TimelineRange {
  return {
    from: new Date(localMidnight(first)).toISOString(),
    to: new Date(localMidnight(addDays(last, 1)) - stepMinutes * 60_000).toISOString(),
    stepMinutes,
  };
}

/**
 * Paso inicial: la hora pedida en la URL; si no la hay o ese día no la tiene, las 08:30 (el
 * mismo momento que enseña Explorar); si tampoco, el primer paso con datos.
 */
function initialIndex(points: readonly TimelinePoint[], time: string | null): number {
  for (const clock of time === null ? [DEFAULT_CLOCK] : [time, DEFAULT_CLOCK]) {
    const exact = points.findIndex((p) => localClock(p.at) === clock);
    if (exact >= 0) return exact;
  }
  return Math.max(
    0,
    points.findIndex((p) => p.stationsWithData > 0),
  );
}

/** Cómo va el estado de las estaciones del paso actual. */
export type StationsProgress = 'loading' | 'ready' | 'error';

/**
 * Estado de la reproducción de un día de una fuente: días disponibles, semana del día elegido,
 * línea temporal del día (cada 5 min) y de la semana (cada hora), paso actual y reproducción
 * con pausa. Sin fuente no pide nada. Mientras llega el estado de las estaciones del paso
 * actual, la reproducción espera: el reloj no se adelanta al mapa. Si no llega, se para.
 */
export function useReplay(
  source: SourceSummary | undefined,
  initialDay: string | null,
  initialTime: string | null,
  stations?: { readonly current: StationsProgress },
) {
  const days = useMemo(() => availableDays(source), [source]);
  const [chosenDay, setChosenDay] = useState(initialDay);
  // Sin día pedido, el último laborable importado: el mismo que enseña Explorar.
  const day = chosenDay !== null && days.includes(chosenDay) ? chosenDay : defaultDay(days);
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

  const [time, setTime] = useState(initialTime);
  const [chosenIndex, setChosenIndex] = useState<number | null>(null);
  const fallbackIndex = useMemo(() => initialIndex(points, time), [points, time]);
  const count = points.length;
  const index = count === 0 ? -1 : Math.min(chosenIndex ?? fallbackIndex, count - 1);
  const point = index >= 0 ? points[index] : undefined;
  const pointRef = useRef(point);
  useEffect(() => {
    pointRef.current = point;
  });

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
      if (stations?.current === 'error' || current >= count - 1) {
        setPlaying(false);
        return;
      }
      if (stations?.current === 'loading') return;
      setChosenIndex(current + 1);
    }, SPEED_MS[speed]);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, speed, count, stations]);

  // La URL guarda el día y la hora al parar, no en cada paso de la reproducción ni del arrastre
  // por la pista (Safari no admite más de 100 cambios de URL seguidos). También el día que no se
  // eligió: así el enlace sigue valiendo cuando se importen más días.
  const pausedClock = !playing && point !== undefined ? localClock(point.at) : null;
  const pendingClockRef = useRef<string | null>(null);
  useEffect(() => {
    if (pausedClock === null) return;
    pendingClockRef.current = pausedClock;
    const timer = window.setTimeout(() => {
      if (day !== null) writeParam('dia', day);
      writeParam('hora', pausedClock);
      pendingClockRef.current = null;
    }, URL_SETTLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [day, pausedClock]);
  // Si se desmonta antes (al cambiar de idioma), la última hora no se pierde.
  useEffect(
    () => () => {
      if (pendingClockRef.current !== null) writeParam('hora', pendingClockRef.current);
    },
    [],
  );

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

  // El otro día, a la misma hora de reloj: con el índice, en los días de 23 o 25 h (cambio de
  // hora) se saltaba una hora.
  const selectDay = useCallback((next: string) => {
    const current = pointRef.current;
    if (current !== undefined) setTime(localClock(current.at));
    setChosenIndex(null);
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
