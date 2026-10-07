import { describe, expect, it } from 'vitest';
import { AVAILABILITY_ORDER } from './availability';
import {
  hiddenParam,
  listFollowsMapFromParam,
  listFollowsMapParam,
  numberModeFromParam,
  numberModeParam,
  orderFromParam,
  orderParam,
  searchParam,
  visibleFromParam,
} from './viewParams';

describe('la vista en la URL', () => {
  it('las categorías ocultas van y vuelven; sin parámetro se ve todo', () => {
    expect([...visibleFromParam(null)]).toEqual([...AVAILABILITY_ORDER]);
    const visible = visibleFromParam('sin-dato,fuera-de-servicio');
    expect(visible.has('unknown')).toBe(false);
    expect(visible.has('outOfService')).toBe(false);
    expect(visible.has('available')).toBe(true);
    expect(hiddenParam(visible)).toBe('fuera-de-servicio,sin-dato');
    expect(hiddenParam(visibleFromParam(null))).toBeNull();
    // Un valor que no se conoce no oculta nada.
    expect(hiddenParam(visibleFromParam('rojas,,'))).toBeNull();
  });

  it('el orden y el número, con sus nombres en la URL y lo de siempre sin parámetro', () => {
    expect(orderFromParam(null)).toBe('name');
    expect(orderFromParam('libres')).toBe('docks');
    expect(orderFromParam('electricas')).toBe('ebikes');
    expect(orderFromParam('otro')).toBe('name');
    expect(orderParam('name')).toBeNull();
    expect(orderParam('bikes')).toBe('bicis');
    expect(numberModeFromParam('electricas')).toBe('ebikes');
    expect(numberModeFromParam(null)).toBe('bikes');
    expect(numberModeParam('ebikes')).toBe('electricas');
    expect(numberModeParam('bikes')).toBeNull();
  });

  it('la búsqueda vacía no va en la URL', () => {
    expect(searchParam('')).toBeNull();
    expect(searchParam('gràcia')).toBe('gràcia');
  });

  it('la lista que sigue al mapa', () => {
    expect(listFollowsMapFromParam('mapa')).toBe(true);
    expect(listFollowsMapFromParam(null)).toBe(false);
    expect(listFollowsMapParam(true)).toBe('mapa');
    expect(listFollowsMapParam(false)).toBeNull();
  });
});
