# Preenchedor de Formulários IA — Chrome Extension

Reads a Google Form the user is viewing (while logged in), asks the NestJS
server for AI-drafted answers, shows them in an in-page panel for review, and
fills the live form's fields on approval. The user then clicks the form's own
**Submit**. Nothing about the Google login or submission is automated on the
server — those happen in the user's own browser, which is the only place a
login-restricted form is accessible.

## Install (development — load unpacked)

1. Start the server (`yarn dev`, port 3030) with `OPENAI_API_KEY` set.
2. In WhatsApp, send `!extensao` to the bot to receive your token.
3. Open `chrome://extensions`, enable **Developer mode**, click **Load
   unpacked**, and select this `extension/` folder.
4. Open the extension's **Options**, paste the token and the server URL
   (`http://localhost:3030`), and Save.

## Use

1. Open a Google Form (logged in with the account that has access).
2. Click the floating **📝 Preencher com IA** button (bottom-right).
3. Review / edit the drafted answers in the panel, then **Aprovar e preencher**.
4. Check the form and click its **Enviar/Submit**.

## Files

- `manifest.json` — MV3 config; two content scripts (MAIN world extractor +
  isolated UI), background worker, options page.
- `extractor.main.js` — reads `FB_PUBLIC_LOAD_DATA_` in the page's MAIN world.
- `content.js` — launcher button + review panel + orchestration.
- `fill.js` — per-question-type fillers (text, radio, dropdown, checkbox).
- `background.js` — calls `POST /forms/answer` with the stored token.
- `options.html` / `options.js` — token + server URL, saved to `chrome.storage`.

## Publishing to the Chrome Web Store (later)

Same code — zip this folder, create a developer account, add a listing +
privacy-policy URL, and submit for review. MV3's no-remote-code rule is already
satisfied (everything is bundled here).

## Known maintenance point

`fill.js` and `extractor.main.js` depend on Google Forms' internal DOM /
`FB_PUBLIC_LOAD_DATA_` layout, which Google can change without notice. If
extraction or filling breaks, those two files are where to adjust.
