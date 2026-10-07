import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { TimelinePoint } from '../../api/client';
import { setLang } from '../../i18n';
import { Counts } from './ReplayParts';

const point: TimelinePoint = {
  at: '2026-05-21T06:00:00+00:00',
  stationsKnown: 548,
  stationsWithData: 542,
  stationsCounted: 540,
  stationsEmpty: 49,
  stationsFull: 7,
  bikesAvailable: 4650,
  docksAvailable: 8833,
  stationsCountedEbikes: 540,
  ebikesAvailable: 2100,
};

afterEach(() => {
  cleanup();
  setLang('es');
});

describe('recuentos del momento', () => {
  it('dice las bicis (y las eléctricas) y los anclajes libres sumados y en cuántas estaciones', async () => {
    const user = userEvent.setup();
    render(<Counts point={point} toleranceMinutes={15} />);

    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      '49 sin bicis',
      '7 llenas',
      '4650 bicis (2100 eléctricas) y 8833 anclajes libres en 540 estaciones',
      '542 de 548 con dato',
    ]);

    // «En 540 estaciones» explica cuáles suman: las operativas con los dos recuentos.
    await user.click(screen.getByRole('button', { name: 'en 540 estaciones' }));
    expect(screen.getByRole('note').textContent).toBe(
      'Las operativas que publican bicis y anclajes. Las demás no suman.',
    );
  });

  it('si alguna estación contada no publica el desglose, no dice cuántas eléctricas hay', () => {
    // La demo tiene una estación que solo publica el total: sumar las demás no sería la red.
    render(<Counts point={{ ...point, stationsCountedEbikes: 539 }} toleranceMinutes={15} />);
    expect(screen.getByText(/bicis y/).textContent).toBe(
      '4650 bicis y 8833 anclajes libres en 540 estaciones',
    );
    expect(screen.queryByText(/eléctricas/)).toBeNull();
  });

  it('sin recuento de bicis no dice cero: no sale', () => {
    render(
      <Counts
        point={{ ...point, stationsCounted: 0, bikesAvailable: null, docksAvailable: null }}
        toleranceMinutes={15}
      />,
    );
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['49 sin bicis', '7 llenas', '542 de 548 con dato']);
    expect(screen.queryByText(/bicis y/)).toBeNull();
  });

  it('en inglés, con las cifras a la inglesa', () => {
    setLang('en');
    render(<Counts point={{ ...point, bikesAvailable: 12_345 }} toleranceMinutes={15} />);
    expect(screen.getByText(/free docks/).textContent).toBe(
      '12,345 bikes (2,100 e-bikes) and 8,833 free docks in 540 stations',
    );
  });
});
