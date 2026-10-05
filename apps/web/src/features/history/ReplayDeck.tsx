import { useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react';
import { onTimeKey, sliderProps } from './controls';
import { Clock, Counts, PlayButton, SpeedSelect, StepButton } from './ReplayParts';
import { areaPath, coverageRuns, dataSegments, hourMarks, niceMax } from './series';
import type { Replay } from './useReplay';
import { WeekDials } from './WeekDials';

/**
 * Reproductor de un día, bajo el mapa. La pista es la forma del día: estaciones sin bicis hacia
 * arriba, llenas hacia abajo, y los huecos sin dato a la vista (eje discontinuo). Los relojes de
 * la semana sirven para ver el patrón de cada día y elegirlo.
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

  return (
    <section ref={deckRef} className="replay-deck" aria-label="Reproducir un día">
      <div className="replay-deck__transport">
        <div className="replay-deck__buttons">
          <StepButton replay={replay} direction={-1} />
          <PlayButton replay={replay} />
          <StepButton replay={replay} direction={1} />
        </div>
        <SpeedSelect replay={replay} />
      </div>
      <Clock replay={replay} />
      <Counts point={replay.point} />
      <WeekDials replay={replay} />

      <div
        ref={trackRef}
        className="replay-deck__track"
        {...sliderProps(replay, 'Momento del día')}
        onKeyDown={onTimeKey(replay)}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekTo(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) seekTo(e);
        }}
      >
        <span className="replay-deck__label replay-deck__label--empty" aria-hidden="true">
          Sin bicis
        </span>
        <span className="replay-deck__label replay-deck__label--full" aria-hidden="true">
          Llenas
        </span>
        <span className="replay-deck__scale" aria-hidden="true">
          escala: {scale} estaciones
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
    </section>
  );
}
