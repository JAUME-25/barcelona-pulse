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
