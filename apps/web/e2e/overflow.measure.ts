// Comprueba que no hay scroll horizontal en anchos de móvil, con la fuente de nombre más largo.
import { expect, test } from '@playwright/test';

for (const width of [320, 375]) {
  test(`medicion: sin scroll horizontal a ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    for (const query of [
      '?fuente=bicing-bcn',
      '?fuente=bicing-bcn&estacion=1',
      '?fuente=demo&estacion=demo-008',
    ]) {
      await page.goto(`/${query}`);
      await page.locator('[data-map-status]').waitFor();
      await page
        .getByText(/estaciones/)
        .first()
        .waitFor();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${query} a ${width} px`).toBe(0);
    }
  });
}
