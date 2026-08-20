/* ─────────────────────────────────────────────────────────────────────────
   TEMPLATE HARNESS — the headless-Chromium rig the budget measurement and the
   §11 verification renders both run in.

   §11: "Budgets must be measured in the canvas render core, never read off
   Figma. Figma and canvas do not wrap text identically; the budget is only
   honest if it comes from the thing that actually paints."

   So: a real browser, the real brand webfonts, and the real
   lib/render-core/render-template.mjs — loaded as ESM straight off a throwaway
   static file server rooted at the repo. No Next build, no dev server, no port
   the user is using, ZERO network (every non-localhost request is aborted).
   ───────────────────────────────────────────────────────────────────────── */

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json',
  '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.png': 'image/png', '.jpg': 'image/jpeg',
};

/** The page the render core is exercised in. Fonts mirror app/globals.css. */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family:"Romie"; src:url("/public/fonts/Romie-Regular.otf") format("opentype"); font-weight:400; font-style:normal; }
@font-face { font-family:"Romie"; src:url("/public/fonts/Romie-Italic.otf") format("opentype"); font-weight:400; font-style:italic; }
@font-face { font-family:"Syne"; src:url("/public/fonts/Syne-VariableFont_wght.ttf") format("truetype"); font-weight:400 800; font-style:normal; }
@font-face { font-family:"Fira Sans"; src:url("/public/fonts/FiraSans-Light.ttf") format("truetype"); font-weight:300; font-style:normal; }
@font-face { font-family:"Fira Sans"; src:url("/public/fonts/FiraSans-Regular.ttf") format("truetype"); font-weight:400; font-style:normal; }
@font-face { font-family:"Fira Sans"; src:url("/public/fonts/FiraSans-Medium.ttf") format("truetype"); font-weight:500; font-style:normal; }
@font-face { font-family:"Fira Sans"; src:url("/public/fonts/FiraSans-SemiBold.ttf") format("truetype"); font-weight:600; font-style:normal; }
@font-face { font-family:"Fira Sans"; src:url("/public/fonts/FiraSans-Bold.ttf") format("truetype"); font-weight:700; font-style:normal; }
@font-face { font-family:"Aboreto"; src:url("/public/fonts/Aboreto-Regular.ttf") format("truetype"); font-weight:400; font-style:normal; }
body{margin:0;background:#fff;font-family:"Romie","Syne","Fira Sans"}
</style></head><body>
<span id="preload" style="position:absolute;opacity:0">
<span style="font-family:Romie;font-weight:500">Aa</span>
<span style="font-family:Syne;font-weight:400">Aa</span>
<span style="font-family:'Fira Sans';font-weight:400">Aa</span>
</span>
<script type="module">
import { renderTemplate, resolveColourPair } from "/lib/render-core/render-template.mjs";
import { autofit, autofitTrackedCaps } from "/lib/render-core/text.mjs";
import { floorPxFor } from "/lib/render-core/floor.mjs";
import { checkInkOnBackdrop, sampleBackdropLuminance, TEXT_MIN_CONTRAST, MARK_MIN_CONTRAST } from "/lib/render-core/backdrop-contrast.mjs";
import { DIMENSIONS, slotConstraint } from "/lib/templates/template-contract.mjs";
import { templateById } from "/lib/templates/index.mjs";
import { DEFAULT_FONTS } from "/lib/brand-defaults.js";
window.__wo = { renderTemplate, resolveColourPair, autofit, autofitTrackedCaps, floorPxFor, DIMENSIONS, slotConstraint, templateById, DEFAULT_FONTS, checkInkOnBackdrop, sampleBackdropLuminance, TEXT_MIN_CONTRAST, MARK_MIN_CONTRAST };
window.__woReady = true;
</script></body></html>`;

/** Starts a static server rooted at the repo. Returns {url, close}. */
export async function startStaticServer() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }
    const path = join(REPO_ROOT, normalize(url).replace(/^(\.\.[/\\])+/, ''));
    if (!path.startsWith(REPO_ROOT) || !existsSync(path) || !statSync(path).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    createReadStream(path).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, close: () => new Promise((r) => server.close(r)) };
}

/** Boots the harness page. Returns {page, browser, close}. */
export async function openHarness() {
  const srv = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // MONEY LAW / determinism: nothing leaves localhost.
  await context.route('**/*', (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(srv.url, { waitUntil: 'load' });
  await page.waitForFunction('window.__woReady === true', null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return {
    page,
    errors,
    close: async () => { await browser.close(); await srv.close(); },
  };
}
