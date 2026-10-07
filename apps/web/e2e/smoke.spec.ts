import { expect, test, type Page } from '@playwright/test';

// Flujo principal sin depender de teselas públicas: se bloquea el mapa base y la
// aplicación debe seguir siendo usable con la lista. El mapa conectado se revisa aparte.
// Siempre la demo: sus datos son fijos. Los datos reales dependen de lo importado en local.
async function openWithoutBasemap(page: Page, query = '') {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.goto(`/?fuente=demo${query}`);
}

test('muestra la demo como datos inventados y con su momento en hora de Barcelona', async ({
  page,
}) => {
  await openWithoutBasemap(page);

  await expect(page.getByText('Datos inventados para probar la aplicación.')).toBeVisible();
  // 09:00 UTC = 10:00 en Barcelona (CET), aunque el navegador esté en Nueva York.
  await expect(page.locator('.source-notice__moment')).toContainText('Momento mostrado');
  await expect(page.locator('.source-notice__time')).toContainText('10 de marzo de 2026, 10:00');
  await expect(page.getByText('46 estaciones')).toBeVisible();
});

test('sin mapa base, lo dice y la lista sigue funcionando', async ({ page }) => {
  await openWithoutBasemap(page);

  await expect(page.getByText('No se ha podido cargar el mapa base.')).toBeVisible();
  await page.getByRole('button', { name: /^Liceu/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toBeVisible();
});

test('seleccionar desde la lista abre el detalle, cambia la URL y volver devuelve el foco', async ({
  page,
}) => {
  await openWithoutBasemap(page);

  await page.getByRole('button', { name: /^Liceu/ }).click();
  const heading = page.getByRole('heading', { level: 2, name: 'Liceu' });
  await expect(heading).toBeFocused();
  await expect(page.getByText('Fuera de servicio (en mantenimiento)')).toBeVisible();
  await expect(page.getByText('Demo con datos inventados')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('estacion')).toBe('demo-008');

  await page.getByRole('button', { name: 'Volver a la lista' }).click();
  await expect(page.getByRole('button', { name: /^Liceu/ })).toBeFocused();
  expect(new URL(page.url()).searchParams.get('estacion')).toBeNull();
});

test('Atrás cierra el detalle en vez de salir de la aplicación', async ({ page }) => {
  await openWithoutBasemap(page);

  await page.getByRole('button', { name: /^Liceu/ }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toBeVisible();
  await expect(page).toHaveTitle('Liceu · Barcelona Pulse');

  await page.goBack();
  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toHaveCount(0);
  await expect(page.getByText('46 estaciones')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('estacion')).toBeNull();
  await expect(page).toHaveTitle('Barcelona Pulse');

  await page.goForward();
  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toBeVisible();
});

test('un enlace directo a una estación sin dato reciente explica por qué es desconocida', async ({
  page,
}) => {
  await openWithoutBasemap(page, '&estacion=demo-024');

  await expect(page.getByRole('heading', { level: 2, name: 'Pl. de Lesseps' })).toBeVisible();
  await expect(page.locator('.station-detail__status')).toHaveText('Sin dato reciente');
  await expect(page.locator('.station-detail__explain')).toContainText(
    /La última observación es de las 07:45, 2 h 15 min antes/,
  );
  await expect(page.getByText('Bicis disponibles')).toHaveCount(0);
});

test('los filtros de la leyenda y la búsqueda acotan la lista', async ({ page }) => {
  await openWithoutBasemap(page);

  await page.getByRole('button', { name: /^Sin dato reciente/ }).click();
  await expect(page.getByRole('button', { name: /^Sin dato reciente/ })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByText('44 de 46 estaciones')).toBeVisible();
  // La vista va en la URL, para compartirla y para que no se pierda al cambiar de idioma.
  expect(new URL(page.url()).searchParams.get('ocultar')).toBe('sin-dato');

  await page.getByLabel('Buscar estación').fill('sants');
  await expect(page.getByText('2 de 46 estaciones')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('buscar')).toBe('sants');
  await page.getByLabel('Buscar estación').fill('zzz');
  await page.getByRole('button', { name: 'Mostrar todas' }).click();
  await expect(page.getByText('46 estaciones')).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('buscar')).toBeNull();
  expect(new URL(page.url()).searchParams.get('ocultar')).toBeNull();
});

test('con el detalle abierto, la búsqueda y la leyenda siguen visibles', async ({ page }) => {
  await openWithoutBasemap(page, '&estacion=demo-008');

  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toBeVisible();
  await expect(page.getByLabel('Buscar estación')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Llena/ })).toBeVisible();

  await page.getByLabel('Buscar estación').fill('sants');
  await expect(page.getByText('2 de 46 estaciones')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Liceu' })).toHaveCount(0);
});

test('experimentar con la demo: red real y escenario comparados, y el escenario en la URL', async ({
  page,
}) => {
  // Una estación nueva en la Sagrada Família, que llega por la URL: sin mapa no se puede tocar.
  await openWithoutBasemap(page, '&modo=experimentar&nuevas=2.17400,41.40360');

  await expect(page.getByRole('button', { name: 'Experimentar' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const deck = page.getByRole('region', { name: 'Escenario de cobertura' });
  await expect(deck.getByText('Hipotético')).toBeVisible();
  await expect(deck.getByText('46 estaciones', { exact: true })).toBeVisible();
  await expect(deck.getByText('47 estaciones', { exact: true })).toBeVisible();
  await expect(page.getByText('Nueva 1')).toBeVisible();

  await page.getByText('Supuestos del cálculo').click();
  await expect(page.getByText(/no es una isócrona/)).toBeVisible();

  await page.getByRole('button', { name: 'Quitar: Nueva 1' }).click();
  await expect(page.getByText(/Todavía es la red real/)).toBeVisible();
  await expect(deck.getByText('46 estaciones', { exact: true })).toHaveCount(2);
  expect(new URL(page.url()).searchParams.get('nuevas')).toBeNull();
});

test('reproducir la demo: momento en hora de Barcelona, pasos de 5 min y horas sin datos', async ({
  page,
}) => {
  await openWithoutBasemap(page, '&modo=reproducir&hora=08:30');

  // 07:30 UTC son las 08:30 en Barcelona, aunque el navegador esté en Nueva York.
  const slider = page.getByRole('slider', { name: 'Momento del día' });
  await expect(slider).toHaveAttribute('aria-valuetext', /^08:30, martes, 10 de marzo de 2026\./);
  await expect(page.getByRole('button', { name: 'mar 10' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByRole('button', { name: '5 minutos después' }).click();
  await expect(slider).toHaveAttribute('aria-valuetext', /^08:35,/);
  await expect(page.getByText('46 estaciones')).toBeVisible();

  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', /^00:00, .*Sin datos\.$/);
  await expect(page.getByText(/Sin datos en este momento/)).toBeVisible();
  // La hora va a la URL cuando la pista se queda quieta, no en cada paso.
  await expect.poll(() => new URL(page.url()).searchParams.get('hora')).toBe('00:00');
});

test('en catalán por la URL y en inglés con el selector, sin perder la estación abierta', async ({
  page,
}) => {
  await openWithoutBasemap(page, '&idioma=ca&estacion=demo-024');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ca');
  await expect(page.getByText('Dades inventades per provar l’aplicació.')).toBeVisible();
  await expect(page.locator('.source-notice__time')).toContainText('10 de març del 2026, 10:00');
  await expect(page.locator('.station-detail__explain')).toContainText(
    /L’última observació és de les 07:45, 2 h 15 min abans/,
  );

  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('button', { name: 'English' })).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByText('Made-up data for trying out the app.')).toBeVisible();
  await expect(page.locator('.source-notice__time')).toContainText('10 March 2026, 10:00');
  await expect(page.getByRole('heading', { level: 2, name: 'Pl. de Lesseps' })).toBeVisible();
  await expect(page.locator('.station-detail__status')).toHaveText('No recent data');
  const url = new URL(page.url());
  expect(url.searchParams.get('idioma')).toBe('en');
  expect(url.searchParams.get('estacion')).toBe('demo-024');
});

test('balance entre dos horas con la demo: de 07:00 a 10:00, totales, clave y la partida en la URL', async ({
  page,
}) => {
  await openWithoutBasemap(page, '&modo=balance');

  await expect(page.getByRole('button', { name: 'Balance' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('.balance-key__title')).toHaveText('Balance de 07:00 a 10:00');
  // La demo: las residenciales pierden bicis por la mañana y el centro las gana.
  await expect(page.locator('.balance__total--gain .balance__big')).toHaveText(/^\+[1-9]\d*$/);
  await expect(page.locator('.balance__total--loss .balance__big')).toHaveText(/^−[1-9]\d*$/);
  // Las cuatro clases suman las 46 estaciones de la demo.
  await expect(page.locator('.balance-key__count').last()).not.toHaveText('…');
  const counts = (await page.locator('.balance-key__count').allTextContents()).map(Number);
  expect(counts.reduce((a, b) => a + b, 0)).toBe(46);

  // Las dos horas van a la URL: la de partida con su parámetro y la de llegada como el momento.
  await page.locator('.balance__from').selectOption('08:00');
  await expect(page.locator('.balance-key__title')).toHaveText('Balance de 08:00 a 10:00');
  await expect.poll(() => new URL(page.url()).searchParams.get('desde')).toBe('08:00');
  await page.locator('.balance__to').selectOption('09:30');
  await expect(page.locator('.balance-key__title')).toHaveText('Balance de 08:00 a 09:30');
  expect(new URL(page.url()).searchParams.get('hora')).toBe('09:30');
  expect(new URL(page.url()).searchParams.get('dia')).toBe('2026-03-10');

  // Una estación de la lista abre su ficha; Atrás devuelve el balance.
  await page.locator('.balance .station-list__item').first().click();
  await expect(page.getByRole('article')).toBeVisible();
  await page.goBack();
  await expect(page.locator('.balance-key__title')).toBeVisible();
  await expect(page.locator('.balance__totals')).toBeVisible();
});
