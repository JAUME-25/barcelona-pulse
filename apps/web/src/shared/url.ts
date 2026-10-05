// Estado que va en la URL (?fuente=…&estacion=…&modo=…): enlaces que se pueden compartir y
// pruebas deterministas. Se reemplaza la entrada del historial, no se añade.

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function writeParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  window.history.replaceState(null, '', url);
}
