import { THEME } from '../../app/theme';
import type { Availability } from './availability';
import { LOW_FILL_LEVEL, octagonLowerPoints, octagonPoints, svgPath } from './octagon';

const OUTLINE = svgPath(octagonPoints(2, 2, 16));
const LOWER = svgPath(octagonLowerPoints(2, 2, 16, LOW_FILL_LEVEL));
const INNER = svgPath(octagonPoints(6.5, 6.5, 7));

/** El mismo marcador que en el mapa, en SVG: forma y color dicen lo mismo. */
export function OctagonGlyph({ category, size = 20 }: { category: Availability; size?: number }) {
  const style = THEME.markers[category];
  const filled = style.fill === 'full';
  return (
    <svg
      className="octagon-glyph"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d={OUTLINE} fill={filled ? style.color : THEME.night} />
      {style.fill === 'low' && <path d={LOWER} fill={style.color} />}
      <path
        d={OUTLINE}
        fill="none"
        stroke={filled ? THEME.night : style.color}
        strokeWidth={filled ? 1.2 : 1.8}
        strokeDasharray={style.dashed === true ? '3 2.2' : undefined}
        strokeLinejoin="round"
      />
      {style.innerRing === true && (
        <path d={INNER} fill="none" stroke={THEME.night} strokeWidth={1.4} />
      )}
      {style.slash === true && (
        <path d="M14.5 5.5 L5.5 14.5" stroke={THEME.night} strokeWidth={2} strokeLinecap="round" />
      )}
    </svg>
  );
}

/** Marca de la aplicación: una manzana con chaflanes y un pulso. */
export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      width="32"
      height="32"
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path d={svgPath(octagonPoints(2, 2, 28))} fill={THEME.markers.available.color} />
      <path
        d="M7 17 H12 L14 11 L18 22 L20 15 H25"
        fill="none"
        stroke={THEME.night}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
