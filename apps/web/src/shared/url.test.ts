import { beforeEach, describe, expect, it } from 'vitest';
import { historyPushed, pushParams, syncParam, writeParam } from './url';

describe('url', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('cambiar un parámetro conserva la marca de la entrada que añadió pushParams', () => {
    pushParams({ estacion: '1' }, 'detail');
    expect(historyPushed('detail')).toBe(true);

    // Pasar a otra estación con el detalle abierto, o la hora al reproducir, reemplazan la URL:
    // la entrada sigue siendo la del detalle y «Volver» sigue volviendo atrás.
    writeParam('estacion', '2');
    expect(window.location.search).toBe('?estacion=2');
    expect(historyPushed('detail')).toBe(true);

    syncParam('hora', '08:30');
    expect(window.location.search).toBe('?estacion=2&hora=08%3A30');
    expect(historyPushed('detail')).toBe(true);
    expect(historyPushed('sheet')).toBe(false);
  });
});
