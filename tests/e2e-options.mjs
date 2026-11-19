/**
 * Task 29 (owner decision): the default `npm run test:e2e` / CI covers desktop core flows only and
 * writes no screenshots. `npm run test:e2e:extended` sets E2E_EXTENDED=1, which turns the mobile
 * viewport sections and the screenshot capture of these suites back on (mobile is frozen until
 * pre-release; the checks are kept, not deleted).
 */
export const EXTENDED = process.env.E2E_EXTENDED === '1';

/** `page.screenshot(options)` in extended runs only (default runs write no files). */
export async function screenshot(page, options) {
  if (EXTENDED) await page.screenshot(options);
}
