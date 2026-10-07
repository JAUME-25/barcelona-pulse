import { useCallback, useEffect, useRef, useState } from 'react';
import type { Point } from './availability';
import { inBounds, SERVICE_AREA } from './mapBounds';

/**
 * A partir de este error (en metros) la ubicación se dice «aproximada»: la de un ordenador,
 * que sale de la IP, suele pasar del kilómetro y el orden por distancia vale poco.
 */
export const ROUGH_ACCURACY_M = 500;

// Códigos de GeolocationPositionError (no se leen del objeto: en las pruebas no los lleva).
const PERMISSION_DENIED = 1;
const TIMEOUT = 3;

export type LocationNotice =
  | { kind: 'located'; accuracy: number | null }
  | { kind: 'outside' | 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

export interface NearMe {
  /** Dónde está la persona; null hasta que lo pida y el navegador lo dé. */
  me: Point | null;
  locating: boolean;
  notice: LocationNotice | null;
  locate: () => void;
  /** Quita el aviso (por ejemplo, al cambiar el orden a mano). */
  dismiss: () => void;
}

/**
 * «Cerca de mí»: la ubicación se pide al pulsar, no al abrir; vive solo en memoria (nunca en la
 * URL ni guardada) y se descarta si cae fuera de Barcelona. Cada fallo del navegador se dice con
 * su motivo (sin permiso, sin posición, tiempo agotado), porque cada uno se arregla distinto.
 */
export function useNearMe(onLocated: () => void): NearMe {
  const [me, setMe] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<LocationNotice | null>(null);
  const onLocatedRef = useRef(onLocated);
  useEffect(() => {
    onLocatedRef.current = onLocated;
  });

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setNotice({ kind: 'unsupported' });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { longitude: position.coords.longitude, latitude: position.coords.latitude };
        setLocating(false);
        if (!inBounds(point, SERVICE_AREA)) {
          setNotice({ kind: 'outside' });
          return;
        }
        const { accuracy } = position.coords;
        setMe(point);
        setNotice({ kind: 'located', accuracy: Number.isFinite(accuracy) ? accuracy : null });
        onLocatedRef.current();
      },
      (error) => {
        setLocating(false);
        setNotice({
          kind:
            error.code === PERMISSION_DENIED
              ? 'denied'
              : error.code === TIMEOUT
                ? 'timeout'
                : 'unavailable',
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  const dismiss = useCallback(() => {
    setNotice(null);
  }, []);

  return { me, locating, notice, locate, dismiss };
}
