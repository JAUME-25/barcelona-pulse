import type { ReactNode } from 'react';
import type { Messages } from './es';
import {
  dayParts,
  dayRuns,
  daysByMonth,
  durationParts,
  formatDay,
  formatDayMonth,
  formatTime,
  joinList,
  monthName,
  monthsByYear,
  sameLocalDay,
  sameLocalYear,
  yearsOf,
} from './intl';
import type { AvailabilityKey, GapInput, NoEffectInput, Origin } from './types';

// Català. Mateixa forma que el castellà (Messages): TypeScript avisa si hi falta o hi sobra res.

const list = (items: readonly string[]) => joinList(items, 'i');
const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** «la 01:30» però «les 10:54»: la una és singular. */
const theHour = (clock: string) => (clock.startsWith('01:') ? `la ${clock}` : `les ${clock}`);

/** «de maig», «d’agost»: davant de vocal, apòstrof. */
const ofMonth = (month: string) => (/^[aeiouàèéíòóú]/i.test(month) ? `d’${month}` : `de ${month}`);

/** «de Barcelona», «d’Horta-Guinardó», «de l’Eixample», «de les Corts». */
function ofPlace(name: string): string {
  if (name === 'Eixample') return 'de l’Eixample';
  if (name.startsWith('Les ')) return `de les ${name.slice(4)}`;
  return /^[aeiouàèéíòóúh]/i.test(name) ? `d’${name}` : `de ${name}`;
}

/** «de les 23:39» el mateix dia, «del 28 de maig» el mateix any i, si no, «del 12 de juny del 2025». */
function sinceWhen(iso: string, reference: string): string {
  if (sameLocalDay(iso, reference)) return `de ${theHour(formatTime(iso))}`;
  if (sameLocalYear(iso, reference)) return `del ${formatDayMonth(iso)}`;
  return `del ${formatDay(iso)}`;
}

function duration(fromIso: string, toIso: string): string {
  const { minutes, hours, rest, days } = durationParts(fromIso, toIso);
  if (minutes < 1) return 'menys d’1 min';
  if (hours === 0) return `${String(minutes)} min`;
  if (hours >= 48) return `${String(days)} dies`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/** «del 4 al 31 de maig», amb l’any si cal. */
function runText([first, last]: [string, string], withYear: boolean): string {
  const a = dayParts(first);
  const b = dayParts(last);
  const year = (y: string) => (withYear ? ` del ${y}` : '');
  if (first === last) return `el ${String(a.d)} ${ofMonth(a.m)}${year(a.y)}`;
  if (a.y === b.y && a.m === b.m) {
    return `del ${String(a.d)} al ${String(b.d)} ${ofMonth(b.m)}${year(b.y)}`;
  }
  if (a.y === b.y) {
    return `del ${String(a.d)} ${ofMonth(a.m)} al ${String(b.d)} ${ofMonth(b.m)}${year(b.y)}`;
  }
  return `del ${String(a.d)} ${ofMonth(a.m)} del ${a.y} al ${String(b.d)} ${ofMonth(b.m)} del ${b.y}`;
}

const AVAILABILITY_LABEL: Record<AvailabilityKey, string> = {
  available: 'Amb bicis',
  few: 'Poques bicis',
  empty: 'Sense bicis',
  full: 'Plena',
  outOfService: 'Fora de servei',
  unknown: 'Sense dada recent',
};

/** Els supòsits del model «cobertura-geometrica» v1, en l’ordre en què els dona l’API. */
const COVERAGE_ASSUMPTIONS = [
  'Distància en línia recta des de cada estació, no a peu pels carrers: no és una isòcrona.',
  'Cada estació cobreix un cercle del radi triat; els solapaments es compten una sola vegada.',
  'Superfícies en EPSG:25831 (metres), arrodonides al metre quadrat. Cada cercle és un polígon de 64 costats: un 0,16 % menys d’àrea.',
  'El percentatge és sobre l’àrea d’estudi triada, no sobre la població ni sobre cap altra zona.',
  'Hi entren totes les estacions amb ubicació vigent a l’instant de referència, tant si funcionen com si no.',
  'La capacitat no canvia la cobertura. Res d’això diu quants viatges, esperes o demanda hi hauria.',
  'Les geometries se simplifiquen 1 m per dibuixar-les; les superfícies es calculen sense simplificar.',
];

export const ca: Messages = {
  languages: { label: 'Idioma' },
  brand: { tagline: 'Estacions de Bicing al mapa' },
  modes: { label: 'Mode', explore: 'Explorar', replay: 'Reproduir', experiment: 'Experimentar' },

  format: {
    duration,
    months: (days) => {
      const byYear = monthsByYear(days);
      if (byYear.length === 0) return null;
      return list(byYear.map(([year, names]) => `${list(names)} del ${year}`));
    },
    count,
  },

  map: {
    failed: 'No s’ha pogut carregar el mapa base. La llista d’estacions continua disponible.',
    unsupported:
      'Aquest navegador no pot dibuixar el mapa perquè no té WebGL2. La llista d’estacions continua disponible.',
    degraded: 'Una part del mapa base no s’ha carregat.',
    lost: 'El mapa s’ha aturat un moment. Torna tan bon punt el navegador ho permeti.',
    region: 'Mapa d’estacions',
    pitch: 'Vista 3D',
    zoomIn: 'Apropar',
    zoomOut: 'Allunyar',
    resetBearing: 'Orientar al nord',
    attribution: 'Mostrar les atribucions',
    title: 'Mapa',
  },

  app: {
    sourcesError: 'No s’han pogut carregar les fonts de dades.',
    retry: 'Torna-ho a provar',
    noData: 'Encara no hi ha dades carregades.',
    noDataHint: (command: ReactNode): ReactNode => <>En local, importa la demo amb {command}.</>,
    stationsError: 'No s’han pogut carregar les estacions.',
    loading: 'Carregant les estacions…',
    search: 'Cercar estació',
    count: (shown, total) =>
      shown === total
        ? count(total, 'estació', 'estacions')
        : `${String(shown)} de ${String(total)} estacions`,
    noMatch: 'Cap estació no coincideix amb la cerca i els filtres.',
    showAll: 'Mostrar-les totes',
    order: 'Ordre',
    orders: {
      name: 'Nom',
      bikes: 'Més bicis',
      docks: 'Més ancoratges lliures',
      ebikes: 'Més elèctriques',
      distance: 'Més a prop meu',
    },
    nearMe: 'A prop meu',
    locating: 'Buscant-te…',
    located:
      'Ordenades de més a prop a més lluny d’on ets, en línia recta. La teva ubicació no surt del navegador.',
    locatedRough: (error: string) =>
      `Ubicació aproximada (±${error}): ordenades de més a prop a més lluny, en línia recta. La teva ubicació no surt del navegador.`,
    locationOutside: 'Ets fora de Barcelona: la llista no s’ordena per distància.',
    locationDenied:
      'El navegador no ha donat permís per saber on ets. Ho pots canviar als ajustos del lloc.',
    locationUnavailable: 'El navegador no ha pogut saber on ets.',
    locationTimeout: 'El navegador ha trigat massa a saber on ets. Torna-ho a provar.',
    locationUnsupported: 'Aquest navegador no dona la ubicació.',
    listTitle: 'Estacions',
    onlyOnMap: 'Només les del mapa',
    noneOnMap: 'Cap estació a la part del mapa que es veu. Mou el mapa o allunya’l.',
    wholeList: 'Veure tota la llista',
    linkStationMissing: (id) =>
      `L’enllaç demanava l’estació «${id}», que no és en aquesta font: es mostra la llista.`,
    linkDayMissing: (day) =>
      `L’enllaç demanava el ${day}, que no està importat: es mostra un altre dia.`,
    truncated: 'L’API només ha tornat una part de les estacions d’aquesta zona: en falten algunes.',
    source: 'Font',
    demoSuffix: '(demo)',
    crashed: 'Alguna cosa ha fallat en pintar l’aplicació.',
    reload: 'Recarregar',
  },

  api: {
    tooMany: 'L’API ha rebut massa peticions seguides. Espera un minut i torna-ho a provar.',
    status: (status) => `L’API ha respost ${status}.`,
    noStatus: 'sense estat',
    unreachable: 'No s’ha pogut contactar amb l’API. Comprova la connexió i torna-ho a provar.',
  },

  source: {
    timeZone: 'hora de Barcelona',
    demoBadge: 'Demo',
    demoLead: 'Dades inventades per provar l’aplicació. No és la disponibilitat real de Bicing.',
    shownMoment: 'Moment mostrat',
    changeMoment: 'Canviar el moment',
    thisHour: 'A aquesta hora',
    more: 'Més',
    less: 'Menys',
    realBadge: 'Dades reals',
    past: 'És un moment del passat, no l’estat actual.',
    historical: (months) => `Dades històriques · ${months}. No és l’estat actual.`,
    noObservations: 'Sense observacions en aquest moment.',
    lastObservation: 'Última observació',
    license: (license) => `Llicència ${license}.`,
    dataset: 'Veure el conjunt de dades',
    limits: 'Què mostra i què no',
    share: 'Copiar l’enllaç',
    shared: 'Enllaç copiat.',
    sharedNoCamera: 'Enllaç copiat, sense la posició del mapa.',
    shareFailed: 'El navegador no deixa copiar-lo. Copia’l d’aquí:',
    shareUrl: 'Enllaç d’aquesta vista',
    texts: {
      'bicing-bcn': {
        name: 'Bicing, històric de l’Ajuntament de Barcelona',
        attribution:
          'Font de les dades: Ajuntament de Barcelona. Dades transformades: històric mensual normalitzat.',
      },
      demo: {
        name: 'Demo sintètica',
        attribution:
          'Dades sintètiques de Barcelona Pulse. Ubicacions aproximades, no són estacions reals.',
      },
    },
  },

  availability: {
    label: AVAILABILITY_LABEL,
    hint: (category, fewMax) => {
      switch (category) {
        case 'available':
          return `${String(fewMax + 1)} o més`;
        case 'few':
          return `d’1 a ${String(fewMax)}`;
        case 'empty':
          return 'cap de lliure';
        case 'full':
          return 'sense ancoratges lliures';
        case 'outOfService':
          return 'no opera';
        case 'unknown':
          return 'no és zero';
      }
    },
    status: {
      in_service: 'En servei',
      maintenance: 'En manteniment',
      closed: 'Tancada',
      planned: 'Prevista',
      unknown: 'Desconegut',
    },
    quality: {
      counts_exceed_capacity: 'Bicis i ancoratges sumen més que la capacitat publicada.',
      bike_types_mismatch: 'Mecàniques i elèctriques no sumen el total publicat.',
    },
    legend: 'Què vol dir cada marcador',
    legendHelp: 'Prem una categoria per amagar-la o mostrar-la.',
    numberLabel: 'Número al mapa i a la llista',
    numberBikes: 'Bicis',
    numberEbikes: 'Elèctriques',
    numberEbikesHelp:
      'Quantes elèctriques hi ha a cada estació. Les que no en tenen cap s’atenuen; el color continua dient si hi ha bicis.',
    numberDocks: 'Ancoratges',
    numberDocksHelp:
      'Quants ancoratges lliures hi ha a cada estació. Les plenes s’atenuen; el color continua dient si hi ha bicis.',
    presetsLabel: 'Dreceres',
    presets: { bike: 'Vull una bici', park: 'Vull aparcar' },
    mapKey: 'També al mapa',
    bikeLane: 'Carril bici (OSM, no tots)',
    transit: 'Metro, tren i tramvia',
    me: 'La teva ubicació',
  },

  districts: {
    title: 'Per districte',
    label: 'Districte',
    all: 'Tots els districtes',
    none: 'Sense districte',
    stations: 'Estacions',
    empty: 'Sense bicis',
    full: 'Plenes',
    unknown: 'Sense dada',
    note: 'Sense dada va a part: no compta com a sense bicis ni com a plena.',
  },

  list: {
    staleSince: (label, iso, at) => `${label} des ${sinceWhen(iso, at)}`,
    never: 'Cap dada fins a aquest moment',
    noRenting: (label) => `${label}, sense préstec`,
    noReturning: (label) => `${label}, sense devolucions`,
    srBikes: (n) => (n === 1 ? '1 bici' : `${String(n)} bicis`),
    srDocks: (n) => (n === 1 ? '1 ancoratge lliure' : `${String(n)} ancoratges lliures`),
    unitBikes: (n) => (n === 1 ? 'bici' : 'bicis'),
    unitDocks: 'lliures',
    unitEbikes: 'elèc.',
  },

  pattern: {
    title: 'Com sol estar',
    lead: (days: number, period: string) =>
      `Com va estar a cada hora en els ${String(days)} dies importats (${period}), mirat cada 15 minuts. És el que va passar, no una previsió.`,
    weekdays: 'Feiners',
    weekend: 'Cap de setmana',
    days: (n: number) => (n === 1 ? '1 dia' : `${String(n)} dies`),
    holidays: 'Els festius compten com a feiners.',
    emptyMost: (hour: number, share: string) =>
      `De ${String(hour)} a ${String(hour + 1)} h va estar sense bicis el ${share} del temps.`,
    emptyRare: 'Gairebé mai no es va quedar sense bicis.',
    fullMost: (hour: number, share: string) =>
      `De ${String(hour)} a ${String(hour + 1)} h va estar plena, sense lloc per deixar la bici, el ${share} del temps.`,
    unknownShare: (share: string) => `Sense dada el ${share} del temps.`,
    atHour: (hour: number, share: string, median: number | null) =>
      `De ${String(hour)} a ${String(hour + 1)} h va tenir alguna bici el ${share} del temps${
        median === null ? '.' : `; la mediana, ${count(median, 'bici', 'bicis')}.`
      }`,
    noDays: 'Encara no hi ha dies importats d’aquesta font.',
    loading: 'Calculant com sol estar…',
    failed: 'No s’ha pogut calcular com sol estar.',
    demo: 'Amb les dades inventades de la demo.',
    now: 'Hora que es veu al mapa',
    unknown: 'Sense dada',
  },

  detail: {
    back: 'Tornar a la llista',
    neverReported: 'Aquesta estació no ha enviat cap observació fins al moment mostrat.',
    lastObservation: (p) => (
      <>
        L’última observació és{' '}
        {p.sameDay ? `de ${p.clock.startsWith('01:') ? 'la' : 'les'}` : 'del'} {p.when},{' '}
        {p.duration} abans del moment mostrat. Passats {p.tolerance} min sense dades, l’estat es
        dona per desconegut: no se suposa que estigui buida.
      </>
    ),
    docks: (n) => count(n, 'ancoratge', 'ancoratges'),
    bikes: (n) => count(n, 'bici', 'bicis'),
    and: 'i',
    bikeSplit: (mechanical, electric) =>
      `${String(mechanical)} mecàniques i ${String(electric)} elèctriques`,
    noSplit: 'Sense desglossament per tipus',
    observedAt: ({ time, day, clock }) => (
      <>
        Dada de {clock.startsWith('01:') ? 'la' : 'les'} {time} del {day}
      </>
    ),
    bikesAvailable: 'Bicis disponibles',
    docksFree: 'Ancoratges lliures',
    capacityOf: (capacity) => `de ${String(capacity)} de capacitat`,
    outOfService:
      'L’estació no està operativa. Les xifres són les que publica, però potser no s’hi poden agafar ni tornar bicis.',
    notRenting: 'En aquest moment l’estació no permet agafar bicis, encara que en tingui.',
    notReturning:
      'En aquest moment l’estació no admet devolucions, encara que tingui ancoratges lliures.',
    unavailable: 'No disponibles',
    capacity: 'Capacitat publicada',
    notPublished: 'No publicada',
    nearby: 'Properes',
    nearbyNote: 'Les més properes, en línia recta (no a peu), amb el seu estat en aquest moment.',
    last: 'Última observació',
    none: 'Cap',
    source: 'Font',
    demoSource: 'Demo amb dades inventades',
    id: (id) => ` (identificador ${id})`,
    changes: (n) => `Canvis d’aquesta estació (${String(n)})`,
    knownSince: (since) => `Vista per primer cop el ${since}.`,
    noChanges: (since) =>
      `Sense canvis de nom, lloc ni capacitat als dies importats; vista per primer cop el ${since}.`,
    changesLoading: 'Buscant canvis de l’estació…',
    changesFailed: 'No s’han pogut carregar els canvis de l’estació.',
    changeCapacity: (from, to) =>
      `capacitat de ${from === null ? 'no publicada' : String(from)} a ${to === null ? 'no publicada' : String(to)} ancoratges`,
    changeName: (from, to) => `de «${from}» a «${to}»`,
    changeAddress: (from, to) => `adreça de «${from ?? '—'}» a «${to ?? '—'}»`,
    changeMoved: (distance) => `es va moure ${distance}`,
    metadataAssumed:
      'El nom, la ubicació i la capacitat són d’una publicació posterior a aquest moment.',
  },

  replay: {
    deck: 'Reproduir un dia',
    slider: 'Moment del dia',
    empty: 'Sense bicis',
    full: 'Plenes',
    scale: (n) => `escala: ${String(n)} estacions`,
    play: 'Reproduir el dia',
    pause: 'Pausa',
    stepBack: (minutes) => `${String(minutes)} minuts abans`,
    stepForward: (minutes) => `${String(minutes)} minuts després`,
    speed: 'Velocitat',
    speeds: { lenta: 'Lenta', normal: 'Normal', rapida: 'Ràpida' },
    loadingDay: 'Carregant el dia…',
    dayFailed: 'No s’ha pogut carregar el dia.',
    stationsLoading: 'Carregant l’estat de les estacions…',
    stationsFailed: 'No s’ha pogut carregar l’estat de les estacions en aquest moment.',
    noData: 'Sense dades en aquest moment: cap estació no havia informat.',
    countEmpty: (n) => <>{n} sense bicis</>,
    countFull: (n) => <>{n} plenes</>,
    countTotals: (bikes, docks, ebikes) => {
      const bikesPart =
        bikes === null ? null : (
          <>
            {bikes} bicis{ebikes !== null && <> ({ebikes} elèctriques)</>}
          </>
        );
      return bikesPart !== null && docks !== null ? (
        <>
          {bikesPart} i {docks} ancoratges lliures
        </>
      ) : bikesPart !== null ? (
        bikesPart
      ) : (
        <>{docks} ancoratges lliures</>
      );
    },
    counted: (n) => `a ${String(n)} estacions`,
    countedNote: 'Les operatives que publiquen bicis i ancoratges. Les altres no sumen.',
    bikesScale: (max) => `bicis a les estacions: de 0 a ${max}`,
    withDataNote: (tolerance) =>
      `Les que han informat en els ${tolerance} minuts anteriors. Les altres no compten com a buides ni com a plenes.`,
    withData: (withData, known) => `${String(withData)} de ${String(known)} amb dada`,
    valueLoading: 'Carregant',
    valueNoData: (moment) => `${moment}. Sense dades.`,
    value: (moment, empty, full, withData, known) =>
      `${moment}. ${String(empty)} sense bicis, ${String(full)} plenes, ${String(withData)} de ${String(known)} amb dada.`,
    previousWeek: 'Setmana anterior',
    nextWeek: 'Setmana següent',
    dayGroup: 'Dia',
    dayNoData: (label) => `${label}, sense dades`,
    noImported: 'Sense dades importades',
  },

  limits: {
    coverage: {
      complete: 'gairebé totes amb dada',
      partial: 'en falten algunes',
      none: 'cap amb dada',
    },
    silenceTitle: {
      never: ['Cap dada fins a aquest moment', 'Cap dada fins a aquest moment'],
      days: ['Fa dies que no informa', 'Fa dies que no informen'],
      hours: ['Fa hores que no informa', 'Fa hores que no informen'],
      minutes: ['Acaba de deixar d’informar', 'Acaben de deixar d’informar'],
    },
    month: (year, month) => `${monthName(year, month)} del ${String(year)}`,
    dayRow: (day, coverage) => `${day}: ${coverage} en el pitjor moment. Reproduir aquest dia.`,
    measuring: 'Mesurant els forats…',
    holesError: 'No s’han pogut mesurar els forats.',
    average: (share, step) =>
      `De mitjana, el ${share} de les estacions tenen dada a cada pas de ${String(step)} minuts.`,
    noneBelow: 'Cap pas per sota del 95 %.',
    below: (n, steps, days) =>
      `${String(n)} de ${String(steps)} passos per sota del 95 %: ${days}.`,
    legend: 'Què vol dir cada casella',
    legendComplete: '95 % o més amb dada',
    legendPartial: 'En falten algunes',
    legendNone: 'Cap',
    gridNote: (step) =>
      `Cada fila és un dia i cada casella, una hora (mesurada cada ${String(step)} minuts). Prem un dia per reproduir-lo.`,
    allWithData: (when, total) => `${when}: les ${String(total)} estacions tenen dada.`,
    someSilent: (when, silent, total) =>
      `${when}: ${String(silent)} de ${String(total)} estacions sense dada. No compten com a buides: el seu estat és desconegut.`,
    back: 'Tornar',
    title: 'Què mostra i què no',
    lead: (stations, period) =>
      `Com estaven les ${String(stations)} estacions de Bicing ${period ?? ''}, segons l’arxiu que publica l’Ajuntament de Barcelona. És el passat: no el que passa ara.`,
    data: 'Les dades',
    holes: 'Forats',
    silent: 'Sense dada en aquest moment',
    notSaidTitle: 'El que no diu',
    originsTitle: 'D’on surt cada cosa',
    period: 'Període',
    periodValue: (period, days) => `${period ?? ''} (${count(days, 'dia', 'dies')})`,
    lastData: 'Última dada',
    rhythm: 'Ritme',
    rhythmValue: 'Una foto de tota la xarxa cada 5 minuts',
    expiry: 'Caducitat',
    expiryValue: (tolerance) =>
      `Als ${String(tolerance)} minuts sense informar, l’estat d’una estació passa a desconegut`,
    stations: 'Estacions',
    observations: 'Observacions guardades',
    lastIngestion: 'Última importació',
    ingestionStatus: {
      running: 'en marxa',
      succeeded: 'acabada',
      succeeded_with_issues: 'acabada amb avisos',
      failed: 'fallida',
    },
    lastIngestionValue: (when, status, accepted, duplicate, conflicting, rejected) =>
      `${when}, ${status}: ${accepted} noves, ${duplicate} repetides, ${conflicting} en conflicte, ${rejected} rebutjades.`,
    ingestionsLead: (n) => {
      const text =
        `${count(n.runs, 'importació', 'importacions')} en ${count(n.periods, 'dia', 'dies')}: ` +
        `${n.accepted} observacions noves, ${n.duplicate} repetides, ${n.conflicting} en conflicte i ${n.rejected} rebutjades.`;
      const failed =
        n.failed === 0 ? '' : ` ${count(n.failed, 'dia va fallar', 'dies van fallar')}.`;
      const purged =
        n.purged === 0 ? '' : ` ${count(n.purged, 'dia esborrat', 'dies esborrats')} després.`;
      return text + failed + purged;
    },
    ingestionsTitle: 'El que va entrar cada dia',
    ingestionsLoading: 'Llegint les importacions…',
    ingestionsError: 'No s’han pogut llegir les importacions.',
    ingestionsNone: 'Encara no s’ha importat cap dia.',
    ingestionDay: 'Dia',
    ingestionNew: 'Noves',
    ingestionDuplicate: 'Repetides',
    ingestionConflicting: 'En conflicte',
    ingestionRejected: 'Rebutjades',
    ingestionTimes: (n) => `${String(n)} vegades`,
    ingestionFailed: 'va fallar',
    ingestionPurged: 'esborrat',
    ingestionsNote:
      'Observacions. Repetides: ja hi eren, amb els mateixos valors. En conflicte: ja hi eren amb altres valors i es va conservar la primera. Rebutjades: no van entrar (estacions incloses).',
    rejectionsTitle: 'Rebuigs, per motiu:',
    noRejections: 'Cap registre rebutjat.',
    rejectionLine: (n, kind, reason) => {
      const kinds: Record<string, [string, string]> = {
        station: ['estació', 'estacions'],
        observation: ['observació', 'observacions'],
        input: ['entrada', 'entrades'],
      };
      const [one, many] = kinds[kind] ?? [kind, kind];
      return `${count(n, one, many)}: ${reason}`;
    },
    rejectionReason: {
      missing_field: 'falta un camp',
      invalid_value: 'valor no vàlid',
      ambiguous_timestamp: 'hora sense zona horària',
      timestamp_in_future: 'hora en el futur',
      coordinates_out_of_range: 'coordenades impossibles',
      outside_service_area: 'fora de l’àrea de servei',
      negative_count: 'recompte negatiu',
      duplicate_in_batch: 'repetit al mateix arxiu',
      unknown_station: 'estació desconeguda',
      metadata_older_than_current: 'atributs més antics que els vigents',
      metadata_inside_known_period: 'canvi d’atributs dins d’un període ja conegut',
    },
    dataset: 'El conjunt de dades de Bicing a Open Data BCN',
    code: 'Codi, decisions i mesures:',
    silentNever: 'Cap dada fins a aquest moment',
    silentSince: (iso, at) => `Sense dades des ${sinceWhen(iso, at)}`,
    silentFor: (iso, at) => `${duration(iso, at)} sense dades`,
    periodOf: (days) => {
      const runs = dayRuns(days);
      if (runs.length === 0) return null;
      const years = yearsOf(days);
      const oneYear = years.length === 1;
      const joined = list(runs.map((r) => runText(r, !oneYear)));
      return oneYear ? `${joined} del ${years[0] ?? ''}` : joined;
    },
    listDays: (days) =>
      list(daysByMonth(days).map(([m, ds]) => `${list(ds.map(String))} ${ofMonth(m)}`)),
    gap: (g: GapInput) => {
      if (g.allNone) return 'Sense dades en tot el dia.';
      const ranges = g.ranges.map((r) =>
        r.to === null ? `a ${theHour(r.from)}` : `de ${r.from} a ${r.to}`,
      );
      if (ranges.length === 0) return `Tot el dia amb dada del ${g.share} de les estacions o més.`;
      const shown = ranges.slice(0, 3);
      const rest = ranges.length - shown.length;
      const text =
        rest > 0 ? `${shown.join(', ')} i ${count(rest, 'tram', 'trams')} més` : list(shown);
      return `Menys del ${g.share} de les estacions amb dada ${text}.`;
    },
    notSaid: (tolerance) => [
      'No és temps real: és un arxiu del passat.',
      `Sense dada no és zero: una estació que fa més de ${String(tolerance)} minuts que no informa surt com a desconeguda, no com a buida.`,
      'Un canvi en el nombre de bicis no és un viatge: no se sap d’on venen ni on van.',
      'La cobertura és geometria en línia recta. No és a peu, ni població, ni demanda.',
      'No prediu ni recomana res.',
      'Els carrils bici del mapa no són tots: només els que OpenStreetMap dibuixa a part de la calçada.',
    ],
    origins: (months): Origin[] => {
      const when = months === null ? '' : `, ${months}`;
      return [
        {
          what: 'Estat de les estacions',
          who: `Ajuntament de Barcelona, Open Data BCN${when}`,
          terms: 'CC BY 4.0, dades transformades',
        },
        {
          what: 'Nom, ubicació i capacitat',
          who: `Ajuntament de Barcelona, Open Data BCN${when}`,
          terms: 'CC BY 4.0',
        },
        {
          what: 'Districtes per a la cobertura',
          who: 'Ajuntament de Barcelona, Open Data BCN (2017)',
          terms: 'CC BY 4.0',
        },
        {
          what: 'Mapa base i edificis',
          who: 'OpenFreeMap, OpenMapTiles i OpenStreetMap',
          terms: 'ODbL',
        },
        {
          what: 'Carrers, carrils bici, metro i parcs',
          who: 'OpenStreetMap, a través d’OpenMapTiles i OpenFreeMap',
          terms: 'ODbL',
        },
        { what: 'Estacions hipotètiques', who: 'Les poses tu', terms: 'No es guarden' },
      ];
    },
  },

  stamp: {
    demo: 'Demo',
    demoValue: 'Dades inventades',
    network: 'Xarxa real del',
    historical: 'Històric, no és temps real',
    hypothetical: 'amb canvis hipotètics',
  },

  scope: {
    straight: {
      term: 'En línia recta',
      note: 'Distància en línia recta des de cada estació, no a peu pels carrers: no és una isòcrona.',
    },
    surface: {
      term: 'Superfície, no població',
      note: 'El percentatge és sobre l’àrea d’estudi triada, no sobre la població ni sobre cap altra zona.',
    },
    trips: {
      term: 'No mesura viatges',
      note: 'La capacitat no canvia la cobertura. Res d’això diu quants viatges, esperes o demanda hi hauria.',
    },
  },

  scenario: {
    deck: 'Escenari de cobertura',
    real: 'Xarxa real',
    stations: (n) => `${String(n)} estacions`,
    label: 'Escenari',
    gains: (area) => `guanya ${area}`,
    loses: (area) => `perd ${area}`,
    of: (area, size, radius) =>
      `De l’àrea ${ofPlace(area)} (${size}) a menys de ${String(radius)} m en línia recta.`,
    undo: 'Desfer',
    reset: 'Tornar a la xarxa real',
    panelTitle: 'Escenari de cobertura',
    panelLead:
      'Quina part de la ciutat queda a prop d’una estació, en línia recta. Canvia la xarxa sobre el mapa i compara. Mesura geometria: no diu quants viatges hi hauria.',
    reference: (when, n) => `Xarxa real del ${when}: ${String(n)} estacions.`,
    changes: 'Canvis',
    empty: 'Encara és la xarxa real. Tria Afegir, Moure o Treure i toca el mapa.',
    assumptions: 'Supòsits del càlcul',
    toolsLabel: 'Eines de l’escenari',
    tools: {
      add: { label: 'Afegir', hint: 'Toca el mapa on vulguis una estació nova.' },
      move: { label: 'Moure', hint: 'Arrossega una estació, real o nova, a un altre lloc.' },
      remove: { label: 'Treure', hint: 'Toca una estació per treure-la de l’escenari.' },
    },
    toolDefault: 'Tria una eina per canviar la xarxa.',
    radius: 'Radi',
    radiusValue: (radius) => `${String(radius)} metres`,
    area: 'Àrea d’estudi',
    districts: 'Districtes',
    hypothetical: 'Hipotètic',
    up: 'Puja',
    down: 'Baixa',
    what: { added: 'afegida', moved: 'moguda', removed: 'treta' },
    undoChange: { added: 'Treure', moved: 'Tornar', removed: 'Recuperar' },
    stationFallback: (id) => `Estació ${String(id)}`,
    newStation: (n) => `Nova ${n}`,
    model: (name, version) => `Model «${name}», versió ${String(version)}.`,
    assumptionsOf: (model, version, fromApi) =>
      model === 'cobertura-geometrica' &&
      version === 1 &&
      fromApi.length === COVERAGE_ASSUMPTIONS.length
        ? COVERAGE_ASSUMPTIONS
        : fromApi,
    legend: {
      title: 'Què es veu al mapa',
      covered: 'Cobert per la xarxa real',
      gained: 'El que guanya l’escenari',
      lost: 'El que perd',
      boundary: 'Límit de l’àrea d’estudi',
      real: 'Estació real',
      added: 'Estació nova (hipotètica)',
      reach: 'Abast d’una de nova o moguda',
      removed: 'Estació treta',
    },
    error: 'No s’ha pogut calcular la cobertura.',
    calculating: 'Calculant la cobertura…',
    recalculating: 'Recalculant…',
    noChange: 'sense canvi',
    lessThan100: 'menys de 100 m²',
    points: (value) => `${value} punts`,
    lessThanAPoint: 'menys de 0,01 punts',
    noEffect: (n: NoEffectInput) => {
      const radius = `${String(n.radius)} m`;
      const inside = n.municipality ? `a ${n.areaName}` : 'al districte';
      const outsideOf = n.municipality ? `fora ${ofPlace(n.areaName)}` : 'fora del districte';
      if (n.moved === 0 && n.removed === 0) {
        if (n.addedOutside) {
          return n.added === 1
            ? `Aquesta estació queda ${outsideOf}: no compta per al percentatge.`
            : `Aquestes estacions queden ${outsideOf}: no compten per al percentatge.`;
        }
        return n.added === 1
          ? `Aquesta estació no afegeix superfície: ${inside}, tot el que és a menys de ${radius} d’ella ja ho cobreix la xarxa real.`
          : `Aquestes estacions no afegeixen superfície: ${inside}, tot el que és a menys de ${radius} d’elles ja ho cobreix la xarxa real.`;
      }
      if (n.added === 0 && n.moved === 0) {
        if (n.removedOutside) {
          return n.removed === 1
            ? `Aquesta estació queda ${outsideOf}: treure-la no canvia el percentatge.`
            : `Aquestes estacions queden ${outsideOf}: treure-les no canvia el percentatge.`;
        }
        return n.removed === 1
          ? `Treure-la no resta superfície: ${inside}, el que cobria ho cobreixen també altres estacions.`
          : `Treure-les no resta superfície: ${inside}, el que cobrien ho cobreixen també altres estacions.`;
      }
      if (n.added === 0 && n.removed === 0) {
        return n.moved === 1
          ? `Moure-la no canvia la superfície: ${inside}, el que deixa i el que abasta ho cobreixen també altres estacions.`
          : `Moure-les no canvia la superfície: ${inside}, el que deixen i el que abasten ho cobreixen també altres estacions.`;
      }
      return `Aquests canvis no mouen la superfície coberta ${inside}.`;
    },
  },
};
