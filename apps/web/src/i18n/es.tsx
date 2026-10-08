import type { ReactNode } from 'react';
import {
  dayParts,
  dayRuns,
  daysByMonth,
  durationParts,
  formatDateTime,
  formatDay,
  formatDayMonth,
  formatLocalDate,
  formatLocalDayMonth,
  formatTime,
  joinList,
  monthName,
  monthsByYear,
  sameLocalDay,
  sameLocalYear,
  yearsOf,
} from './intl';
import type {
  AvailabilityKey,
  ChangeKind,
  CoverageKey,
  GapInput,
  IngestionTotalsInput,
  ListOrderKey,
  NoEffectInput,
  Origin,
  SilenceKey,
  SourceTexts,
  StatusKey,
} from './types';

// Castellano: el idioma de partida. Los otros dos tienen la misma forma (Messages) y TypeScript
// avisa si les falta o les sobra algo.

const list = (items: readonly string[]) => joinList(items, 'y');
const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** «las 23:39» el mismo día, «el 28 de mayo» el mismo año y, si no, «el 12 de junio de 2025». */
function sinceWhen(iso: string, reference: string): string {
  if (sameLocalDay(iso, reference)) return `las ${formatTime(iso)}`;
  if (sameLocalYear(iso, reference)) return `el ${formatDayMonth(iso)}`;
  return `el ${formatDay(iso)}`;
}

function duration(fromIso: string, toIso: string): string {
  const { minutes, hours, rest, days } = durationParts(fromIso, toIso);
  if (minutes < 1) return 'menos de 1 min';
  if (hours === 0) return `${String(minutes)} min`;
  if (hours >= 48) return `${String(days)} días`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/** «del 4 al 31 de mayo», con el año si se pide. */
function runText([first, last]: [string, string], withYear: boolean): string {
  const a = dayParts(first);
  const b = dayParts(last);
  const year = (y: string) => (withYear ? ` de ${y}` : '');
  if (first === last) return `el ${String(a.d)} de ${a.m}${year(a.y)}`;
  if (a.y === b.y && a.m === b.m) {
    return `del ${String(a.d)} al ${String(b.d)} de ${b.m}${year(b.y)}`;
  }
  if (a.y === b.y) return `del ${String(a.d)} de ${a.m} al ${String(b.d)} de ${b.m}${year(b.y)}`;
  return `del ${String(a.d)} de ${a.m} de ${a.y} al ${String(b.d)} de ${b.m} de ${b.y}`;
}

const AVAILABILITY_LABEL: Record<AvailabilityKey, string> = {
  available: 'Con bicis',
  few: 'Pocas bicis',
  empty: 'Sin bicis',
  full: 'Llena',
  outOfService: 'Fuera de servicio',
  unknown: 'Sin dato reciente',
};

export const es = {
  languages: { label: 'Idioma' },
  brand: { tagline: 'Estaciones de Bicing en el mapa' },
  modes: {
    label: 'Modo',
    explore: 'Explorar',
    replay: 'Reproducir',
    experiment: 'Experimentar',
    balance: 'Balance',
  },

  balance: {
    title: 'Balance entre dos horas',
    day: 'Día',
    from: 'De',
    to: 'a',
    hint: (from: string, to: string) =>
      `Bicis ancladas en cada estación a las ${to} menos las que había a las ${from}. Son dos estados, no viajes: lo que entra y sale entre medias no se ve.`,
    gained: (stations: number) => `bicis más, en ${count(stations, 'estación', 'estaciones')}`,
    lost: (stations: number) => `bicis menos, en ${count(stations, 'estación', 'estaciones')}`,
    rest: (same: number, nodata: number, known: number, before: number, after: number) =>
      `${String(same)} igual · ${String(nodata)} sin dato en alguno de los dos momentos · en las ${String(known)} con dato en los dos, de ${String(before)} a ${String(after)} bicis ancladas.`,
    /** «Ganan bicis Les Corts, Ciutat Vella y Sant Martí; pierden Sant Andreu y Gràcia.» */
    story: (gainers: readonly string[], losers: readonly string[]) => {
      const win =
        gainers.length === 0 ? 'Ningún distrito gana bicis' : `Ganan bicis ${list(gainers)}`;
      const lose = losers.length === 0 ? 'ninguno pierde' : `pierden ${list(losers)}`;
      return `${win}; ${lose}.`;
    },
    byDistrict: 'Por distrito',
    byAltitude: 'Por altitud',
    /** Tres grupos con el mismo número de estaciones, por su altitud publicada. */
    band: {
      low: (max: number) => `Hasta ${String(max)} m`,
      mid: (min: number, max: number) => `De ${String(min)} a ${String(max)} m`,
      high: (min: number) => `Más de ${String(min)} m`,
    },
    altitudeNote: 'Tres grupos con el mismo número de estaciones, por su altitud publicada.',
    perStation: (value: string) => `${value} por estación`,
    districtMeta: (stations: number, net: string) => `${String(stations)} est. · ${net} bicis`,
    topGain: 'Las que más se llenan',
    topLoss: 'Las que más se vacían',
    /** «2 → 41 de 43»: las bicis en cada momento y, si se sabe, la capacidad. */
    place: (before: number, after: number, capacity: number | null) =>
      `${String(before)} → ${String(after)}${capacity === null ? '' : ` de ${String(capacity)}`}`,
    unit: 'bicis',
    loading: 'Calculando el balance…',
    failed: 'No se ha podido cargar el momento de partida.',
    none: 'Ninguna estación tiene dato en los dos momentos.',
    key: {
      title: (from: string, to: string) => `Balance de ${from} a ${to}`,
      gain: 'Ganan bicis',
      loss: 'Pierden bicis',
      same: 'Igual',
      nodata: 'Sin dato en uno de los dos momentos',
      hint: 'El tamaño dice cuántas bicis cambian. A escala de calle, el número: «+39» o «−23».',
    },
  },

  format: {
    duration,
    /** Meses de unos días locales: «mayo de 2026», «mayo y agosto de 2026». Sin días, null. */
    months: (days: readonly string[]): string | null => {
      const byYear = monthsByYear(days);
      if (byYear.length === 0) return null;
      return list(byYear.map(([year, names]) => `${list(names)} de ${year}`));
    },
    /** «2 anclajes», «1 bici» */
    count,
  },

  map: {
    failed: 'No se ha podido cargar el mapa base. La lista de estaciones sigue disponible.',
    unsupported:
      'Este navegador no puede dibujar el mapa porque no tiene WebGL2. La lista de estaciones sigue disponible.',
    degraded: 'Parte del mapa base no ha cargado.',
    lost: 'El mapa se ha detenido un momento. Vuelve en cuanto el navegador lo permita.',
    region: 'Mapa de estaciones',
    pitch: 'Vista 3D',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    resetBearing: 'Orientar al norte',
    attribution: 'Mostrar atribuciones',
    title: 'Mapa',
  },

  app: {
    sourcesError: 'No se han podido cargar las fuentes de datos.',
    retry: 'Reintentar',
    noData: 'Todavía no hay datos cargados.',
    noDataHint: (command: ReactNode): ReactNode => <>En local, importa la demo con {command}.</>,
    stationsError: 'No se han podido cargar las estaciones.',
    loading: 'Cargando estaciones…',
    search: 'Buscar estación',
    count: (shown: number, total: number) =>
      shown === total
        ? count(total, 'estación', 'estaciones')
        : `${String(shown)} de ${String(total)} estaciones`,
    noMatch: 'Ninguna estación coincide con la búsqueda y los filtros.',
    showAll: 'Mostrar todas',
    order: 'Orden',
    orders: {
      name: 'Nombre',
      bikes: 'Más bicis',
      docks: 'Más anclajes libres',
      ebikes: 'Más eléctricas',
      distance: 'Más cerca de mí',
    } as Record<ListOrderKey, string>,
    nearMe: 'Cerca de mí',
    locating: 'Buscándote…',
    located:
      'Ordenadas de más cerca a más lejos de donde estás, en línea recta. Tu ubicación no sale del navegador.',
    /** Con un error grande («±1,8 km»), el orden vale poco y se dice. */
    locatedRough: (error: string) =>
      `Ubicación aproximada (±${error}): ordenadas de más cerca a más lejos, en línea recta. Tu ubicación no sale del navegador.`,
    locationOutside: 'Estás fuera de Barcelona: la lista no se ordena por distancia.',
    locationDenied:
      'El navegador no ha dado permiso para saber dónde estás. Puedes cambiarlo en sus ajustes del sitio.',
    locationUnavailable: 'El navegador no ha podido saber dónde estás.',
    locationTimeout: 'El navegador ha tardado demasiado en saber dónde estás. Vuelve a intentarlo.',
    locationUnsupported: 'Este navegador no da la ubicación.',
    listTitle: 'Estaciones',
    onlyOnMap: 'Solo las del mapa',
    noneOnMap: 'Ninguna estación en la parte del mapa que se ve. Mueve el mapa o acércate menos.',
    wholeList: 'Ver toda la lista',
    linkStationMissing: (id: string) =>
      `El enlace pedía la estación «${id}», que no está en esta fuente: se enseña la lista.`,
    linkDayMissing: (day: string) =>
      `El enlace pedía el ${day}, que no está importado: se enseña otro día.`,
    truncated: 'La API ha devuelto solo una parte de las estaciones de esta zona: faltan algunas.',
    source: 'Fuente',
    demoSuffix: '(demo)',
    crashed: 'Algo ha fallado al pintar la aplicación.',
    reload: 'Recargar',
  },

  api: {
    tooMany:
      'La API ha recibido demasiadas peticiones seguidas. Espera un minuto y vuelve a intentarlo.',
    status: (status: string) => `La API respondió ${status}.`,
    noStatus: 'sin estado',
    unreachable:
      'No se ha podido contactar con la API. Comprueba la conexión y vuelve a intentarlo.',
  },

  source: {
    timeZone: 'hora de Barcelona',
    demoBadge: 'Demo',
    demoLead: 'Datos inventados para probar la aplicación. No es la disponibilidad real de Bicing.',
    shownMoment: 'Momento mostrado',
    changeMoment: 'Cambiar momento',
    thisHour: 'A esta hora',
    more: 'Más',
    less: 'Menos',
    realBadge: 'Datos reales',
    past: 'Es un momento del pasado, no el estado actual.',
    historical: (months: string) => `Datos históricos · ${months}. No es el estado actual.`,
    noObservations: 'Sin observaciones en este momento.',
    lastObservation: 'Última observación',
    license: (license: string) => `Licencia ${license}.`,
    dataset: 'Ver el conjunto de datos',
    limits: 'Qué muestra y qué no',
    share: 'Copiar enlace',
    shared: 'Enlace copiado.',
    sharedNoCamera: 'Enlace copiado, sin la posición del mapa.',
    shareFailed: 'El navegador no deja copiarlo. Cópialo de aquí:',
    shareUrl: 'Enlace de esta vista',
    /** En castellano manda la API: nombre y atribución tal como los guarda. */
    texts: {} as SourceTexts,
  },

  availability: {
    label: AVAILABILITY_LABEL,
    hint: (category: AvailabilityKey, fewMax: number): string => {
      switch (category) {
        case 'available':
          return `${String(fewMax + 1)} o más`;
        case 'few':
          return `de 1 a ${String(fewMax)}`;
        case 'empty':
          return 'ninguna libre';
        case 'full':
          return 'sin anclajes libres';
        case 'outOfService':
          return 'no opera';
        case 'unknown':
          return 'no es cero';
      }
    },
    status: {
      in_service: 'En servicio',
      maintenance: 'En mantenimiento',
      closed: 'Cerrada',
      planned: 'Prevista',
      unknown: 'Desconocido',
    } as Record<StatusKey, string>,
    quality: {
      counts_exceed_capacity: 'Bicis y anclajes suman más que la capacidad publicada.',
      bike_types_mismatch: 'Mecánicas y eléctricas no suman el total publicado.',
    } as Record<string, string>,
    legend: 'Qué significa cada marcador',
    legendHelp: 'Pulsa una categoría para ocultarla o mostrarla.',
    numberLabel: 'Número en el mapa y la lista',
    numberBikes: 'Bicis',
    numberEbikes: 'Eléctricas',
    numberEbikesHelp:
      'Cuántas eléctricas hay en cada estación. Las que no tienen ninguna se atenúan; el color sigue diciendo si hay bicis.',
    numberDocks: 'Anclajes',
    numberDocksHelp:
      'Cuántos anclajes libres hay en cada estación. Las llenas se atenúan; el color sigue diciendo si hay bicis.',
    presetsLabel: 'Atajos',
    presets: { bike: 'Quiero una bici', park: 'Quiero aparcar' },
    mapKey: 'También en el mapa',
    bikeLane: 'Carril bici (OSM, no todos)',
    transit: 'Metro, tren y tranvía',
    me: 'Tu ubicación',
  },

  districts: {
    title: 'Por distrito',
    label: 'Distrito',
    all: 'Todos los distritos',
    none: 'Sin distrito',
    stations: 'Estaciones',
    empty: 'Sin bicis',
    full: 'Llenas',
    unknown: 'Sin dato',
    note: 'Sin dato va aparte: no cuenta como sin bicis ni como llena.',
  },

  list: {
    /** Con la fecha si no es del mismo día: «desde las 10:54» no puede querer decir junio de 2025. */
    staleSince: (label: string, iso: string, at: string) => `${label} desde ${sinceWhen(iso, at)}`,
    never: 'Ningún dato hasta este momento',
    noRenting: (label: string) => `${label}, sin préstamo`,
    noReturning: (label: string) => `${label}, sin devoluciones`,
    srBikes: (n: number) => (n === 1 ? '1 bici' : `${String(n)} bicis`),
    srDocks: (n: number) => (n === 1 ? '1 anclaje libre' : `${String(n)} anclajes libres`),
    unitBikes: (n: number): string => (n === 1 ? 'bici' : 'bicis'),
    unitDocks: 'libres',
    unitEbikes: 'eléc.',
  },

  pattern: {
    title: 'Cómo suele estar',
    lead: (days: number, period: string) =>
      `Cómo estuvo a cada hora en los ${String(days)} días importados (${period}), mirado cada 15 minutos. Es lo que pasó, no una previsión.`,
    weekdays: 'Laborables',
    weekend: 'Fin de semana',
    days: (n: number) => (n === 1 ? '1 día' : `${String(n)} días`),
    holidays: 'Los festivos cuentan como laborables.',
    emptyMost: (hour: number, share: string) =>
      `De ${String(hour)} a ${String(hour + 1)} h estuvo sin bicis el ${share} del tiempo.`,
    emptyRare: 'Casi nunca se quedó sin bicis.',
    fullMost: (hour: number, share: string) =>
      `De ${String(hour)} a ${String(hour + 1)} h estuvo llena, sin sitio para dejar la bici, el ${share} del tiempo.`,
    unknownShare: (share: string) => `Sin dato el ${share} del tiempo.`,
    /** La hora que se ve en el mapa: cuántas veces tuvo alguna bici y la mediana, si hay dato. */
    atHour: (hour: number, share: string, median: number | null) =>
      `De ${String(hour)} a ${String(hour + 1)} h tuvo alguna bici el ${share} del tiempo${
        median === null ? '.' : `; la mediana, ${count(median, 'bici', 'bicis')}.`
      }`,
    noDays: 'Aún no hay días importados de esta fuente.',
    loading: 'Calculando cómo suele estar…',
    failed: 'No se ha podido calcular cómo suele estar.',
    demo: 'Con los datos inventados de la demo.',
    now: 'Hora que se ve en el mapa',
    unknown: 'Sin dato',
  },

  detail: {
    back: 'Volver a la lista',
    neverReported: 'Esta estación no ha enviado ninguna observación hasta el momento mostrado.',
    /** «La última observación es de las 07:45» el mismo día; si no, «del 12 de junio de 2025, 10:54». */
    lastObservation: (p: {
      sameDay: boolean;
      when: ReactNode;
      /** La hora («07:45»): en catalán, «de la 01:30» pero «de les 07:45». */
      clock: string;
      duration: string;
      tolerance: number;
    }): ReactNode => (
      <>
        La última observación es {p.sameDay ? 'de las' : 'del'} {p.when}, {p.duration} antes del
        momento mostrado. Pasados {p.tolerance} min sin datos, el estado se da por desconocido: no
        se supone que esté vacía.
      </>
    ),
    docks: (n: number) => count(n, 'anclaje', 'anclajes'),
    bikes: (n: number) => count(n, 'bici', 'bicis'),
    and: 'y',
    bikeSplit: (mechanical: number, electric: number) =>
      `${String(mechanical)} mecánicas y ${String(electric)} eléctricas`,
    noSplit: 'Sin desglose por tipo',
    /** «Dato de las 07:45 del 20 de agosto de 2026». La hora va aparte para el artículo catalán. */
    observedAt: ({ time, day }: { time: ReactNode; day: string; clock: string }): ReactNode => (
      <>
        Dato de las {time} del {day}
      </>
    ),
    bikesAvailable: 'Bicis disponibles',
    docksFree: 'Anclajes libres',
    capacityOf: (capacity: number) => `de ${String(capacity)} de capacidad`,
    outOfService:
      'La estación no está operativa. Las cifras son las que publica, pero puede que no se puedan coger ni devolver bicis.',
    notRenting: 'En este momento la estación no permite coger bicis, aunque tenga.',
    notReturning:
      'En este momento la estación no admite devoluciones, aunque tenga anclajes libres.',
    unavailable: 'No disponibles',
    capacity: 'Capacidad publicada',
    notPublished: 'No publicada',
    altitude: 'Altitud',
    metres: (metres: number) => `${String(Math.round(metres))} m`,
    nearby: 'Cercanas',
    nearbyNote: 'Las más próximas, en línea recta (no a pie), con su estado en este momento.',
    last: 'Última observación',
    none: 'Ninguna',
    source: 'Fuente',
    demoSource: 'Demo con datos inventados',
    id: (id: string) => ` (identificador ${id})`,
    /** Los cambios de atributos en los días importados, que la API guarda por versiones. */
    changes: (n: number) => `Cambios de esta estación (${String(n)})`,
    knownSince: (since: string) => `Vista por primera vez el ${since}.`,
    noChanges: (since: string) =>
      `Sin cambios de nombre, sitio ni capacidad en los días importados; vista por primera vez el ${since}.`,
    changesLoading: 'Buscando cambios de la estación…',
    changesFailed: 'No se han podido cargar los cambios de la estación.',
    changeCapacity: (from: number | null, to: number | null) =>
      `capacidad de ${from === null ? 'no publicada' : String(from)} a ${to === null ? 'no publicada' : String(to)} anclajes`,
    changeName: (from: string, to: string) => `de «${from}» a «${to}»`,
    changeAddress: (from: string | null, to: string | null) =>
      `dirección de «${from ?? '—'}» a «${to ?? '—'}»`,
    changeMoved: (distance: string) => `se movió ${distance}`,
    changeAltitude: (from: number, to: number) => `altitud de ${String(from)} a ${String(to)} m`,
    metadataAssumed:
      'El nombre, la ubicación y la capacidad son de una publicación posterior a este momento.',
    /** Alta y baja: cuándo la fuente empezó o dejó de listar la estación, dentro de lo importado. */
    added: 'Alta',
    removed: 'Baja',
    addedValue: (at: string, absentOn: string, gap: boolean) =>
      gap
        ? `${formatDay(at)} · el ${formatLocalDayMonth(absentOn)}, último día importado antes, no estaba en la lista de la fuente`
        : `${formatDateTime(at)} · el ${formatLocalDayMonth(absentOn)} no estaba en la lista de la fuente`,
    removedValue: (lastDay: string, absentFrom: string, gap: boolean) =>
      gap
        ? `${formatLocalDate(lastDay)} · el ${formatLocalDayMonth(absentFrom)}, siguiente día importado, ya no estaba en la lista de la fuente`
        : `${formatLocalDate(lastDay)} · el ${formatLocalDayMonth(absentFrom)} ya no estaba en la lista de la fuente`,
    notYetListed: (at: string) =>
      `La fuente aún no publicaba esta estación: la listó por primera vez el ${formatDateTime(at)}.`,
    noLongerListed: (absentFrom: string) =>
      `La fuente dejó de publicar esta estación: el ${formatLocalDate(absentFrom)} ya no estaba en su lista.`,
  },

  replay: {
    deck: 'Reproducir un día',
    slider: 'Momento del día',
    empty: 'Sin bicis',
    full: 'Llenas',
    scale: (n: number) => `escala: ${String(n)} estaciones`,
    play: 'Reproducir el día',
    pause: 'Pausar',
    stepBack: (minutes: number) => `${String(minutes)} minutos antes`,
    stepForward: (minutes: number) => `${String(minutes)} minutos después`,
    speed: 'Velocidad',
    speeds: { lenta: 'Lenta', normal: 'Normal', rapida: 'Rápida' },
    loadingDay: 'Cargando el día…',
    dayFailed: 'No se ha podido cargar el día.',
    stationsLoading: 'Cargando el estado de las estaciones…',
    stationsFailed: 'No se ha podido cargar el estado de las estaciones en este momento.',
    noData: 'Sin datos en este momento: ninguna estación había informado.',
    countEmpty: (n: ReactNode): ReactNode => <>{n} sin bicis</>,
    countFull: (n: ReactNode): ReactNode => <>{n} llenas</>,
    /**
     * Bicis (con las eléctricas, si todas las contadas publican el desglose) y anclajes libres
     * sumados; cada total puede faltar (ninguna estación lo publicaba).
     */
    countTotals: (
      bikes: ReactNode | null,
      docks: ReactNode | null,
      ebikes: ReactNode | null,
    ): ReactNode => {
      const bikesPart =
        bikes === null ? null : (
          <>
            {bikes} bicis{ebikes !== null && <> ({ebikes} eléctricas)</>}
          </>
        );
      return bikesPart !== null && docks !== null ? (
        <>
          {bikesPart} y {docks} anclajes libres
        </>
      ) : bikesPart !== null ? (
        bikesPart
      ) : (
        <>{docks} anclajes libres</>
      );
    },
    counted: (n: number) => `en ${String(n)} estaciones`,
    countedNote: 'Las operativas que publican bicis y anclajes. Las demás no suman.',
    /** Escala de la línea de bicis en la pista: «bicis en las estaciones: de 0 a 6000». */
    bikesScale: (max: string) => `bicis en las estaciones: de 0 a ${max}`,
    withDataNote: (tolerance: string) =>
      `Las que informaron en los ${tolerance} minutos anteriores. Las demás no cuentan como vacías ni como llenas.`,
    withData: (withData: number, known: number) =>
      `${String(withData)} de ${String(known)} con dato`,
    valueLoading: 'Cargando',
    valueNoData: (moment: string) => `${moment}. Sin datos.`,
    value: (moment: string, empty: number, full: number, withData: number, known: number) =>
      `${moment}. ${String(empty)} sin bicis, ${String(full)} llenas, ${String(withData)} de ${String(known)} con dato.`,
    previousWeek: 'Semana anterior',
    nextWeek: 'Semana siguiente',
    dayGroup: 'Día',
    dayNoData: (label: string) => `${label}, sin datos`,
    noImported: 'Sin datos importados',
  },

  limits: {
    coverage: {
      complete: 'casi todas con dato',
      partial: 'faltan algunas',
      none: 'ninguna con dato',
    } as Record<CoverageKey, string>,
    silenceTitle: {
      never: ['Ningún dato hasta este momento', 'Ningún dato hasta este momento'],
      days: ['Lleva días sin informar', 'Llevan días sin informar'],
      hours: ['Lleva horas sin informar', 'Llevan horas sin informar'],
      minutes: ['Acaba de dejar de informar', 'Acaban de dejar de informar'],
    } as Record<SilenceKey, [string, string]>,
    /** «mayo de 2026», sobre cada mes de la rejilla. */
    month: (year: number, month: number) => `${monthName(year, month)} de ${String(year)}`,
    dayRow: (day: string, coverage: string) =>
      `${day}: ${coverage} en el peor momento. Reproducir ese día.`,
    measuring: 'Midiendo los huecos…',
    holesError: 'No se han podido medir los huecos.',
    average: (share: string, step: number) =>
      `De media, el ${share} de las estaciones tienen dato en cada paso de ${String(step)} minutos.`,
    noneBelow: 'Ningún paso por debajo del 95 %.',
    below: (n: number, steps: number, days: string) =>
      `${String(n)} de ${String(steps)} pasos por debajo del 95 %: ${days}.`,
    legend: 'Qué significa cada casilla',
    legendComplete: '95 % o más con dato',
    legendPartial: 'Faltan algunas',
    legendNone: 'Ninguna',
    gridNote: (step: number) =>
      `Cada fila es un día y cada casilla, una hora (medida cada ${String(step)} minutos). Pulsa un día para reproducirlo.`,
    allWithData: (when: string, total: number) =>
      `${when}: las ${String(total)} estaciones tienen dato.`,
    someSilent: (when: string, silent: number, total: number) =>
      `${when}: ${String(silent)} de ${String(total)} estaciones sin dato. No cuentan como vacías: su estado es desconocido.`,
    back: 'Volver',
    title: 'Qué muestra y qué no',
    lead: (stations: number, period: string | null) =>
      `Cómo estaban las ${String(stations)} estaciones de Bicing ${period ?? ''}, según el archivo que publica el Ajuntament de Barcelona. Es el pasado: no lo que pasa ahora.`,
    data: 'Los datos',
    holes: 'Huecos',
    silent: 'Sin dato en este momento',
    notSaidTitle: 'Lo que no dice',
    originsTitle: 'De dónde sale cada cosa',
    period: 'Periodo',
    periodValue: (period: string | null, days: number) =>
      `${period ?? ''} (${count(days, 'día', 'días')})`,
    lastData: 'Último dato',
    rhythm: 'Ritmo',
    rhythmValue: 'Una foto de toda la red cada 5 minutos',
    expiry: 'Caducidad',
    expiryValue: (tolerance: number) =>
      `A los ${String(tolerance)} minutos sin informar, el estado de una estación pasa a desconocido`,
    stations: 'Estaciones',
    observations: 'Observaciones guardadas',
    lastIngestion: 'Última importación',
    ingestionStatus: {
      running: 'en marcha',
      succeeded: 'terminada',
      succeeded_with_issues: 'terminada con avisos',
      failed: 'fallida',
    },
    lastIngestionValue: (
      when: string,
      status: string,
      accepted: string,
      duplicate: string,
      conflicting: string,
      rejected: string,
    ) =>
      `${when}, ${status}: ${accepted} nuevas, ${duplicate} repetidas, ${conflicting} en conflicto, ${rejected} rechazadas.`,
    /** Lo que entró en cada importación, según el registro de la ingesta. */
    ingestionsLead: (n: IngestionTotalsInput) => {
      const text =
        `${count(n.runs, 'importación', 'importaciones')} en ${count(n.periods, 'día', 'días')}: ` +
        `${n.accepted} observaciones nuevas, ${n.duplicate} repetidas, ${n.conflicting} en conflicto y ${n.rejected} rechazadas.`;
      const failed = n.failed === 0 ? '' : ` ${count(n.failed, 'día falló', 'días fallaron')}.`;
      const purged =
        n.purged === 0 ? '' : ` ${count(n.purged, 'día borrado', 'días borrados')} después.`;
      return text + failed + purged;
    },
    ingestionsTitle: 'Lo que entró cada día',
    ingestionsLoading: 'Leyendo las importaciones…',
    ingestionsError: 'No se han podido leer las importaciones.',
    ingestionsNone: 'Todavía no se ha importado ningún día.',
    ingestionDay: 'Día',
    ingestionNew: 'Nuevas',
    ingestionDuplicate: 'Repetidas',
    ingestionConflicting: 'En conflicto',
    ingestionRejected: 'Rechazadas',
    ingestionTimes: (n: number) => `${String(n)} veces`,
    ingestionFailed: 'falló',
    ingestionPurged: 'borrado',
    ingestionsNote:
      'Observaciones. Repetidas: ya estaban, con los mismos valores. En conflicto: ya estaban con otros valores y se conservó la primera. Rechazadas: no entraron (estaciones incluidas).',
    rejectionsTitle: 'Rechazos, por motivo:',
    noRejections: 'Ningún registro rechazado.',
    /** «3 observaciones: recuento negativo» */
    rejectionLine: (n: number, kind: string, reason: string) => {
      const kinds: Record<string, [string, string]> = {
        station: ['estación', 'estaciones'],
        observation: ['observación', 'observaciones'],
        input: ['entrada', 'entradas'],
      };
      const [one, many] = kinds[kind] ?? [kind, kind];
      return `${count(n, one, many)}: ${reason}`;
    },
    rejectionReason: {
      missing_field: 'falta un campo',
      invalid_value: 'valor no válido',
      ambiguous_timestamp: 'hora sin zona horaria',
      timestamp_in_future: 'hora en el futuro',
      coordinates_out_of_range: 'coordenadas imposibles',
      outside_service_area: 'fuera del área de servicio',
      negative_count: 'recuento negativo',
      duplicate_in_batch: 'repetido en el mismo archivo',
      unknown_station: 'estación desconocida',
      metadata_older_than_current: 'atributos más antiguos que los vigentes',
      metadata_inside_known_period: 'cambio de atributos dentro de un periodo ya conocido',
    } as Record<string, string | undefined>,
    dataset: 'El conjunto de datos de Bicing en Open Data BCN',
    code: 'Código, decisiones y mediciones:',
    /** «Ningún dato hasta este momento», «Sin datos desde el 28 de mayo» o «16 min sin datos». */
    silentNever: 'Ningún dato hasta este momento',
    silentSince: (iso: string, at: string) => `Sin datos desde ${sinceWhen(iso, at)}`,
    silentFor: (iso: string, at: string) => `${duration(iso, at)} sin datos`,
    /** Entre las estaciones sin dato: la fuente aún no la publicaba, o ya no. */
    notYetListed: (at: string) =>
      `Aún no publicada: la fuente la listó por primera vez el ${formatDayMonth(at)}, ${formatTime(at)}`,
    noLongerListed: (absentFrom: string) =>
      `Ya no publicada: el ${formatLocalDayMonth(absentFrom)} no estaba en la lista de la fuente`,
    /** Altas y bajas: estaciones que la fuente empezó o dejó de listar en los días importados. */
    lifecycleTitle: 'Altas y bajas',
    lifecycleOneDay:
      'Con un solo día importado no se puede saber si alguna estación entró o salió de la lista de la fuente.',
    lifecycleLead: (added: number, removed: number) => {
      if (added === 0 && removed === 0) {
        return 'En los días importados, la fuente no empezó ni dejó de publicar ninguna estación.';
      }
      const started =
        added === 0
          ? 'no empezó a publicar ninguna estación'
          : `empezó a publicar ${count(added, 'estación', 'estaciones')}`;
      const stopped =
        removed === 0
          ? 'no dejó de publicar ninguna'
          : `dejó de publicar ${count(removed, 'estación', 'estaciones')}`;
      return `En los días importados, la fuente ${started} y ${stopped}.`;
    },
    addedGroup: 'Altas',
    removedGroup: 'Bajas',
    addedWhy: (at: string, absentOn: string, gap: boolean) =>
      gap
        ? `Desde el ${formatDayMonth(at)}; el ${formatLocalDayMonth(absentOn)}, último día importado antes, no estaba`
        : `Desde el ${formatDayMonth(at)}, ${formatTime(at)}; el ${formatLocalDayMonth(absentOn)} no estaba`,
    removedWhy: (lastDay: string, absentFrom: string, gap: boolean) =>
      gap
        ? `Hasta el ${formatLocalDayMonth(lastDay)}; el ${formatLocalDayMonth(absentFrom)}, siguiente día importado, ya no estaba`
        : `Hasta el ${formatLocalDayMonth(lastDay)}; el ${formatLocalDayMonth(absentFrom)} ya no estaba`,
    lifecycleNote:
      'Solo con lo importado: una estación que la fuente deja de listar puede volver más adelante, y una que aparece pudo entrar en servicio cualquier día anterior sin importar. Que una estación deje de informar no es una baja: sigue en la lista de la fuente.',
    /**
     * Periodo de unos días locales ordenados: «del 4 al 31 de mayo de 2026» o, con huecos, «del 4
     * al 31 de mayo y del 17 al 30 de agosto de 2026». Sin días, null.
     */
    periodOf: (days: readonly string[]): string | null => {
      const runs = dayRuns(days);
      if (runs.length === 0) return null;
      const years = yearsOf(days);
      const oneYear = years.length === 1;
      const joined = list(runs.map((r) => runText(r, !oneYear)));
      return oneYear ? `${joined} de ${years[0] ?? ''}` : joined;
    },
    /** «6, 13, 20 y 27 de mayo» */
    listDays: (days: readonly string[]) =>
      list(daysByMonth(days).map(([m, ds]) => `${list(ds.map(String))} de ${m}`)),
    /** Bajo la pista de «Reproducir»: a qué horas del día informó menos del 95 % de las estaciones. */
    gap: (g: GapInput): string => {
      if (g.allNone) return 'Sin datos en todo el día.';
      const ranges = g.ranges.map((r) =>
        r.to === null ? `a las ${r.from}` : `de ${r.from} a ${r.to}`,
      );
      if (ranges.length === 0)
        return `Todo el día con dato del ${g.share} de las estaciones o más.`;
      const shown = ranges.slice(0, 3);
      const rest = ranges.length - shown.length;
      const text =
        rest > 0 ? `${shown.join(', ')} y ${count(rest, 'tramo', 'tramos')} más` : list(shown);
      return `Menos del ${g.share} de las estaciones con dato ${text}.`;
    },
    /** Lo que la aplicación no dice, en el orden en que alguien suele suponerlo. */
    notSaid: (tolerance: number) => [
      'No es tiempo real: es un archivo del pasado.',
      `Sin dato no es cero: una estación que lleva más de ${String(tolerance)} minutos sin informar sale como desconocida, no como vacía.`,
      'Un cambio en el número de bicis no es un viaje: no se sabe de dónde vienen ni adónde van.',
      'La cobertura es geometría en línea recta. No es a pie, ni población, ni demanda.',
      'No predice ni recomienda nada.',
      'Los carriles bici del mapa no son todos: solo los que OpenStreetMap dibuja aparte de la calzada.',
    ],
    /** De dónde sale cada cosa que se ve. */
    origins: (months: string | null): Origin[] => {
      const when = months === null ? '' : `, ${months}`;
      return [
        {
          what: 'Estado de las estaciones',
          who: `Ajuntament de Barcelona, Open Data BCN${when}`,
          terms: 'CC BY 4.0, datos transformados',
        },
        {
          what: 'Nombre, ubicación y capacidad',
          who: `Ajuntament de Barcelona, Open Data BCN${when}`,
          terms: 'CC BY 4.0',
        },
        {
          what: 'Distritos para la cobertura',
          who: 'Ajuntament de Barcelona, Open Data BCN (2017)',
          terms: 'CC BY 4.0',
        },
        {
          what: 'Mapa base y edificios',
          who: 'OpenFreeMap, OpenMapTiles y OpenStreetMap',
          terms: 'ODbL',
        },
        {
          what: 'Calles, carriles bici, metro y parques',
          who: 'OpenStreetMap, a través de OpenMapTiles y OpenFreeMap',
          terms: 'ODbL',
        },
        { what: 'Estaciones hipotéticas', who: 'Las pones tú', terms: 'No se guardan' },
      ];
    },
  },

  stamp: {
    demo: 'Demo',
    demoValue: 'Datos inventados',
    network: 'Red real del',
    historical: 'Histórico, no es tiempo real',
    hypothetical: 'con cambios hipotéticos',
  },

  contract: {
    title: 'Contrato de la API',
    tagline: 'Lo que la API publica, leído del documento OpenAPI que genera al compilar.',
    intro: (json: ReactNode): ReactNode => (
      <>
        Rutas, parámetros, respuestas y esquemas tal como los declara el código: esta página lee{' '}
        {json} del mismo servidor que la sirve, no una copia. Las descripciones están en castellano,
        como las escribe la API.
      </>
    ),
    jsonLink: 'el documento OpenAPI (JSON)',
    version: (openapi: string, version: string) => `OpenAPI ${openapi} · versión ${version}.`,
    rules: 'Reglas comunes',
    ruleList: [
      'Los instantes van en ISO 8601 con zona explícita; una hora sin zona se rechaza con 400. Las respuestas los devuelven en UTC.',
      'Falta de dato no es cero: un recuento ausente es `null`, y una estación sin observación dentro de la tolerancia de su fuente tiene el estado `unknown`.',
      'Lo observado y lo sintético no se mezclan: cada respuesta dice de qué fuente sale y de qué tipo es.',
      'Límite de 120 peticiones por minuto e IP; por encima, 429 con `Retry-After`.',
      'Estado, detalle, patrón, línea temporal y fotogramas llevan `ETag`: con `If-None-Match`, 304 mientras no cambien los datos de ese rango.',
      'El patrón de una estación espera un hueco unos segundos; si no lo hay, 503 con `Retry-After`.',
      'Los errores van en `application/problem+json`.',
    ],
    index: 'Rutas',
    tags: {
      Sources: 'Fuentes',
      Stations: 'Estaciones',
      History: 'Historia',
      Scenarios: 'Escenarios',
    } as Record<string, string>,
    parameters: 'Parámetros',
    noParameters: 'Sin parámetros.',
    body: 'Cuerpo de la petición',
    responses: 'Respuestas',
    required: 'obligatorio',
    in: { query: 'en la consulta', path: 'en la ruta', header: 'en la cabecera' } as Record<
      string,
      string
    >,
    schemas: 'Esquemas',
    schemasNote:
      'Los que nombra alguna ruta, con sus propiedades. Un tipo con «| null» admite nulo.',
    values: 'Valores:',
    loading: 'Leyendo el contrato…',
    failed: 'No se ha podido leer el contrato de la API.',
    retry: 'Reintentar',
    backToApp: 'Volver al mapa',
    code: 'Código, decisiones y mediciones:',
  },

  scope: {
    straight: {
      term: 'En línea recta',
      note: 'Distancia en línea recta desde cada estación, no a pie por calles: no es una isócrona.',
    },
    surface: {
      term: 'Superficie, no población',
      note: 'El porcentaje es sobre el área de estudio elegida, no sobre la población ni sobre otra zona.',
    },
    trips: {
      term: 'No mide viajes',
      note: 'La capacidad no cambia la cobertura. Nada de esto dice cuántos viajes, esperas o demanda habría.',
    },
  },

  scenario: {
    deck: 'Escenario de cobertura',
    real: 'Red real',
    stations: (n: number) => `${String(n)} estaciones`,
    label: 'Escenario',
    gains: (area: string) => `gana ${area}`,
    loses: (area: string) => `pierde ${area}`,
    of: (area: string, size: string, radius: number) =>
      `Del área de ${area} (${size}) a menos de ${String(radius)} m en línea recta.`,
    undo: 'Deshacer',
    reset: 'Volver a la red real',
    panelTitle: 'Escenario de cobertura',
    panelLead:
      'Qué parte de la ciudad queda cerca de una estación, en línea recta. Cambia la red sobre el mapa y compara. Mide geometría: no dice cuántos viajes habría.',
    reference: (when: string, n: number) => `Red real del ${when}: ${String(n)} estaciones.`,
    changes: 'Cambios',
    empty: 'Todavía es la red real. Elige Añadir, Mover o Quitar y toca el mapa.',
    assumptions: 'Supuestos del cálculo',
    toolsLabel: 'Herramientas del escenario',
    tools: {
      add: { label: 'Añadir', hint: 'Toca el mapa donde quieras una estación nueva.' },
      move: { label: 'Mover', hint: 'Arrastra una estación, real o nueva, a otro sitio.' },
      remove: { label: 'Quitar', hint: 'Toca una estación para sacarla del escenario.' },
    },
    toolDefault: 'Elige una herramienta para cambiar la red.',
    radius: 'Radio',
    radiusValue: (radius: number) => `${String(radius)} metros`,
    area: 'Área de estudio',
    districts: 'Distritos',
    hypothetical: 'Hipotético',
    up: 'Sube',
    down: 'Baja',
    what: { added: 'añadida', moved: 'movida', removed: 'quitada' } as Record<ChangeKind, string>,
    undoChange: { added: 'Quitar', moved: 'Devolver', removed: 'Recuperar' } as Record<
      ChangeKind,
      string
    >,
    stationFallback: (id: number) => `Estación ${String(id)}`,
    newStation: (n: string) => `Nueva ${n}`,
    model: (name: string, version: number) => `Modelo «${name}», versión ${String(version)}.`,
    /** En castellano manda la API: los supuestos tal como los devuelve. */
    assumptionsOf: (_model: string, _version: number, fromApi: readonly string[]) => fromApi,
    legend: {
      title: 'Qué se ve en el mapa',
      covered: 'Cubierto por la red real',
      gained: 'Lo que gana el escenario',
      lost: 'Lo que pierde',
      boundary: 'Límite del área de estudio',
      real: 'Estación real',
      added: 'Estación nueva (hipotética)',
      reach: 'Alcance de una nueva o movida',
      removed: 'Estación quitada',
    },
    error: 'No se ha podido calcular la cobertura.',
    calculating: 'Calculando la cobertura…',
    recalculating: 'Recalculando…',
    noChange: 'sin cambio',
    lessThan100: 'menos de 100 m²',
    points: (value: string) => `${value} puntos`,
    lessThanAPoint: 'menos de 0,01 puntos',
    /**
     * Por qué el escenario no mueve la superficie, si no la mueve: una estación en zona ya
     * cubierta, o fuera del área de estudio, no gana nada y sin explicación parece que no ha
     * pasado nada.
     */
    noEffect: (n: NoEffectInput): string => {
      const radius = `${String(n.radius)} m`;
      const inside = n.municipality ? `en ${n.areaName}` : 'en el distrito';
      const outsideOf = n.municipality ? `fuera de ${n.areaName}` : 'fuera del distrito';
      if (n.moved === 0 && n.removed === 0) {
        if (n.addedOutside) {
          return n.added === 1
            ? `Esta estación queda ${outsideOf}: no cuenta para el porcentaje.`
            : `Estas estaciones quedan ${outsideOf}: no cuentan para el porcentaje.`;
        }
        return n.added === 1
          ? `Esta estación no añade superficie: ${inside}, todo lo que está a menos de ${radius} de ella ya lo cubre la red real.`
          : `Estas estaciones no añaden superficie: ${inside}, todo lo que está a menos de ${radius} de ellas ya lo cubre la red real.`;
      }
      if (n.added === 0 && n.moved === 0) {
        if (n.removedOutside) {
          return n.removed === 1
            ? `Esta estación queda ${outsideOf}: quitarla no cambia el porcentaje.`
            : `Estas estaciones quedan ${outsideOf}: quitarlas no cambia el porcentaje.`;
        }
        return n.removed === 1
          ? `Quitarla no resta superficie: ${inside}, lo que cubría lo cubren también otras estaciones.`
          : `Quitarlas no resta superficie: ${inside}, lo que cubrían lo cubren también otras estaciones.`;
      }
      if (n.added === 0 && n.removed === 0) {
        return n.moved === 1
          ? `Moverla no cambia la superficie: ${inside}, lo que deja y lo que alcanza lo cubren también otras estaciones.`
          : `Moverlas no cambia la superficie: ${inside}, lo que dejan y lo que alcanzan lo cubren también otras estaciones.`;
      }
      return `Estos cambios no mueven la superficie cubierta ${inside}.`;
    },
  },
};

export type Messages = typeof es;
