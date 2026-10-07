import { THEME, type MarkerStyle } from '../../app/theme';
import { LOW_FILL_LEVEL, octagonLowerPoints, octagonPoints } from './octagon';

/** Tamaño lógico del marcador en píxeles CSS a icon-size 1. */
export const MARKER_CSS_SIZE = 30;
export const PIXEL_RATIO = 2;

type Point = [number, number];

function trace(ctx: CanvasRenderingContext2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach(([px, py], i) => {
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
}

function canvas(size: number): CanvasRenderingContext2D {
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (ctx === null) throw new Error('Canvas 2D no disponible');
  return ctx;
}

/**
 * El marcador es un depósito: lleno (con bicis), a medias (pocas), vacío (solo el contorno),
 * con doble contorno (lleno, sin anclajes), tachado (fuera de servicio) o discontinuo (sin dato).
 */
export function createMarkerImage(style: MarkerStyle): ImageData {
  const size = MARKER_CSS_SIZE * PIXEL_RATIO;
  const stroke = style.fill === 'full' ? 3 : 4;
  const inset = stroke + 2;
  const inner = size - inset * 2;
  const ctx = canvas(size);
  const outline = octagonPoints(inset, inset, inner);

  // Contorno exterior oscuro: separa el marcador de cualquier fondo, también de los
  // edificios claros en 3D (sin él, los huecos bajan de 3:1 de contraste).
  trace(ctx, outline);
  ctx.lineWidth = stroke + 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.night;
  ctx.stroke();

  // Fondo: color del estado si está lleno; noche si está vacío o a medias.
  trace(ctx, outline);
  ctx.fillStyle = style.fill === 'full' ? style.color : THEME.night;
  ctx.fill();

  if (style.fill === 'low') {
    trace(ctx, octagonLowerPoints(inset, inset, inner, LOW_FILL_LEVEL));
    ctx.fillStyle = style.color;
    ctx.fill();
  }

  // Contorno: oscuro para separar los llenos del mapa; del color del estado en los huecos.
  trace(ctx, outline);
  ctx.lineWidth = stroke;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.fill === 'full' ? THEME.night : style.color;
  if (style.dashed === true) ctx.setLineDash([7, 5]);
  ctx.stroke();
  ctx.setLineDash([]);

  if (style.innerRing === true) {
    const gap = 9;
    trace(ctx, octagonPoints(inset + gap, inset + gap, inner - gap * 2));
    ctx.lineWidth = 3;
    ctx.strokeStyle = THEME.night;
    ctx.stroke();
  }

  if (style.slash === true) {
    ctx.beginPath();
    ctx.moveTo(inset + inner * 0.78, inset + inner * 0.22);
    ctx.lineTo(inset + inner * 0.22, inset + inner * 0.78);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = THEME.night;
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

/** Tamaño lógico del pictograma de transporte en píxeles CSS a icon-size 1. */
export const TRANSIT_CSS_SIZE = 18;

/**
 * Metro, tren y tranvía: un círculo claro con la cara de un tren. Redondo y sin color de estado,
 * para que no se confunda con una estación de Bicing (octógono). Mismo dibujo que TransitGlyph.
 */
export function createTransitImage(): ImageData {
  const r = PIXEL_RATIO;
  const size = TRANSIT_CSS_SIZE * r;
  const ctx = canvas(size);
  const { fill, ink } = THEME.transit;
  const mid = size / 2;
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.arc(mid, mid, 9 * r - 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(mid, mid, 7.4 * r, 0, Math.PI * 2);
  ctx.fill();
  // La cara del tren: cuerpo, parabrisas, faros y raíles.
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.roundRect(5.6 * r, 4.4 * r, 6.8 * r, 7.6 * r, 1.6 * r);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.fillRect(6.7 * r, 5.6 * r, 4.6 * r, 2.6 * r);
  ctx.beginPath();
  ctx.arc(7.4 * r, 10.1 * r, 0.75 * r, 0, Math.PI * 2);
  ctx.arc(10.6 * r, 10.1 * r, 0.75 * r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.1 * r;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(7 * r, 12.2 * r);
  ctx.lineTo(6 * r, 13.6 * r);
  ctx.moveTo(11 * r, 12.2 * r);
  ctx.lineTo(12 * r, 13.6 * r);
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}

/** Contorno de selección, mayor que el marcador. */
export function createHaloImage(): ImageData {
  const size = Math.round(MARKER_CSS_SIZE * 1.7) * PIXEL_RATIO;
  const ctx = canvas(size);
  const outer = 7;
  trace(ctx, octagonPoints(outer, outer, size - outer * 2));
  ctx.lineWidth = 8;
  ctx.strokeStyle = THEME.night;
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.strokeStyle = THEME.halo;
  ctx.stroke();
  return ctx.getImageData(0, 0, size, size);
}
