import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSc3Pzyw2_q9hg8CGWWM7RY9GXWT7wMO6SQHjxBFc4wuFX6L1w/viewform';

// The user must first launch their real Chrome with a debug port, e.g.:
//   google-chrome --remote-debugging-port=9222 \
//     --user-data-dir="$HOME/.chrome-form-profile"
// Google trusts that real browser, so login works there; we just attach to it.
const CHROME_DEBUG_URL = 'http://127.0.0.1:9222';

@Injectable()
export class PuppeteerService {
  async execute() {
    // Attach to the already-running real Chrome instead of launching a
    // controlled Chromium (which Google's login flow blocks as "not secure").
    const browser = await puppeteer.connect({
      browserURL: CHROME_DEBUG_URL,
      defaultViewport: null,
    });

    try {
      const page = await browser.newPage();
      await page.goto(FORM_URL, { waitUntil: 'networkidle2' });

      // Wait for the REAL form to appear. On the login page this selector
      // never shows up, so this effectively waits for the user to sign in
      // (in the trusted browser). timeout: 0 = wait indefinitely.
      await page.waitForSelector('form[action*="formResponse"]', {
        timeout: 0,
      });

      // Now the form is loaded and authenticated. Dump the field structure
      // so we know which entry IDs to fill.
      const fields = await page.$$eval('[data-params]', (els) =>
        els.map((el) => el.getAttribute('data-params')),
      );

      console.log('Form fields (raw data-params):', fields);
      return { loaded: true, fieldCount: fields.length, fields };
    } finally {
      // Only detach from the browser; do NOT close the user's real Chrome.
      await browser.disconnect();
    }
  }
}
