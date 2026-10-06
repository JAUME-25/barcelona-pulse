// Estado que va en la URL (?fuente=…&estacion=…&modo=…): enlaces que se pueden compartir y
// pruebas deterministas. Se reemplaza la entrada del historial, no se añade.

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function writeParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  replaceUrl(url);
}

/** Cambia la URL sin añadir entrada al historial. */
export function replaceUrl(url: URL): void {
  try {
    window.history.replaceState(null, '', url);
  } catch {
    // Safari lanza SecurityError con más de 100 cambios seguidos: la URL se queda como estaba,
    // pero la aplicación sigue.
  }
}
