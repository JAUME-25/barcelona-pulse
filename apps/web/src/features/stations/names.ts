import type { StationItem } from '../../api/client';

/**
 * Nombres de estación legibles, como en una placa: «Av. Can Marcet, 3» en vez de
 * «AV. CAN MARCET, 3». Es presentación: la API y la base de datos guardan el nombre tal como lo
 * publica la fuente, y el buscador encuentra la estación de las dos formas.
 *
 * - Mayúscula al principio de cada palabra; «de», «la», «i», «d’»… en minúscula salvo al empezar.
 * - Las abreviaturas como vienen («C/», «Av.», «Pg.»), los números romanos en mayúsculas.
 * - Solo se tocan las palabras en mayúsculas: «(xamfrà)» o «esq» ya vienen escritas a mano.
 * - Se arreglan espacios, comas pegadas y la ela geminada («PARAL.LEL» → «Paral·lel»).
 * - Si la fuente corta el nombre y su dirección lo trae entero, se usa la dirección; si sigue
 *   cortado, se dice con «…».
 */

const PARTICLES = new Set([
  'de',
  'del',
  'dels',
  'la',
  'les',
  'el',
  'els',
  'i',
  'y',
  'a',
  'en',
  'na',
  'per',
]);
const ROMAN = /^(?=[MDCLXVI]{2,}$)M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/;
/** Siglas que aparecen en los nombres (CN: club de natación). */
const ACRONYMS = new Set(['CN']);

/**
 * Palabras que la fuente escribe mal y cuya forma buena no admite duda (06/10/2026): pegadas, mal
 * escritas o sin el acento que pide su lengua. Las que tienen forma catalana y castellana
 * (Marqués y Marquès, Ramón y Ramon, Ávila y Àvila) se dejan como vienen.
 */
const CORRECTIONS: Readonly<Record<string, string>> = {
  DEDUARD: "D'EDUARD",
  FORUM: 'FÒRUM',
  FERROCARILS: 'FERROCARRILS',
  GUINARDO: 'GUINARDÓ',
  LLUIS: 'LLUÍS',
  MARITIM: 'MARÍTIM',
  OLIMPIC: 'OLÍMPIC',
  CRISTOBAL: 'CRISTÓBAL',
  FLUVIA: 'FLUVIÀ',
  MARAÑON: 'MARAÑÓN',
};

/** Distritos que la fuente publica pegados («SantMartí»). */
const DISTRICTS: Readonly<Record<string, string>> = {
  CiutatVella: 'Ciutat Vella',
  LesCorts: 'Les Corts',
  'Sarrià-StGervasi': 'Sarrià-Sant Gervasi',
  NouBarris: 'Nou Barris',
  SantAndreu: 'Sant Andreu',
  SantMartí: 'Sant Martí',
};

const upperFirst = (text: string) => text.charAt(0).toLocaleUpperCase('ca') + text.slice(1);

/** Espacios, comas, separadores y la ela geminada, sin cambiar ninguna palabra. */
function tidy(raw: string): string {
  return (
    raw
      .replace(/([AEIOUÀÈÉÍÏÒÓÚÜ])L\.L/gu, '$1L·L') // PARAL.LEL; no AV.LITORAL ni PL.L…
      .replace(/\s+/g, ' ')
      // «C/» (o «C /») es una abreviatura: se aparta con otra barra para no tomarla por separador.
      .replace(/(^|[\s|/(-])C\s*\/\s*/gu, '$1C⁄ ')
      .replace(/(\p{Lu}{2,}\.)(?=\p{L})/gu, '$1 ') // AV.DIAGONAL; no J.MAYNARD
      .replace(/\s+,/g, ',')
      .replace(/,(?=\S)/g, ', ')
      .replace(/\s*\|\s*/g, ' | ')
      .replace(/\s*\/\s*/g, ' / ') // las demás barras separan dos calles
      .replace(/C⁄/g, 'C/')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/[`´]/g, "'")
      .trim()
  );
}

/** `shouting`: el nombre entero llega en mayúsculas, como casi todos los de Bicing. */
function word(token: string, first: boolean, shouting: boolean): string {
  if (/^\d/.test(token) || ROMAN.test(token) || ACRONYMS.has(token)) return token; // 31B, 10-19, XXIII
  // Una minúscula acentuada suelta dentro de una palabra en mayúsculas («LLUíS») cuenta como mayúscula.
  if (/[a-z]/.test(token) || !/\p{Lu}/u.test(token)) return token.replace(/'/g, '’');
  // En un nombre escrito a mano, una letra suelta es lo que es: «Jaume I» es un rey, no «Jaume i».
  if (!shouting && /^\p{Lu}$/u.test(token)) return token;
  const upper = CORRECTIONS[token] ?? token;
  const lower = upper.toLocaleLowerCase('ca');
  const elided = /^([dl])'(.+)$/u.exec(lower); // D'URGELL → d’Urgell
  if (elided !== null) {
    const [, article = '', rest = ''] = elided;
    return `${first ? article.toLocaleUpperCase('ca') : article}’${upperFirst(rest)}`;
  }
  if (lower === 'bis') return lower;
  if (!first && PARTICLES.has(lower)) return lower;
  if (lower.length === 1 && !first) return upper; // la B de «75 B»
  return upperFirst(lower);
}

/** El nombre tal como llega, escrito para leerse. */
export function readableName(raw: string): string {
  const shouting = !/[a-z]/.test(raw);
  let first = true;
  return (
    tidy(raw)
      .replace(/[^\s,|/()]+\/?/gu, (token) => {
        const out = word(token, first, shouting);
        first = false;
        return out;
      })
      // Lo que viene después de «|» o de « / » es otra calle: empieza en mayúscula.
      .replace(
        /(\| | \/ )(\p{Ll})/gu,
        (_m, sep: string, letter: string) => sep + letter.toLocaleUpperCase('ca'),
      )
  );
}

const compact = (text: string) => text.replace(/\s+/g, '').toLocaleUpperCase('ca');

/** El nombre de una estación para enseñarlo. */
export function stationName(station: Pick<StationItem, 'name' | 'address'>): string {
  const { name, address } = station;
  // La fuente corta los nombres largos; si la dirección empieza igual y sigue, es el nombre entero.
  const whole =
    address !== null && address.length > name.length && compact(address).startsWith(compact(name))
      ? address
      : name;
  const readable = readableName(whole);
  // Si aun así queda un paréntesis abierto, el nombre sigue cortado: se dice.
  const open = (readable.match(/\(/g) ?? []).length > (readable.match(/\)/g) ?? []).length;
  return open ? `${readable}…)` : readable;
}

export function districtName(raw: string): string {
  return DISTRICTS[raw] ?? raw;
}
