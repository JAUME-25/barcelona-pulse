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

  await page.getByLabel('Buscar estación').fill('sants');
  await expect(page.getByText('2 de 46 estaciones')).toBeVisible();
  await page.getByLabel('Buscar estación').fill('zzz');
  await page.getByRole('button', { name: 'Mostrar todas' }).click();
  await expect(page.getByText('46 estaciones')).toBeVisible();
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
  expect(new URL(page.url()).searchParams.get('hora')).toBe('00:00');
});
