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

/** Metro, tren y tranvía, como en el mapa (createTransitImage): redondo, no octógono. */
export function TransitGlyph({ size = 16 }: { size?: number }) {
  const { fill, ink } = THEME.transit;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="8.75" fill={ink} />
      <circle cx="9" cy="9" r="7.4" fill={fill} />
      <rect x="5.6" y="4.4" width="6.8" height="7.6" rx="1.6" fill={ink} />
      <rect x="6.7" y="5.6" width="4.6" height="2.6" fill={fill} />
      <circle cx="7.4" cy="10.1" r="0.75" fill={fill} />
      <circle cx="10.6" cy="10.1" r="0.75" fill={fill} />
      <path
        d="M7 12.2 6 13.6 M11 12.2 12 13.6"
        fill="none"
        stroke={ink}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Rayo: bicis eléctricas. En el ámbar de «con bicis», con el contorno oscuro de los marcadores. */
export function BoltGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d="M10.4 1.5 4.2 10.2h4.1L7.4 16.5l6.4-8.9H9.7z"
        fill={THEME.markers.available.color}
        stroke={THEME.night}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
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
