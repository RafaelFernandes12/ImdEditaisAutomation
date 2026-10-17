// Launches the WhatsApp Chrome as a standalone process that outlives the app.
// Run it once (`yarn whatsapp:browser`), set WA_BROWSER_URL in .env, and every
// `yarn dev` restart just re-attaches to it instead of relaunching Chromium,
// which `nest --watch` kills mid-write and corrupts the session with.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const PORT = process.env.WA_BROWSER_PORT ?? '9223';

// Same Chrome build whatsapp-web.js launches, so the LocalAuth profile below
// is never upgraded by a newer Chrome and stays usable without this script.
const wwebjsRequire = createRequire(
  createRequire(import.meta.url).resolve('whatsapp-web.js'),
);
const executablePath = wwebjsRequire('puppeteer').executablePath();

// LocalAuth's own profile: the already-linked session carries over, no new QR.
const userDataDir = path.resolve('.wwebjs_auth/session');

const chrome = spawn(
  executablePath,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ],
  { detached: true, stdio: 'ignore' },
);
chrome.unref();

console.log(`Chrome do WhatsApp no ar (pid ${chrome.pid})`);
console.log(`Coloque no .env: WA_BROWSER_URL=http://127.0.0.1:${PORT}`);
