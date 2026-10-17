import { createRequire } from 'node:module';
import pkg from 'whatsapp-web.js';
const { Client, NoAuth } = pkg;

// Dev only. Drives a WhatsApp Web tab in the Chrome started by
// `yarn whatsapp:browser`, which outlives the app. On restart the tab that is
// already synced is adopted as is instead of being reloaded, so a restart no
// longer means a new sync with the phone.

type WaBrowser = NonNullable<InstanceType<typeof Client>['pupBrowser']>;
type WaPage = NonNullable<InstanceType<typeof Client>['pupPage']>;

/** whatsapp-web.js internals the adopt path drives directly. */
type ClientInternals = {
  inject(): Promise<void>;
  attachEventListeners(): Promise<void>;
  interface: unknown;
  lastLoggedOut: boolean;
};

// The library's own puppeteer, so adopted pages speak the same protocol as the
// bindings it created in them.
const require = createRequire(import.meta.url);
const wwebjsRequire = createRequire(require.resolve('whatsapp-web.js'));
const wwebjsPuppeteer = wwebjsRequire('puppeteer') as {
  connect(options: {
    browserURL: string;
    defaultViewport: null;
  }): Promise<WaBrowser>;
};
const ClientInfo =
  require('whatsapp-web.js/src/structures/ClientInfo.js') as new (
    client: unknown,
    data: unknown,
  ) => pkg.ClientInfo;
const InterfaceController =
  require('whatsapp-web.js/src/util/InterfaceController.js') as new (
    client: unknown,
  ) => unknown;

const WA_URL = 'https://web.whatsapp.com';

// Set in the page once a run reaches `ready`, i.e. once every page-side
// listener has been registered. A new document starts without it, so a tab
// that was reloaded or died mid-setup is never adopted.
const LISTENING_MARK = '__wwebjsListening';

export class AttachedClient extends Client {
  constructor(private readonly browserURL: string) {
    super({
      authStrategy: new NoAuth(),
      puppeteer: { browserURL, defaultViewport: null },
    });
    this.on('ready', () => {
      this.pupPage
        ?.evaluate(`window.${LISTENING_MARK} = true`)
        .catch(() => undefined);
    });
  }

  async initialize() {
    const browser = await wwebjsPuppeteer.connect({
      browserURL: this.browserURL,
      defaultViewport: null,
    });

    let adoptable: WaPage | undefined;
    for (const page of await browser.pages()) {
      if (!page.url().startsWith(WA_URL)) continue;
      if (!adoptable && (await isListening(page))) adoptable = page;
      // Leftover tabs would fight the live one over the session.
      else await page.close();
    }

    if (adoptable) return this.adopt(browser, adoptable);

    await browser.disconnect();
    return super.initialize();
  }

  // The stock destroy() closes the whole browser. Detach and leave the tab
  // running, it is what the next run adopts.
  async destroy() {
    await this.pupBrowser?.disconnect();
  }

  /**
   * Takes over a tab a previous run left fully set up. Its WhatsApp Web state,
   * injected helpers and listeners are all still there; only the bindings that
   * carried events to the dead process are gone. Running the library's setup
   * through `rebindOnly` re-creates those for this process and nothing else.
   */
  private async adopt(browser: WaBrowser, page: WaPage) {
    const internals = this as unknown as ClientInternals;

    this.pupBrowser = browser;
    this.pupPage = rebindOnly(page);
    try {
      await internals.inject();
      await internals.attachEventListeners();
    } finally {
      this.pupPage = page;
    }

    this.info = new ClientInfo(
      this,
      await page.evaluate(`(() => {
        const user = window.require('WAWebUserPrefsMeUser');
        return {
          ...window.require('WAWebConnModel').Conn.serialize(),
          wid: user.getMaybeMePnUser() || user.getMaybeMeLidUser(),
        };
      })()`),
    );
    internals.interface = new InterfaceController(this);

    // Same as the handler initialize() installs: a navigation is a new
    // document, which needs the regular setup again.
    page.on('framenavigated', (frame) => {
      if (frame.url().includes('post_logout=1') || internals.lastLoggedOut) {
        this.emit('disconnected', 'LOGOUT');
        internals.lastLoggedOut = false;
      }
      void internals.inject();
    });

    this.emit('authenticated');
    this.emit('ready');
  }
}

async function isListening(page: WaPage) {
  return page
    .evaluate(`window.${LISTENING_MARK} === true`)
    .then((v) => v === true)
    .catch(() => false);
}

/**
 * A view of `page` under which the library's setup only re-exposes its Node
 * callbacks. Its "already exposed?" probes are told no, so every binding is
 * created again for this process, and every other page-side script (above all
 * the ones registering listeners, which the previous run already did) is
 * skipped. String probes like the "has WhatsApp Web loaded" check still run.
 */
function rebindOnly(page: WaPage): WaPage {
  const evaluate = (fn: unknown, ...args: unknown[]) => {
    if (typeof fn === 'string') return page.evaluate(fn);
    if (args.length === 1 && typeof args[0] === 'string') {
      return Promise.resolve(false);
    }
    return Promise.resolve(undefined);
  };

  return new Proxy(page, {
    get(target, prop): unknown {
      if (prop === 'evaluate') return evaluate;
      const value: unknown = Reflect.get(target, prop, target);
      // Page keeps its state in private fields, so methods need the real
      // page as `this`, not the proxy.
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
}
