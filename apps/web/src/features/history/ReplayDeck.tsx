import { useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react';
import { t } from '../../i18n';
import { GapCaption } from '../limits/Notes';
import { onTimeKey, sliderProps } from './controls';
import { Clock, Counts, PlayButton, SpeedSelect, StepButton } from './ReplayParts';
import { areaPath, coverageRuns, dataSegments, hourMarks, niceMax } from './series';
import type { Replay } from './useReplay';
import { WeekDials } from './WeekDials';

/** Píxeles que se mueve el dedo antes de decidir si arrastra la hora o desplaza la página. */
const TOUCH_SLOP = 8;

/**
 * Reproductor de un día, bajo el mapa. La pista es la forma del día: estaciones sin bicis hacia
 * arriba, llenas hacia abajo, y los huecos sin dato a la vista (eje discontinuo y, debajo, a qué
 * horas). Los relojes de la semana sirven para ver el patrón de cada día y elegirlo.
 */
export function ReplayDeck({ replay }: { replay: Replay }) {
  const { points, index } = replay;
  const last = Math.max(points.length - 1, 1);
  const scale = useMemo(() => niceMax(points), [points]);
  const empty = useMemo(
    () =>
      areaPath(
        points,
        (p) => p.stationsEmpty,
        (i, v) => [i, 50 - (v / scale) * 46],
      ),
    [points, scale],
  );
  const full = useMemo(
    () =>
      areaPath(
        points,
        (p) => p.stationsFull,
        (i, v) => [i, 50 + (v / scale) * 46],
      ),
    [points, scale],
  );
  const runs = useMemo(() => coverageRuns(points), [points]);
  const segments = useMemo(() => dataSegments(points), [points]);
  const marks = useMemo(() => hourMarks(points, 3), [points]);
  const trackRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLElement>(null);
  const pct = (i: number) => `${String((i / last) * 100)}%`;

  // En escritorio la leyenda va encima del reproductor, mida lo que mida.
  useLayoutEffect(() => {
    const deck = deckRef.current;
    const area = deck?.parentElement;
    if (deck === null || area == null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      area.style.setProperty('--replay-deck-height', `${String(deck.offsetHeight)}px`);
    });
    observer.observe(deck);
    return () => {
      observer.disconnect();
      area.style.removeProperty('--replay-deck-height');
    };
  }, []);

  const seekTo = (e: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    replay.seek(((e.clientX - rect.left) / rect.width) * last);
  };

  // Con el dedo, la pista no busca al tocarla: un gesto vertical que empiece en ella desplaza la
  // página (touch-action: pan-y). Busca al arrastrar en horizontal o al soltar sin moverse.
  const touchStart = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') {
      touchStart.current = { x: e.clientX, y: e.clientY, dragging: false };
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    seekTo(e);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const touch = touchStart.current;
    if (e.pointerType === 'touch' && touch !== null) {
      const dx = Math.abs(e.clientX - touch.x);
      if (!touch.dragging && dx > TOUCH_SLOP && dx > Math.abs(e.clientY - touch.y)) {
        touch.dragging = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (touch.dragging) seekTo(e);
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const touch = touchStart.current;
    touchStart.current = null;
    if (e.pointerType !== 'touch' || touch === null || touch.dragging) return;
    // Un toque sin desplazarse: va a esa hora.
    if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) <= TOUCH_SLOP) seekTo(e);
  };

  const m = t().replay;
  return (
    <section ref={deckRef} className="replay-deck" aria-label={m.deck}>
      <div className="replay-deck__transport">
        <div className="replay-deck__buttons">
          <StepButton replay={replay} direction={-1} />
          <PlayButton replay={replay} />
          <StepButton replay={replay} direction={1} />
        </div>
        <SpeedSelect replay={replay} />
      </div>
      <Clock replay={replay} />
      <Counts
        point={replay.point}
        toleranceMinutes={
          replay.dayState.status === 'ready' ? replay.dayState.data.toleranceMinutes : null
        }
        onRetry={replay.dayState.status === 'error' ? replay.retryDay : undefined}
      />
      <WeekDials replay={replay} />

      <div
        ref={trackRef}
        className="replay-deck__track"
        {...sliderProps(replay, m.slider)}
        onKeyDown={onTimeKey(replay)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          touchStart.current = null;
        }}
      >
        <span className="replay-deck__label replay-deck__label--empty" aria-hidden="true">
          {m.empty}
        </span>
        <span className="replay-deck__label replay-deck__label--full" aria-hidden="true">
          {m.full}
        </span>
        <span className="replay-deck__scale" aria-hidden="true">
          {m.scale(scale)}
        </span>
        <svg
          className="replay-deck__wave"
          viewBox={`0 0 ${String(last)} 100`}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path d={empty} className="replay-deck__empty" />
          <path d={full} className="replay-deck__full" />
          {/* Eje continuo donde hay dato y discontinuo en los huecos: sin datos no es cero. */}
          {runs
            .filter((r) => r.coverage === 'none')
            .map((r) => (
              <line
                key={r.from}
                x1={r.from}
                x2={r.to}
                y1={50}
                y2={50}
                className="replay-deck__axis replay-deck__axis--gap"
              />
            ))}
          {segments.map(([from, to]) => (
            <line key={from} x1={from} x2={to} y1={50} y2={50} className="replay-deck__axis" />
          ))}
        </svg>
        <div className="replay-deck__coverage" aria-hidden="true">
          {runs.map((r) => (
            <span
              key={r.from}
              className={`replay-deck__run replay-deck__run--${r.coverage}`}
              style={{ left: pct(r.from), width: pct(r.to - r.from) }}
            />
          ))}
        </div>
        <div className="replay-deck__hours" aria-hidden="true">
          {marks.map((m) => (
            <span key={m.index} style={{ left: pct(m.index) }}>
              {String(m.hour).padStart(2, '0')}
            </span>
          ))}
        </div>
        {index >= 0 && (
          <span className="replay-deck__head" style={{ left: pct(index) }} aria-hidden="true" />
        )}
      </div>
      <GapCaption points={points} />
    </section>
  );
}
