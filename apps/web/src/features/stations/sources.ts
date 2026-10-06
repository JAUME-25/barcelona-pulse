import { t } from '../../i18n';

// Nombre y atribución de una fuente en el idioma de la interfaz. La API los da en castellano y en
// castellano mandan ellos; en catalán e inglés, la traducción de esa fuente si la hay (i18n) y,
// si no, lo que diga la API.

export function sourceName(source: { id: string; name: string }): string {
  return t().source.texts[source.id]?.name ?? source.name;
}

export function sourceAttribution(source: { id: string; attribution: string }): string {
  return t().source.texts[source.id]?.attribution ?? source.attribution;
}
