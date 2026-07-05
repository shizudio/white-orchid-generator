// The White Orchid — render a branded post PNG from a JSON spec.
//
//   node tools/render.mjs spec.json out/post.png
//
// spec.json shape (all strings; omit "pill" to hide the CTA):
//   {
//     "photo": "photos/afternoon-blocks.png",   // local path or https URL (must be text-free)
//     "eyebrow": "AFTERSCHOOL CARE · SINGAPORE",
//     "headline_line1": "Afternoons,",
//     "headline_italic": "led by the child.",
//     "pill": "NOW ENROLLING",
//     "handle": "thewhiteorchid.sg",
//     "logo": "..."                              // optional; defaults to ivory horizontal lockup
//   }
//
// Requires: npm i -D playwright   (then: npx playwright install chromium)

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, "post-template.html");
const DEFAULT_LOGO = resolve(
  HERE,
  "../the-white-orchid-design-system/project/uploads/Primary Logo 2 - Ivory.png"
);

const [specPath, outPath = "post.png"] = process.argv.slice(2);
if (!specPath) {
  console.error("usage: node tools/render.mjs <spec.json> <out.png>");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));

// Resolve a photo/logo reference to something a file:// page can load.
const asSrc = (p) =>
  /^https?:\/\//.test(p) ? p : pathToFileURL(isAbsolute(p) ? p : resolve(process.cwd(), p)).href;

const filled = readFileSync(TEMPLATE, "utf8")
  .replaceAll("{{PHOTO}}", asSrc(spec.photo))
  .replaceAll("{{LOGO}}", asSrc(spec.logo ?? DEFAULT_LOGO))
  .replaceAll("{{EYEBROW}}", spec.eyebrow ?? "")
  .replaceAll("{{HEAD1}}", spec.headline_line1 ?? "")
  .replaceAll("{{HEAD_ITALIC}}", spec.headline_italic ?? "")
  .replaceAll("{{PILL}}", spec.pill ?? "")
  .replaceAll("{{HANDLE}}", spec.handle ?? "");

// Hide the empty pill if no CTA was supplied.
const html = spec.pill
  ? filled
  : filled.replace('<div class="pill"></div>', "");

// Write a filled temp file next to the template so relative font/CSS urls resolve.
const tmp = resolve(HERE, ".filled.html");
writeFileSync(tmp, html);

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1350 },
  deviceScaleFactor: 2, // crisp 2160×2700 output
});
await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
const post = await page.$(".post");
await post.screenshot({ path: outPath });
await browser.close();
console.log("rendered", outPath);
