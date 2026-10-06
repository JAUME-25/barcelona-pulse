// Deja calculada en la API la línea temporal que pide «Qué muestra y qué no»: cada semana con
// días importados (de lunes a domingo, hora de Barcelona), cada 15 minutos, igual que la web
// (apps/web/src/features/limits/quality.ts). Sin esto, la primera visita que abre la ficha
// después de arrancar la API espera unos 12 s. Lo ejecuta infra/deploy.sh en un contenedor de
// Node dentro de la red del proyecto:
//   node infra/warm-up.mjs http://api:8080
const API = process.argv[2] ?? 'http://127.0.0.1:5080';
const STEP_MINUTES = 15;

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function localParts(ms) {
  const p = Object.fromEntries(partsFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Las 00:00 de un día en Barcelona: una o dos horas antes en UTC. */
function localMidnight(date) {
  const [y, m, d] = date.split('-').map(Number);
  for (const hours of [1, 2]) {
    const candidate = Date.UTC(y, m - 1, d) - hours * 3_600_000;
    const p = localParts(candidate);
    if (p.date === date && p.hour === 0 && p.minute === 0) return candidate;
  }
  throw new Error(`No se encuentra la medianoche del ${date} en Barcelona.`);
}

function weekStart(date) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(date, -((weekday + 6) % 7));
}

const response = await fetch(`${API}/api/sources`);
if (!response.ok) throw new Error(`GET /api/sources: HTTP ${response.status}`);
const sources = await response.json();
for (const source of sources.filter((s) => s.kind === 'observed')) {
  const weeks = [...new Set(source.days.map(weekStart))].sort();
  for (const monday of weeks) {
    const from = new Date(localMidnight(monday)).toISOString();
    const to = new Date(localMidnight(addDays(monday, 7)) - STEP_MINUTES * 60_000).toISOString();
    const started = Date.now();
    const url = `${API}/api/sources/${encodeURIComponent(source.id)}/timeline?from=${from}&to=${to}&step=${STEP_MINUTES}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${source.id}, semana del ${monday}: HTTP ${res.status}`);
    await res.arrayBuffer();
    console.log(`Huecos de ${source.id}, semana del ${monday}: ${Date.now() - started} ms`);
  }
}
