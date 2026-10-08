import type { ReactNode } from 'react';
import type { Messages } from './es';
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
import type { AvailabilityKey, GapInput, NoEffectInput, Origin } from './types';

// English. Same shape as the Spanish messages (Messages): TypeScript flags anything missing or extra.

const list = (items: readonly string[]) => joinList(items, 'and');
const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** «23:39» the same day, «28 May» the same year and, otherwise, «12 June 2025». */
function sinceWhen(iso: string, reference: string): string {
  if (sameLocalDay(iso, reference)) return formatTime(iso);
  if (sameLocalYear(iso, reference)) return formatDayMonth(iso);
  return formatDay(iso);
}

function duration(fromIso: string, toIso: string): string {
  const { minutes, hours, rest, days } = durationParts(fromIso, toIso);
  if (minutes < 1) return 'less than 1 min';
  if (hours === 0) return `${String(minutes)} min`;
  if (hours >= 48) return `${String(days)} days`;
  return rest === 0 ? `${String(hours)} h` : `${String(hours)} h ${String(rest)} min`;
}

/** «4–31 May», with the year if asked. */
function runText([first, last]: [string, string], withYear: boolean): string {
  const a = dayParts(first);
  const b = dayParts(last);
  const year = (y: string) => (withYear ? ` ${y}` : '');
  if (first === last) return `${String(a.d)} ${a.m}${year(a.y)}`;
  if (a.y === b.y && a.m === b.m) return `${String(a.d)}–${String(b.d)} ${b.m}${year(b.y)}`;
  if (a.y === b.y) return `${String(a.d)} ${a.m} – ${String(b.d)} ${b.m}${year(b.y)}`;
  return `${String(a.d)} ${a.m} ${a.y} – ${String(b.d)} ${b.m} ${b.y}`;
}

const AVAILABILITY_LABEL: Record<AvailabilityKey, string> = {
  available: 'With bikes',
  few: 'Few bikes',
  empty: 'No bikes',
  full: 'Full',
  outOfService: 'Out of service',
  unknown: 'No recent data',
};

/** The assumptions of the «cobertura-geometrica» v1 model, in the order the API gives them. */
const COVERAGE_ASSUMPTIONS = [
  'Straight-line distance from each station, not walking along streets: it is not an isochrone.',
  'Each station covers a circle of the chosen radius; overlaps are counted only once.',
  'Areas in EPSG:25831 (metres), rounded to the square metre. Each circle is a 64-sided polygon: 0.16% less area.',
  'The percentage is of the chosen study area, not of the population or any other area.',
  'Every station with a location valid at the reference time is included, whether it is operating or not.',
  'Capacity does not change coverage. None of this says how many trips, waits or how much demand there would be.',
  'Geometries are simplified by 1 m to draw them; areas are calculated without simplifying.',
];

export const en: Messages = {
  languages: { label: 'Language' },
  brand: { tagline: 'Bicing stations on the map' },
  modes: {
    label: 'Mode',
    explore: 'Explore',
    replay: 'Replay',
    experiment: 'Experiment',
    balance: 'Balance',
  },

  balance: {
    title: 'Balance between two hours',
    day: 'Day',
    from: 'From',
    to: 'to',
    hint: (from: string, to: string) =>
      `Bikes docked at each station at ${to} minus those docked at ${from}. Two states, not trips: what comes and goes in between is not seen.`,
    gained: (stations: number) => `more bikes, at ${count(stations, 'station', 'stations')}`,
    lost: (stations: number) => `fewer bikes, at ${count(stations, 'station', 'stations')}`,
    rest: (same: number, nodata: number, known: number, before: number, after: number) =>
      `${String(same)} unchanged · ${String(nodata)} with no data at one of the two moments · at the ${String(known)} with data at both, from ${String(before)} to ${String(after)} docked bikes.`,
    story: (gainers: readonly string[], losers: readonly string[]) => {
      const win = gainers.length === 0 ? 'No district gains bikes' : `${list(gainers)} gain bikes`;
      const lose = losers.length === 0 ? 'none loses any' : `${list(losers)} lose them`;
      return `${win}; ${lose}.`;
    },
    byDistrict: 'By district',
    byAltitude: 'By altitude',
    band: {
      low: (max: number) => `Up to ${String(max)} m`,
      mid: (min: number, max: number) => `${String(min)} to ${String(max)} m`,
      high: (min: number) => `Above ${String(min)} m`,
    },
    altitudeNote: 'Three groups with the same number of stations, by their published altitude.',
    perStation: (value: string) => `${value} per station`,
    districtMeta: (stations: number, net: string) => `${String(stations)} stations · ${net} bikes`,
    topGain: 'Filling up the most',
    topLoss: 'Emptying the most',
    place: (before: number, after: number, capacity: number | null) =>
      `${String(before)} → ${String(after)}${capacity === null ? '' : ` of ${String(capacity)}`}`,
    unit: 'bikes',
    loading: 'Working out the balance…',
    failed: 'The starting moment could not be loaded.',
    none: 'No station has data at both moments.',
    key: {
      title: (from: string, to: string) => `Balance from ${from} to ${to}`,
      gain: 'Gain bikes',
      loss: 'Lose bikes',
      same: 'Unchanged',
      nodata: 'No data at one of the two moments',
      hint: 'Size shows how many bikes change. At street scale, the number: “+39” or “−23”.',
    },
  },

  format: {
    duration,
    months: (days) => {
      const byYear = monthsByYear(days);
      if (byYear.length === 0) return null;
      return list(byYear.map(([year, names]) => `${list(names)} ${year}`));
    },
    count,
  },

  map: {
    failed: 'The base map could not be loaded. The station list is still available.',
    unsupported:
      'This browser cannot draw the map because it does not support WebGL2. The station list is still available.',
    degraded: 'Part of the base map did not load.',
    lost: 'The map has paused for a moment. It comes back as soon as the browser allows it.',
    region: 'Station map',
    pitch: '3D view',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    resetBearing: 'Point north',
    attribution: 'Show attributions',
    title: 'Map',
  },

  app: {
    sourcesError: 'The data sources could not be loaded.',
    retry: 'Try again',
    noData: 'No data loaded yet.',
    noDataHint: (command: ReactNode): ReactNode => <>Locally, import the demo with {command}.</>,
    stationsError: 'The stations could not be loaded.',
    loading: 'Loading stations…',
    search: 'Search for a station',
    count: (shown, total) =>
      shown === total
        ? count(total, 'station', 'stations')
        : `${String(shown)} of ${String(total)} stations`,
    noMatch: 'No station matches the search and the filters.',
    showAll: 'Show all',
    order: 'Sort',
    orders: {
      name: 'Name',
      bikes: 'Most bikes',
      docks: 'Most free docks',
      ebikes: 'Most e-bikes',
      distance: 'Nearest to me',
    },
    nearMe: 'Near me',
    locating: 'Locating you…',
    located:
      'Sorted from nearest to farthest from where you are, as the crow flies. Your location never leaves the browser.',
    locatedRough: (error: string) =>
      `Approximate location (±${error}): sorted from nearest to farthest, as the crow flies. Your location never leaves the browser.`,
    locationOutside: 'You are outside Barcelona: the list is not sorted by distance.',
    locationDenied:
      'The browser did not allow access to your location. You can change that in its site settings.',
    locationUnavailable: 'The browser could not determine your location.',
    locationTimeout: 'The browser took too long to find your location. Try again.',
    locationUnsupported: 'This browser does not provide location.',
    listTitle: 'Stations',
    onlyOnMap: 'Only those on the map',
    noneOnMap: 'No stations in the visible part of the map. Move the map or zoom out.',
    wholeList: 'Show the whole list',
    linkStationMissing: (id) =>
      `The link asked for station “${id}”, which is not in this source: showing the list.`,
    linkDayMissing: (day) =>
      `The link asked for ${day}, which is not imported: showing another day.`,
    truncated: 'The API returned only part of the stations in this area: some are missing.',
    source: 'Source',
    demoSuffix: '(demo)',
    crashed: 'Something went wrong while drawing the app.',
    reload: 'Reload',
  },

  api: {
    tooMany: 'The API has received too many requests in a row. Wait a minute and try again.',
    status: (status) => `The API answered ${status}.`,
    noStatus: 'with no status',
    unreachable: 'The API could not be reached. Check the connection and try again.',
  },

  source: {
    timeZone: 'Barcelona time',
    demoBadge: 'Demo',
    demoLead: 'Made-up data for trying out the app. Not Bicing’s real availability.',
    shownMoment: 'Moment shown',
    changeMoment: 'Change moment',
    thisHour: 'At this hour',
    more: 'More',
    less: 'Less',
    realBadge: 'Real data',
    past: 'This is a moment in the past, not the current state.',
    historical: (months) => `Historical data · ${months}. Not the current state.`,
    noObservations: 'No observations at this moment.',
    lastObservation: 'Last observation',
    license: (license) => `Licence ${license}.`,
    dataset: 'See the dataset',
    limits: 'What it shows and what it doesn’t',
    share: 'Copy link',
    shared: 'Link copied.',
    sharedNoCamera: 'Link copied, without the map position.',
    shareFailed: 'The browser will not copy it. Copy it from here:',
    shareUrl: 'Link to this view',
    texts: {
      'bicing-bcn': {
        name: 'Bicing, Barcelona City Council archive',
        attribution:
          'Data source: Barcelona City Council. Transformed data: normalised monthly archive.',
      },
      demo: {
        name: 'Synthetic demo',
        attribution:
          'Synthetic data from Barcelona Pulse. Approximate locations; these are not real stations.',
      },
    },
  },

  availability: {
    label: AVAILABILITY_LABEL,
    hint: (category, fewMax) => {
      switch (category) {
        case 'available':
          return `${String(fewMax + 1)} or more`;
        case 'few':
          return `1 to ${String(fewMax)}`;
        case 'empty':
          return 'none left';
        case 'full':
          return 'no free docks';
        case 'outOfService':
          return 'not operating';
        case 'unknown':
          return 'not zero';
      }
    },
    status: {
      in_service: 'In service',
      maintenance: 'Under maintenance',
      closed: 'Closed',
      planned: 'Planned',
      unknown: 'Unknown',
    },
    quality: {
      counts_exceed_capacity: 'Bikes and docks add up to more than the published capacity.',
      bike_types_mismatch: 'Mechanical and electric bikes don’t add up to the published total.',
    },
    legend: 'What each marker means',
    legendHelp: 'Tap a category to hide or show it.',
    numberLabel: 'Number on the map and in the list',
    numberBikes: 'Bikes',
    numberEbikes: 'E-bikes',
    numberEbikesHelp:
      'How many e-bikes each station has. Stations with none are dimmed; the colour still says whether there are bikes.',
    numberDocks: 'Docks',
    numberDocksHelp:
      'How many free docks each station has. Full stations are dimmed; the colour still says whether there are bikes.',
    presetsLabel: 'Shortcuts',
    presets: { bike: 'I want a bike', park: 'I want to park' },
    mapKey: 'Also on the map',
    bikeLane: 'Bike lane (OSM, not all)',
    transit: 'Metro, train and tram',
    me: 'Your location',
  },

  districts: {
    title: 'By district',
    label: 'District',
    all: 'All districts',
    none: 'No district',
    stations: 'Stations',
    empty: 'No bikes',
    full: 'Full',
    unknown: 'No data',
    note: 'No data is counted apart: it is neither no bikes nor full.',
  },

  list: {
    staleSince: (label, iso, at) => `${label} since ${sinceWhen(iso, at)}`,
    never: 'No data up to this moment',
    noRenting: (label) => `${label}, no renting`,
    noReturning: (label) => `${label}, no returns`,
    srBikes: (n) => (n === 1 ? '1 bike' : `${String(n)} bikes`),
    srDocks: (n) => (n === 1 ? '1 free dock' : `${String(n)} free docks`),
    unitBikes: (n) => (n === 1 ? 'bike' : 'bikes'),
    unitDocks: 'free',
    unitEbikes: 'elec.',
  },

  pattern: {
    title: 'How it usually is',
    lead: (days: number, period: string) =>
      `How it was at each hour over the ${String(days)} imported days (${period}), checked every 15 minutes. This is what happened, not a forecast.`,
    weekdays: 'Weekdays',
    weekend: 'Weekend',
    days: (n: number) => (n === 1 ? '1 day' : `${String(n)} days`),
    holidays: 'Public holidays count as weekdays.',
    emptyMost: (hour: number, share: string) =>
      `Between ${String(hour)}:00 and ${String(hour + 1)}:00 it had no bikes ${share} of the time.`,
    emptyRare: 'It almost never ran out of bikes.',
    fullMost: (hour: number, share: string) =>
      `Between ${String(hour)}:00 and ${String(hour + 1)}:00 it was full, with no space to return a bike, ${share} of the time.`,
    unknownShare: (share: string) => `No data ${share} of the time.`,
    atHour: (hour: number, share: string, median: number | null) =>
      `Between ${String(hour)}:00 and ${String(hour + 1)}:00 it had at least one bike ${share} of the time${
        median === null ? '.' : `; median, ${count(median, 'bike', 'bikes')}.`
      }`,
    noDays: 'No days imported from this source yet.',
    loading: 'Working out how it usually is…',
    failed: 'Could not work out how it usually is.',
    demo: 'With the made-up demo data.',
    now: 'Hour shown on the map',
    unknown: 'No data',
  },

  detail: {
    back: 'Back to the list',
    neverReported: 'This station has not sent any observation up to the moment shown.',
    lastObservation: (p) => (
      <>
        The last observation is from {p.when}, {p.duration} before the moment shown. After{' '}
        {p.tolerance} min without data, the state is treated as unknown: the station is not assumed
        to be empty.
      </>
    ),
    docks: (n) => count(n, 'dock', 'docks'),
    bikes: (n) => count(n, 'bike', 'bikes'),
    and: 'and',
    bikeSplit: (mechanical, electric) =>
      `${String(mechanical)} mechanical and ${String(electric)} electric`,
    noSplit: 'No breakdown by type',
    observedAt: ({ time, day }) => (
      <>
        Data from {time} on {day}
      </>
    ),
    bikesAvailable: 'Bikes available',
    docksFree: 'Free docks',
    capacityOf: (capacity) => `capacity ${String(capacity)}`,
    outOfService:
      'The station is not operating. These are the figures it publishes, but it may not be possible to take or return bikes.',
    notRenting: 'Right now the station does not allow taking bikes, even if it has some.',
    notReturning: 'Right now the station does not accept returns, even if it has free docks.',
    unavailable: 'Unavailable',
    capacity: 'Published capacity',
    notPublished: 'Not published',
    altitude: 'Altitude',
    metres: (metres: number) => `${String(Math.round(metres))} m`,
    nearby: 'Nearby',
    nearbyNote:
      'The closest ones, as the crow flies (not on foot), with their state at this moment.',
    last: 'Last observation',
    none: 'None',
    source: 'Source',
    demoSource: 'Demo with made-up data',
    id: (id) => ` (ID ${id})`,
    changes: (n) => `Changes to this station (${String(n)})`,
    knownSince: (since) => `First seen on ${since}.`,
    noChanges: (since) =>
      `No changes of name, location or capacity in the imported days; first seen on ${since}.`,
    changesLoading: 'Looking for changes to the station…',
    changesFailed: 'The station’s changes could not be loaded.',
    changeCapacity: (from, to) =>
      `capacity from ${from === null ? 'not published' : String(from)} to ${to === null ? 'not published' : String(to)} docks`,
    changeName: (from, to) => `from “${from}” to “${to}”`,
    changeAddress: (from, to) => `address from “${from ?? '—'}” to “${to ?? '—'}”`,
    changeMoved: (distance) => `moved ${distance}`,
    changeAltitude: (from: number, to: number) =>
      `altitude from ${String(from)} to ${String(to)} m`,
    metadataAssumed:
      'The name, location and capacity come from a publication later than this moment.',
    added: 'Added',
    removed: 'Removed',
    addedValue: (at, absentOn, gap) =>
      gap
        ? `${formatDay(at)} · not in the source’s list on ${formatLocalDayMonth(absentOn)}, the last imported day before`
        : `${formatDateTime(at)} · not in the source’s list on ${formatLocalDayMonth(absentOn)}`,
    removedValue: (lastDay, absentFrom, gap) =>
      gap
        ? `${formatLocalDate(lastDay)} · no longer in the source’s list on ${formatLocalDayMonth(absentFrom)}, the next imported day`
        : `${formatLocalDate(lastDay)} · no longer in the source’s list on ${formatLocalDayMonth(absentFrom)}`,
    notYetListed: (at) =>
      `The source did not publish this station yet: it first listed it on ${formatDateTime(at)}.`,
    noLongerListed: (absentFrom) =>
      `The source stopped publishing this station: on ${formatLocalDate(absentFrom)} it was no longer in its list.`,
  },

  replay: {
    deck: 'Replay a day',
    slider: 'Time of day',
    empty: 'No bikes',
    full: 'Full',
    scale: (n) => `scale: ${String(n)} stations`,
    play: 'Play the day',
    pause: 'Pause',
    stepBack: (minutes) => `${String(minutes)} minutes earlier`,
    stepForward: (minutes) => `${String(minutes)} minutes later`,
    speed: 'Speed',
    speeds: { lenta: 'Slow', normal: 'Normal', rapida: 'Fast' },
    loadingDay: 'Loading the day…',
    dayFailed: 'The day could not be loaded.',
    stationsLoading: 'Loading the state of the stations…',
    stationsFailed: 'The state of the stations at this moment could not be loaded.',
    noData: 'No data at this moment: no station had reported.',
    countEmpty: (n) => <>{n} with no bikes</>,
    countFull: (n) => <>{n} full</>,
    countTotals: (bikes, docks, ebikes) => {
      const bikesPart =
        bikes === null ? null : (
          <>
            {bikes} bikes{ebikes !== null && <> ({ebikes} e-bikes)</>}
          </>
        );
      return bikesPart !== null && docks !== null ? (
        <>
          {bikesPart} and {docks} free docks
        </>
      ) : bikesPart !== null ? (
        bikesPart
      ) : (
        <>{docks} free docks</>
      );
    },
    counted: (n) => `in ${String(n)} stations`,
    countedNote: 'Those in service that publish bikes and docks. The rest are not added up.',
    bikesScale: (max) => `bikes at the stations: 0 to ${max}`,
    withDataNote: (tolerance) =>
      `Those that reported in the previous ${tolerance} minutes. The rest count as neither empty nor full.`,
    withData: (withData, known) => `${String(withData)} of ${String(known)} with data`,
    valueLoading: 'Loading',
    valueNoData: (moment) => `${moment}. No data.`,
    value: (moment, empty, full, withData, known) =>
      `${moment}. ${String(empty)} with no bikes, ${String(full)} full, ${String(withData)} of ${String(known)} with data.`,
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    dayGroup: 'Day',
    dayNoData: (label) => `${label}, no data`,
    noImported: 'No imported data',
  },

  limits: {
    coverage: {
      complete: 'almost all with data',
      partial: 'some missing',
      none: 'none with data',
    },
    silenceTitle: {
      never: ['No data up to this moment', 'No data up to this moment'],
      days: ['Has not reported for days', 'Have not reported for days'],
      hours: ['Has not reported for hours', 'Have not reported for hours'],
      minutes: ['Has just stopped reporting', 'Have just stopped reporting'],
    },
    month: (year, month) => `${monthName(year, month)} ${String(year)}`,
    dayRow: (day, coverage) => `${day}: ${coverage} at the worst moment. Replay that day.`,
    measuring: 'Measuring the gaps…',
    holesError: 'The gaps could not be measured.',
    average: (share, step) =>
      `On average, ${share} of the stations have data at each ${String(step)}-minute step.`,
    noneBelow: 'No step below 95%.',
    below: (n, steps, days) => `${String(n)} of ${String(steps)} steps below 95%: ${days}.`,
    legend: 'What each cell means',
    legendComplete: '95% or more with data',
    legendPartial: 'Some missing',
    legendNone: 'None',
    gridNote: (step) =>
      `Each row is a day and each cell, an hour (measured every ${String(step)} minutes). Tap a day to replay it.`,
    allWithData: (when, total) => `${when}: all ${String(total)} stations have data.`,
    someSilent: (when, silent, total) =>
      `${when}: ${String(silent)} of ${String(total)} stations without data. They do not count as empty: their state is unknown.`,
    back: 'Back',
    title: 'What it shows and what it doesn’t',
    lead: (stations, period) =>
      `The ${String(stations)} Bicing stations as they were on ${period ?? ''}, according to the archive published by Barcelona City Council. This is the past, not what is happening now.`,
    data: 'The data',
    holes: 'Gaps',
    silent: 'No data at this moment',
    notSaidTitle: 'What it doesn’t say',
    originsTitle: 'Where everything comes from',
    period: 'Period',
    periodValue: (period, days) => `${period ?? ''} (${count(days, 'day', 'days')})`,
    lastData: 'Latest data',
    rhythm: 'Frequency',
    rhythmValue: 'A snapshot of the whole network every 5 minutes',
    expiry: 'Expiry',
    expiryValue: (tolerance) =>
      `After ${String(tolerance)} minutes without reporting, a station’s state becomes unknown`,
    stations: 'Stations',
    observations: 'Stored observations',
    lastIngestion: 'Latest import',
    ingestionStatus: {
      running: 'running',
      succeeded: 'finished',
      succeeded_with_issues: 'finished with warnings',
      failed: 'failed',
    },
    lastIngestionValue: (when, status, accepted, duplicate, conflicting, rejected) =>
      `${when}, ${status}: ${accepted} new, ${duplicate} repeated, ${conflicting} conflicting, ${rejected} rejected.`,
    ingestionsLead: (n) => {
      const text =
        `${count(n.runs, 'import', 'imports')} over ${count(n.periods, 'day', 'days')}: ` +
        `${n.accepted} new observations, ${n.duplicate} repeated, ${n.conflicting} conflicting and ${n.rejected} rejected.`;
      const failed = n.failed === 0 ? '' : ` ${count(n.failed, 'day failed', 'days failed')}.`;
      const purged = n.purged === 0 ? '' : ` ${count(n.purged, 'day', 'days')} deleted afterwards.`;
      return text + failed + purged;
    },
    ingestionsTitle: 'What came in each day',
    ingestionsLoading: 'Reading the imports…',
    ingestionsError: 'The imports could not be read.',
    ingestionsNone: 'No day has been imported yet.',
    ingestionDay: 'Day',
    ingestionNew: 'New',
    ingestionDuplicate: 'Repeated',
    ingestionConflicting: 'Conflicting',
    ingestionRejected: 'Rejected',
    ingestionTimes: (n) => `${String(n)} times`,
    ingestionFailed: 'failed',
    ingestionPurged: 'deleted',
    ingestionsNote:
      'Observations. Repeated: already stored, with the same values. Conflicting: already stored with other values; the first one was kept. Rejected: did not come in (stations included).',
    rejectionsTitle: 'Rejections, by reason:',
    noRejections: 'No record was rejected.',
    rejectionLine: (n, kind, reason) => {
      const kinds: Record<string, [string, string]> = {
        station: ['station', 'stations'],
        observation: ['observation', 'observations'],
        input: ['input', 'inputs'],
      };
      const [one, many] = kinds[kind] ?? [kind, kind];
      return `${count(n, one, many)}: ${reason}`;
    },
    rejectionReason: {
      missing_field: 'missing field',
      invalid_value: 'invalid value',
      ambiguous_timestamp: 'time without a time zone',
      timestamp_in_future: 'time in the future',
      coordinates_out_of_range: 'impossible coordinates',
      outside_service_area: 'outside the service area',
      negative_count: 'negative count',
      duplicate_in_batch: 'repeated in the same file',
      unknown_station: 'unknown station',
      metadata_older_than_current: 'attributes older than the current ones',
      metadata_inside_known_period: 'attribute change inside a period already known',
    },
    dataset: 'The Bicing dataset on Open Data BCN',
    code: 'Code, decisions and measurements:',
    silentNever: 'No data up to this moment',
    silentSince: (iso, at) => `No data since ${sinceWhen(iso, at)}`,
    silentFor: (iso, at) => `${duration(iso, at)} without data`,
    notYetListed: (at) =>
      `Not published yet: the source first listed it on ${formatDayMonth(at)}, ${formatTime(at)}`,
    noLongerListed: (absentFrom) =>
      `No longer published: not in the source’s list on ${formatLocalDayMonth(absentFrom)}`,
    lifecycleTitle: 'Added and removed',
    lifecycleOneDay:
      'With a single imported day there is no way to tell whether any station entered or left the source’s list.',
    lifecycleLead: (added, removed) => {
      if (added === 0 && removed === 0) {
        return 'In the imported days, the source neither started nor stopped publishing any station.';
      }
      const started =
        added === 0
          ? 'did not start publishing any station'
          : `started publishing ${count(added, 'station', 'stations')}`;
      const stopped =
        removed === 0
          ? 'did not stop publishing any'
          : `stopped publishing ${count(removed, 'station', 'stations')}`;
      return `In the imported days, the source ${started} and ${stopped}.`;
    },
    addedGroup: 'Added',
    removedGroup: 'Removed',
    addedWhy: (at, absentOn, gap) =>
      gap
        ? `From ${formatDayMonth(at)}; not listed on ${formatLocalDayMonth(absentOn)}, the last imported day before`
        : `From ${formatDayMonth(at)}, ${formatTime(at)}; not listed on ${formatLocalDayMonth(absentOn)}`,
    removedWhy: (lastDay, absentFrom, gap) =>
      gap
        ? `Until ${formatLocalDayMonth(lastDay)}; no longer listed on ${formatLocalDayMonth(absentFrom)}, the next imported day`
        : `Until ${formatLocalDayMonth(lastDay)}; no longer listed on ${formatLocalDayMonth(absentFrom)}`,
    lifecycleNote:
      'Only from what was imported: a station the source stops listing may come back later, and one that appears may have entered service on any earlier day not imported. A station that stops reporting is not removed: it stays in the source’s list.',
    periodOf: (days) => {
      const runs = dayRuns(days);
      if (runs.length === 0) return null;
      const years = yearsOf(days);
      const oneYear = years.length === 1;
      const joined = list(runs.map((r) => runText(r, !oneYear)));
      return oneYear ? `${joined} ${years[0] ?? ''}` : joined;
    },
    listDays: (days) => list(daysByMonth(days).map(([m, ds]) => `${list(ds.map(String))} ${m}`)),
    gap: (g: GapInput) => {
      if (g.allNone) return 'No data all day.';
      const ranges = g.ranges.map((r) =>
        r.to === null ? `at ${r.from}` : `from ${r.from} to ${r.to}`,
      );
      if (ranges.length === 0) return `Data from ${g.share} of the stations or more all day.`;
      const shown = ranges.slice(0, 3);
      const rest = ranges.length - shown.length;
      const text =
        rest > 0
          ? `${shown.join(', ')} and ${count(rest, 'more stretch', 'more stretches')}`
          : list(shown);
      return `Fewer than ${g.share} of the stations with data ${text}.`;
    },
    notSaid: (tolerance) => [
      'It is not real time: it is an archive of the past.',
      `No data is not zero: a station that has not reported for more than ${String(tolerance)} minutes shows as unknown, not as empty.`,
      'A change in the number of bikes is not a trip: nobody knows where they come from or where they go.',
      'Coverage is straight-line geometry. It is not walking distance, population or demand.',
      'It does not predict or recommend anything.',
      'The bike lanes on the map are not all of them: only those OpenStreetMap draws apart from the road.',
    ],
    origins: (months): Origin[] => {
      const when = months === null ? '' : `, ${months}`;
      return [
        {
          what: 'Station status',
          who: `Barcelona City Council, Open Data BCN${when}`,
          terms: 'CC BY 4.0, transformed data',
        },
        {
          what: 'Name, location and capacity',
          who: `Barcelona City Council, Open Data BCN${when}`,
          terms: 'CC BY 4.0',
        },
        {
          what: 'Districts for coverage',
          who: 'Barcelona City Council, Open Data BCN (2017)',
          terms: 'CC BY 4.0',
        },
        {
          what: 'Base map and buildings',
          who: 'OpenFreeMap, OpenMapTiles and OpenStreetMap',
          terms: 'ODbL',
        },
        {
          what: 'Streets, bike lanes, metro and parks',
          who: 'OpenStreetMap, via OpenMapTiles and OpenFreeMap',
          terms: 'ODbL',
        },
        { what: 'Hypothetical stations', who: 'You place them', terms: 'Not stored' },
      ];
    },
  },

  stamp: {
    demo: 'Demo',
    demoValue: 'Made-up data',
    network: 'Real network on',
    historical: 'Historical, not real time',
    hypothetical: 'with hypothetical changes',
  },

  contract: {
    title: 'API contract',
    tagline: 'What the API publishes, read from the OpenAPI document it generates at build time.',
    intro: (json: ReactNode): ReactNode => (
      <>
        Routes, parameters, responses and schemas as the code declares them: this page reads {json}{' '}
        from the same server that serves it, not a copy. The descriptions are in Spanish, as the API
        writes them.
      </>
    ),
    jsonLink: 'the OpenAPI document (JSON)',
    version: (openapi: string, version: string) => `OpenAPI ${openapi} · version ${version}.`,
    rules: 'Common rules',
    ruleList: [
      'Instants are ISO 8601 with an explicit zone; a time without one is rejected with 400. Responses return them in UTC.',
      'Missing data is not zero: an absent count is `null`, and a station with no observation within its source’s tolerance has the state `unknown`.',
      'Observed and synthetic data never mix: every response says which source it comes from and what kind it is.',
      'Limit of 120 requests per minute and IP; above it, 429 with `Retry-After`.',
      'State, detail, pattern, timeline and frames carry an `ETag`: with `If-None-Match`, 304 while the data of that range does not change.',
      'A station’s pattern waits a few seconds for a slot; if there is none, 503 with `Retry-After`.',
      'Errors come as `application/problem+json`.',
    ],
    index: 'Routes',
    tags: {
      Sources: 'Sources',
      Stations: 'Stations',
      History: 'History',
      Scenarios: 'Scenarios',
    },
    parameters: 'Parameters',
    noParameters: 'No parameters.',
    body: 'Request body',
    responses: 'Responses',
    required: 'required',
    in: { query: 'in the query', path: 'in the path', header: 'in a header' },
    schemas: 'Schemas',
    schemasNote:
      'Those named by some route, with their properties. A type with “| null” accepts null.',
    values: 'Values:',
    loading: 'Reading the contract…',
    failed: 'The API contract could not be read.',
    retry: 'Retry',
    backToApp: 'Back to the map',
    code: 'Code, decisions and measurements:',
  },

  scope: {
    straight: {
      term: 'In a straight line',
      note: 'Straight-line distance from each station, not walking along streets: it is not an isochrone.',
    },
    surface: {
      term: 'Area, not population',
      note: 'The percentage is of the chosen study area, not of the population or any other area.',
    },
    trips: {
      term: 'Does not measure trips',
      note: 'Capacity does not change coverage. None of this says how many trips, waits or how much demand there would be.',
    },
  },

  scenario: {
    deck: 'Coverage scenario',
    real: 'Real network',
    stations: (n) => `${String(n)} stations`,
    label: 'Scenario',
    gains: (area) => `gains ${area}`,
    loses: (area) => `loses ${area}`,
    of: (area, size, radius) =>
      `Share of the ${area} area (${size}) within ${String(radius)} m in a straight line.`,
    undo: 'Undo',
    reset: 'Back to the real network',
    panelTitle: 'Coverage scenario',
    panelLead:
      'Which part of the city is close to a station, in a straight line. Change the network on the map and compare. It measures geometry: it does not say how many trips there would be.',
    reference: (when, n) => `Real network on ${when}: ${String(n)} stations.`,
    changes: 'Changes',
    empty: 'It is still the real network. Choose Add, Move or Remove and tap the map.',
    assumptions: 'Calculation assumptions',
    toolsLabel: 'Scenario tools',
    tools: {
      add: { label: 'Add', hint: 'Tap the map where you want a new station.' },
      move: { label: 'Move', hint: 'Drag a station, real or new, somewhere else.' },
      remove: { label: 'Remove', hint: 'Tap a station to take it out of the scenario.' },
    },
    toolDefault: 'Choose a tool to change the network.',
    radius: 'Radius',
    radiusValue: (radius) => `${String(radius)} metres`,
    area: 'Study area',
    districts: 'Districts',
    hypothetical: 'Hypothetical',
    up: 'Up',
    down: 'Down',
    what: { added: 'added', moved: 'moved', removed: 'removed' },
    undoChange: { added: 'Remove', moved: 'Put back', removed: 'Restore' },
    stationFallback: (id) => `Station ${String(id)}`,
    newStation: (n) => `New ${n}`,
    model: (name, version) => `Model “${name}”, version ${String(version)}.`,
    assumptionsOf: (model, version, fromApi) =>
      model === 'cobertura-geometrica' &&
      version === 1 &&
      fromApi.length === COVERAGE_ASSUMPTIONS.length
        ? COVERAGE_ASSUMPTIONS
        : fromApi,
    legend: {
      title: 'What you see on the map',
      covered: 'Covered by the real network',
      gained: 'What the scenario gains',
      lost: 'What it loses',
      boundary: 'Study area boundary',
      real: 'Real station',
      added: 'New station (hypothetical)',
      reach: 'Reach of a new or moved one',
      removed: 'Removed station',
    },
    error: 'The coverage could not be calculated.',
    calculating: 'Calculating the coverage…',
    recalculating: 'Recalculating…',
    noChange: 'no change',
    lessThan100: 'less than 100 m²',
    points: (value) => `${value} points`,
    lessThanAPoint: 'less than 0.01 points',
    noEffect: (n: NoEffectInput) => {
      const radius = `${String(n.radius)} m`;
      const inside = n.municipality ? `in ${n.areaName}` : 'in the district';
      const outsideOf = n.municipality ? `outside ${n.areaName}` : 'outside the district';
      if (n.moved === 0 && n.removed === 0) {
        if (n.addedOutside) {
          return n.added === 1
            ? `This station is ${outsideOf}: it does not count towards the percentage.`
            : `These stations are ${outsideOf}: they do not count towards the percentage.`;
        }
        return n.added === 1
          ? `This station adds no area: ${inside}, everything within ${radius} of it is already covered by the real network.`
          : `These stations add no area: ${inside}, everything within ${radius} of them is already covered by the real network.`;
      }
      if (n.added === 0 && n.moved === 0) {
        if (n.removedOutside) {
          return n.removed === 1
            ? `This station is ${outsideOf}: removing it does not change the percentage.`
            : `These stations are ${outsideOf}: removing them does not change the percentage.`;
        }
        return n.removed === 1
          ? `Removing it takes away no area: ${inside}, what it covered is also covered by other stations.`
          : `Removing them takes away no area: ${inside}, what they covered is also covered by other stations.`;
      }
      if (n.added === 0 && n.removed === 0) {
        return n.moved === 1
          ? `Moving it does not change the area: ${inside}, what it leaves and what it reaches are also covered by other stations.`
          : `Moving them does not change the area: ${inside}, what they leave and what they reach are also covered by other stations.`;
      }
      return `These changes do not move the area covered ${inside}.`;
    },
  },
};
