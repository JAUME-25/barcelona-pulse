import { THEME } from '../../app/theme';
import { MARKER_CSS_SIZE, PIXEL_RATIO } from '../stations/markerImages';
import { octagonPoints } from '../stations/octagon';

function canvas(size: number): CanvasRenderingContext2D {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D no disponible');
  return ctx;
}

/**
 * Estación hipotética: un rombo cian con una cruz, otra forma y otro color que las estaciones
 * reales (octógono), para que un escenario no se confunda nunca con lo observado.
 */
export function createHypotheticalImage(): ImageData {
  const size = MARKER_CSS_SIZE * PIXEL_RATIO;
  const ctx = canvas(size);
  const c = size / 2;
  const r = size / 2 - 6;
  const diamond = () => {
    ctx.beginPath();
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r, c);
    ctx.closePath();
  };

  diamond();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 8;
  ctx.strokeStyle = THEME.night;
  ctx.stroke();

  diamond();
  ctx.fillStyle = THEME.night;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = THEME.coverage[3];
  ctx.stroke();

  const arm = r * 0.42;
  ctx.beginPath();
  ctx.moveTo(c - arm, c);
  ctx.lineTo(c + arm, c);
  ctx.moveTo(c, c - arm);
  ctx.lineTo(c, c + arm);
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = THEME.coverage[3];
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

/**
 * Hueco que deja una estación real en el escenario: su octógono en discontinuo. Con aspa si se
 * ha quitado; sin ella si se ha movido (una línea lleva a su sitio nuevo).
 */
export function createGhostImage(cross: boolean): ImageData {
  const size = MARKER_CSS_SIZE * PIXEL_RATIO;
  const ctx = canvas(size);
  const inset = 7;
  const inner = size - inset * 2;
  const outline = () => {
    ctx.beginPath();
    octagonPoints(inset, inset, inner).forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  };

  outline();
  ctx.fillStyle = 'rgba(11, 20, 34, 0.7)';
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = THEME.coverage[3];
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (cross) {
    const a = inset + inner * 0.3;
    const b = inset + inner * 0.7;
    ctx.beginPath();
    ctx.moveTo(a, a);
    ctx.lineTo(b, b);
    ctx.moveTo(b, a);
    ctx.lineTo(a, b);
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Rayado para la cobertura que el escenario pierde. */
export function createHatchImage(): ImageData {
  const size = 8 * PIXEL_RATIO;
  const ctx = canvas(size);
  ctx.strokeStyle = THEME.coverage[3];
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Diagonales que empalman entre teselas.
  for (const offset of [-size, 0, size]) {
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
