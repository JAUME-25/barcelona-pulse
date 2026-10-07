// Estado que va en la URL (?fuente=…&estacion=…&modo=…): enlaces que se pueden compartir y
// pruebas deterministas. Lo que cambia a cada paso (la hora al reproducir, el escenario) reemplaza
// la entrada del historial; abrir el detalle o la ficha y cambiar de modo añaden una, para que
// Atrás los cierre en vez de salir de la aplicación.

export function readParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * Añade una entrada al historial con estos cambios de parámetros (null quita uno). `kind` dice qué
 * la abrió: al cerrarlo desde la interfaz se vuelve atrás si la entrada es suya (`historyPushed`),
 * y así Atrás y el botón dejan el mismo historial.
 */
export function pushParams(changes: Record<string, string | null>, kind: string): void {
  const url = new URL(window.location.href);
  for (const [name, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(name);
    else url.searchParams.set(name, value);
  }
  try {
    window.history.pushState({ pushed: kind }, '', url);
  } catch {
    replaceUrl(url);
  }
}

/** La entrada actual del historial la añadió `pushParams` con este motivo. */
export function historyPushed(kind: string): boolean {
  const state: unknown = window.history.state;
  return (
    typeof state === 'object' && state !== null && (state as { pushed?: unknown }).pushed === kind
  );
}

export function writeParam(name: string, value: string | null): void {
  const url = new URL(window.location.href);
  if (value === null) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  replaceUrl(url);
}

/** Como writeParam, pero solo si el valor cambia: sin escrituras de más (Safari limita 100 seguidas). */
export function syncParam(name: string, value: string | null): void {
  if (readParam(name) !== value) writeParam(name, value);
}

/**
 * Cambia la URL sin añadir entrada al historial. Conserva el estado de la entrada (`{pushed}`):
 * pasar a otra estación con el detalle abierto, o la hora al reproducir, no deben hacer que
 * «Volver» deje de volver atrás.
 */
export function replaceUrl(url: URL): void {
  try {
    window.history.replaceState(window.history.state, '', url);
  } catch {
    // Safari lanza SecurityError con más de 100 cambios seguidos: la URL se queda como estaba,
    // pero la aplicación sigue.
  }
}
