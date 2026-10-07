import type { Availability } from '../features/stations/availability';

/**
 * Identidad visual «Fanals»: Barcelona de noche, con la luz de las farolas como color de
 * los datos. Una sola fuente de verdad para la interfaz (variables CSS) y el mapa.
 */

/** Cuánto «depósito» se dibuja lleno en el marcador: la forma ya dice cuántas bicis hay. */
export type MarkerFill = 'full' | 'low' | 'none';

export interface MarkerStyle {
  /** Color principal del estado. */
  color: string;
  fill: MarkerFill;
  /** Doble contorno: llena, no se puede devolver. */
  innerRing?: boolean;
  /** Contorno discontinuo: dato desconocido. */
  dashed?: boolean;
  /** Barra diagonal: fuera de servicio. */
  slash?: boolean;
  /** Color del número dentro del marcador. */
  text: string;
  /** El número se dibuja con halo oscuro (marcadores huecos o a medio llenar). */
  textHalo?: boolean;
}

const NIGHT = '#0b1422';

export const THEME = {
  styleUrl: 'https://tiles.openfreemap.org/styles/dark',
  camera: { pitch: 45, bearing: -12 },
  night: NIGHT,
  halo: '#ffffff',
  textFont: ['Noto Sans Bold'],
  buildings: { low: '#22334c', high: '#435d86', opacity: 1 },
  /** Carriles bici del mapa base: verde, que no usa ningún estado ni la cobertura. */
  bikeLane: '#7ad08f',
  /** Pictograma de metro, tren y tranvía: claro y redondo, distinto del octógono de Bicing. */
  transit: { fill: '#dce4ee', ink: NIGHT },
  /**
   * Estados de estación. Escala cálida para «se acaban las bicis» (ámbar, naranja, rojo),
   * violeta para «no se puede devolver» y neutros para lo que no opera o no se sabe.
   */
  markers: {
    available: { color: '#ffc65c', fill: 'full', text: '#1a1206' },
    few: { color: '#ff8f3f', fill: 'low', text: '#ffe3cc', textHalo: true },
    empty: { color: '#ff5468', fill: 'none', text: '#ff8a98', textHalo: true },
    full: { color: '#c38bff', fill: 'full', innerRing: true, text: '#1b0b30' },
    outOfService: { color: '#7d8a9c', fill: 'full', slash: true, text: '#0b1422' },
    unknown: { color: '#8a97a8', fill: 'none', dashed: true, text: '#c3ccd8', textHalo: true },
  } as Record<Availability, MarkerStyle>,
  /**
   * Balance entre dos horas: ganar bicis acerca a «llena» (violeta, lleno) y perder acerca a
   * «sin bicis» (rojo, hueco); forma y signo del número dicen lo mismo que el color. Igual, un
   * marcador neutro y pequeño; sin dato en uno de los dos momentos, el de desconocido.
   */
  balance: {
    gain: { color: '#c38bff', fill: 'full', text: '#1b0b30' },
    loss: { color: '#ff5468', fill: 'none', text: '#ff8a98', textHalo: true },
    same: { color: '#c9d3df', fill: 'full', text: NIGHT },
  } as Record<'gain' | 'loss' | 'same', MarkerStyle>,
  /**
   * Escala reservada para cobertura y escenarios (B4): cian, que no usa ningún estado de
   * estación. Así una simulación nunca se confunde con una observación.
   */
  coverage: ['#0f3b47', '#16707f', '#26a9b8', '#7fe3ea'],
  /** Estación real cuando solo importa dónde está (escenarios): sin estado ni número. */
  networkMarker: { color: '#c9d3df', fill: 'full', text: NIGHT } as MarkerStyle,
  tokens: {
    '--font-ui': "'Barlow Semi Condensed', system-ui, sans-serif",
    '--bg': NIGHT,
    '--panel': 'rgba(12, 21, 34, 0.95)',
    '--panel-solid': '#0c1522',
    '--panel-2': 'rgba(236, 241, 247, 0.07)',
    '--ink': '#eef2f7',
    '--ink-2': '#b3bfce',
    '--line': 'rgba(236, 241, 247, 0.16)',
    '--accent': '#ffb547',
    '--accent-ink': '#1b1306',
    '--demo': '#ffb547',
    '--demo-ink': '#1b1306',
    '--demo-bg': 'rgba(255, 181, 71, 0.12)',
    '--radius': '10px',
    '--panel-shadow': '0 12px 40px rgba(0, 0, 0, 0.45)',
    '--heading-weight': '600',
    '--heading-tracking': '0',
    '--coverage-1': '#0f3b47',
    '--coverage-2': '#16707f',
    '--coverage-3': '#26a9b8',
    '--coverage-4': '#7fe3ea',
    '--bike-lane': '#7ad08f',
    '--balance-gain': '#c38bff',
    '--balance-loss': '#ff5468',
  },
} as const;

/** Vuelca los tokens y los colores de estado como variables CSS. */
export function applyTheme(root: HTMLElement): void {
  for (const [name, value] of Object.entries(THEME.tokens)) root.style.setProperty(name, value);
  for (const [category, style] of Object.entries(THEME.markers)) {
    root.style.setProperty(`--cat-${category}`, style.color);
  }
}
