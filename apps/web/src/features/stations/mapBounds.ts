/**
 * Caja que se ve en el mapa, en grados WGS84: solo sirve para saber qué estaciones caen dentro
 * (la lista que sigue al mapa), no para medir (ADR 0004).
 */
export interface MapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Envolvente amplia de Barcelona y alrededores: hasta donde deja moverse el mapa y dentro de la
 * que una ubicación sirve para ordenar por distancia.
 */
export const SERVICE_AREA: MapBounds = { west: 1.9, south: 41.22, east: 2.45, north: 41.58 };

export function inBounds(
  station: { longitude: number; latitude: number },
  bounds: MapBounds,
): boolean {
  return (
    station.longitude >= bounds.west &&
    station.longitude <= bounds.east &&
    station.latitude >= bounds.south &&
    station.latitude <= bounds.north
  );
}
