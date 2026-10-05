// Comprueba que no hay scroll horizontal en anchos de móvil, con la fuente de nombre más largo.
import { expect, test } from '@playwright/test';

for (const width of [320, 375]) {
  test(`medicion: sin scroll horizontal a ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    for (const query of [
      '?fuente=bicing-bcn',
      '?fuente=bicing-bcn&estacion=1',
      '?fuente=demo&estacion=demo-008',
      '?fuente=bicing-bcn&modo=reproducir&dia=2026-08-20&hora=08:30',
      '?fuente=demo&modo=reproducir',
    ]) {
      await page.goto(`/${query}`);
      await page.locator('[data-map-status]').waitFor();
      await page
        .getByText(/estaciones/)
        .first()
        .waitFor();
      if (query.includes('modo=reproducir')) {
        // El reproductor llega con la línea temporal: se mide ya pintado.
        await expect(page.getByRole('slider', { name: 'Momento del día' })).toHaveAttribute(
          'aria-valuetext',
          /con dato|Sin datos/,
        );
      }
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${query} a ${width} px`).toBe(0);
    }
  });
}
