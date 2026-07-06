'use client';
import { createContext, useContext, useEffect, useState } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   BRAND PROVIDER — the single client-side brand context (multi-tenancy P1).

   ONE fetch of /api/brand at app load, mounted once from app/layout.jsx so it
   is an ancestor of every route (including the /generate editor). Two consumers
   read the SAME loaded kit — no duplicate network calls:

     1. This provider hydrates the app CHROME's CSS custom properties (the
        --tw-* tokens in app/globals.css that colour Nav, the landing/library/
        upload pages and the Brand kit admin page) — item (a), the CSS-var half.
     2. components/Generator.jsx consumes useBrandKit() and calls applyBrandKit()
        with the same kit to hydrate the canvas-rendering palette (`B`) and the
        typography role maps (`F`/`FU`) — items (a) and (b), the canvas half.

   Fallback contract: a missing/unreachable /api/brand row leaves every :root
   default in globals.css untouched and Generator's module-level B/F/FU on their
   lib/brand-defaults.js values — so White Orchid renders pixel-identical, and
   only a brand that actually overrides a token in the DB shifts anything.

   Scope note: only BASE tone tokens with a direct brand_kit.colors counterpart
   are hydrated (burnham/smoke/wisteria/celadon/ash/jet/tangerine/yellowgreen),
   mirroring applyBrandKit's colorKeys scope exactly. Derived tints
   (--tw-burnham-dk, --tw-celadon-soft, …) have no DB equivalent and stay the
   hardcoded CSS defaults, same as B.burnhamDk / B.celadonDeep do today.
   ───────────────────────────────────────────────────────────────────────── */

const CSS_VAR_BY_LABEL = {
  burnham: '--tw-burnham',
  ivory: '--tw-smoke',
  'white smoke': '--tw-smoke',
  wisteria: '--tw-wisteria',
  tangerine: '--tw-tangerine',
  celadon: '--tw-celadon',
  ash: '--tw-ash',
  jet: '--tw-jet',
  'yellow green': '--tw-yellowgreen',
  yellowgreen: '--tw-yellowgreen',
};

function applyChromeVars(kit) {
  if (!kit || !Array.isArray(kit.colors) || typeof document === 'undefined') return;
  const root = document.documentElement;
  kit.colors.forEach(({ label, hex }) => {
    const varName = CSS_VAR_BY_LABEL[String(label || '').trim().toLowerCase()];
    if (varName && /^#[0-9a-f]{6}$/i.test(hex || '')) root.style.setProperty(varName, hex);
  });
}

const BrandContext = createContext({ kit: null, ready: false });

// Module-level in-flight promise so React 18 StrictMode's double-mount (and any
// second consumer) never fires a second /api/brand request — the "one fetch at
// load" guarantee holds even under remount.
let _brandKitPromise = null;
function loadBrandKit() {
  if (!_brandKitPromise) {
    _brandKitPromise = fetch('/api/brand')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null); // defaults keep every page usable offline
  }
  return _brandKitPromise;
}

export default function BrandProvider({ children }) {
  const [kit, setKit] = useState(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadBrandKit().then(loaded => {
      if (cancelled) return;
      if (loaded) { applyChromeVars(loaded); setKit(loaded); }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);
  return <BrandContext.Provider value={{ kit, ready }}>{children}</BrandContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useBrandKit() {
  return useContext(BrandContext);
}
