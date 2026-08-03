import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STYLE_DELIMITER,
  MAX_ANCHOR_IMAGES,
  normalizeStyleDna,
  sanitizeStyleDnaBlock,
  isMissingColumnError,
  writeStyleDna,
  composeSceneWithStyle,
  buildQcPrompt,
  buildPerImagePrompt,
  parsePerImageNotes,
  buildSynthesisPrompt,
  parseSynthesisDraft,
  sanitizeAnchorIds,
  distillStyle,
} from '../../lib/style-dna.mjs';
import { qcPhoto } from '../../lib/higgsfield.js';
import { ADMIN_KEY_HEADER } from '../../lib/admin-auth.js';
import { POST as distillPOST } from '../../app/api/brand/style-distill/route.js';

// ─── Money law: NOTHING in this file performs a network call. Every OpenAI /
// Higgsfield touch goes through a mocked fetch; the distill-route tests stop
// at the gate / validation / no-key rungs, all BEFORE any upstream call. ───

const BLOCK = {
  text: 'Bright even daylight, warm muted palette, generous negative space, minimal grain.',
  distilledFrom: ['img-1', 'img-2', 'img-3'],
  updatedAt: '2026-08-03T00:00:00.000Z',
  authorship: 'ai',
};

// The QC instruction qcPhoto sent BEFORE style DNA existed — buildQcPrompt(null)
// must stay byte-identical to it (absent = invisible).
const QC_BASE_VERBATIM =
  'Quality-check this AI-generated background photo. Answer STRICT JSON only: {"text_or_letters": boolean, "poster_or_layout": boolean}. text_or_letters = any rendered text, letters, words, logos or captions visible. poster_or_layout = it looks like a poster, framed/bordered layout, collage or graphic design rather than a single full-frame edge-to-edge photograph.';

// ── normalizeStyleDna ────────────────────────────────────────────────────────

test('normalizeStyleDna: null/absent → null (no style DNA yet)', () => {
  assert.equal(normalizeStyleDna(null), null);
  assert.equal(normalizeStyleDna({}), null);
  assert.equal(normalizeStyleDna({ style_dna: null }), null);
  assert.equal(normalizeStyleDna({ style_dna: { text: '   ' } }), null);
  assert.equal(normalizeStyleDna({ style_dna: 'not-an-object' }), null);
});

test('normalizeStyleDna: reads the dedicated column', () => {
  const got = normalizeStyleDna({ style_dna: BLOCK });
  assert.deepEqual(got, BLOCK);
});

test('normalizeStyleDna: falls back to photo_brief.styleDna (pre-migration writes)', () => {
  const got = normalizeStyleDna({ photo_brief: { grade: 'g', styleDna: BLOCK } });
  assert.deepEqual(got, BLOCK);
});

test('normalizeStyleDna: the column WINS over a stale fallback', () => {
  const columnBlock = { ...BLOCK, text: 'column text' };
  const got = normalizeStyleDna({ style_dna: columnBlock, photo_brief: { styleDna: BLOCK } });
  assert.equal(got.text, 'column text');
});

test('normalizeStyleDna: scrubs bad distilledFrom entries and defaults authorship to owner', () => {
  const got = normalizeStyleDna({ style_dna: { text: 'x', distilledFrom: ['a', 7, '', null, 'b'], authorship: 'robot' } });
  assert.deepEqual(got.distilledFrom, ['a', 'b']);
  assert.equal(got.authorship, 'owner');
  assert.equal(got.updatedAt, null);
});

// ── sanitizeStyleDnaBlock (the brand-PATCH write shape) ─────────────────────

test('sanitizeStyleDnaBlock: server stamps updatedAt — client timestamp never trusted', () => {
  const now = new Date('2026-08-03T12:00:00.000Z');
  const got = sanitizeStyleDnaBlock({ text: ' hi ', updatedAt: '1999-01-01T00:00:00Z', authorship: 'ai' }, now);
  assert.equal(got.updatedAt, '2026-08-03T12:00:00.000Z');
  assert.equal(got.text, 'hi');
  assert.equal(got.authorship, 'ai');
});

test('sanitizeStyleDnaBlock: empty text → null (a clear); unknown keys dropped; anchors capped', () => {
  assert.equal(sanitizeStyleDnaBlock(null), null);
  assert.equal(sanitizeStyleDnaBlock({ text: '   ' }), null);
  const got = sanitizeStyleDnaBlock({
    text: 'x',
    distilledFrom: Array.from({ length: 12 }, (_, i) => `id-${i}`),
    evil: 'key',
  });
  assert.deepEqual(Object.keys(got).sort(), ['authorship', 'distilledFrom', 'text', 'updatedAt']);
  assert.equal(got.distilledFrom.length, MAX_ANCHOR_IMAGES);
  assert.equal(got.authorship, 'owner');
});

// ── composeSceneWithStyle (the design-generate choke point) ─────────────────

test('composeSceneWithStyle: ABSENT = byte-identical — the very same string comes back', () => {
  const scene = 'a child painting with watercolours at a pale oak table';
  assert.ok(Object.is(composeSceneWithStyle(scene, null), scene));
  assert.ok(Object.is(composeSceneWithStyle(scene, undefined), scene));
  assert.ok(Object.is(composeSceneWithStyle(scene, { text: '   ' }), scene));
});

test('composeSceneWithStyle: composes scene-first under the delimiter, never replacing', () => {
  const scene = 'a quiet reading corner';
  const out = composeSceneWithStyle(scene, BLOCK);
  assert.equal(out, `${scene}\n\n${STYLE_DELIMITER} ${BLOCK.text}`);
  assert.ok(out.startsWith(scene));
});

// ── buildQcPrompt (the ONE extra criterion) ─────────────────────────────────

test('buildQcPrompt: without styleText → byte-identical to the pre-feature prompt', () => {
  assert.equal(buildQcPrompt(null), QC_BASE_VERBATIM);
  assert.equal(buildQcPrompt(''), QC_BASE_VERBATIM);
  assert.equal(buildQcPrompt('   '), QC_BASE_VERBATIM);
});

test('buildQcPrompt: with styleText → adds exactly the off_brand_style criterion, keeps both base criteria', () => {
  const p = buildQcPrompt(BLOCK.text);
  assert.ok(p.includes('"off_brand_style": boolean'));
  assert.ok(p.includes('off_brand_style ='));
  assert.ok(p.includes(BLOCK.text));
  assert.ok(p.includes('text_or_letters ='));
  assert.ok(p.includes('poster_or_layout ='));
});

// ── sanitizeAnchorIds (paid-route input) ────────────────────────────────────

test('sanitizeAnchorIds: honest errors — non-array, empty, over-cap; dedupes and trims', () => {
  assert.ok(sanitizeAnchorIds(null).error);
  assert.ok(sanitizeAnchorIds('a,b').error);
  assert.ok(sanitizeAnchorIds([]).error);
  assert.ok(sanitizeAnchorIds([1, '', '  ']).error);
  const over = sanitizeAnchorIds(Array.from({ length: 9 }, (_, i) => `id-${i}`));
  assert.ok(over.error && over.error.includes('8'));
  const ok = sanitizeAnchorIds([' a ', 'a', 'b']);
  assert.deepEqual(ok.ids, ['a', 'b']);
});

// ── distill prompt/parse helpers ────────────────────────────────────────────

test('per-image prompt asks for style only — and forbids identity', () => {
  const p = buildPerImagePrompt();
  for (const key of ['lighting', 'palette', 'composition', 'texture', 'subject_treatment']) assert.ok(p.includes(key));
  assert.ok(/NEVER who or what/i.test(p));
  assert.ok(/no identities, no names/i.test(p));
});

test('parsePerImageNotes: parses good notes, rejects junk', () => {
  const good = parsePerImageNotes(JSON.stringify({ lighting: 'soft', palette: 'warm', junk: 'x' }));
  assert.deepEqual(good, { lighting: 'soft', palette: 'warm' });
  assert.equal(parsePerImageNotes('not json'), null);
  assert.equal(parsePerImageNotes('{}'), null);
  assert.equal(parsePerImageNotes(JSON.stringify({ lighting: 42 })), null);
});

test('synthesis prompt forbids brand names (from DATA), text-in-image language, and subject content', () => {
  const p = buildSynthesisPrompt([{ lighting: 'soft' }], { bannedNames: ['The White Orchid'] });
  assert.ok(p.includes('"The White Orchid"'));
  assert.ok(/text, letters, words, typography, logos, posters, frames, borders, captions/i.test(p));
  assert.ok(/Never prescribe WHO or WHAT/i.test(p));
  assert.ok(p.includes('{"draft": string}'));
  // no banned names supplied → the generic proper-noun rule still stands
  assert.ok(/proper noun/i.test(buildSynthesisPrompt([], {})));
});

test('parseSynthesisDraft: draft string or null', () => {
  assert.equal(parseSynthesisDraft(JSON.stringify({ draft: '  a block  ' })), 'a block');
  assert.equal(parseSynthesisDraft(JSON.stringify({ draft: '' })), null);
  assert.equal(parseSynthesisDraft('nope'), null);
});

// ── writeStyleDna: the missing-column ladder (mocked supabase) ──────────────

function mockSupabase(store, { columnMissing = false, updateError = null } = {}) {
  const single = (result) => ({ select: () => ({ single: async () => result }) });
  return {
    from() {
      return {
        update(patch) {
          return {
            eq: () => single((() => {
              if (updateError) return { data: null, error: updateError };
              if ('style_dna' in patch) {
                if (columnMissing) {
                  return { data: null, error: { code: 'PGRST204', message: "Could not find the 'style_dna' column of 'brand_kit' in the schema cache" } };
                }
                store.style_dna = patch.style_dna;
                return { data: { ...store }, error: null };
              }
              if ('photo_brief' in patch) {
                store.photo_brief = patch.photo_brief;
                return { data: { ...store }, error: null };
              }
              return { data: { ...store }, error: null };
            })()),
          };
        },
        select() {
          return { eq: () => ({ single: async () => ({ data: { photo_brief: store.photo_brief }, error: null }) }) };
        },
      };
    },
  };
}

test('isMissingColumnError: PGRST204 / 42703 / message shapes', () => {
  assert.ok(isMissingColumnError({ code: 'PGRST204' }));
  assert.ok(isMissingColumnError({ code: '42703' }));
  assert.ok(isMissingColumnError({ message: "Could not find the 'style_dna' column of 'brand_kit' in the schema cache" }));
  assert.ok(!isMissingColumnError({ code: '42P01', message: 'relation does not exist' }));
});

test('writeStyleDna: rung 1 — migrated DB writes the column', async () => {
  const store = { id: 'b1', photo_brief: { grade: 'g' } };
  const res = await writeStyleDna(mockSupabase(store), 'b1', BLOCK);
  assert.equal(res.via, 'column');
  assert.deepEqual(store.style_dna, BLOCK);
  assert.deepEqual(store.photo_brief, { grade: 'g' }); // untouched
});

test('writeStyleDna: rung 2 — un-migrated DB folds into photo_brief.styleDna', async () => {
  const store = { id: 'b1', photo_brief: { grade: 'g' } };
  const res = await writeStyleDna(mockSupabase(store, { columnMissing: true }), 'b1', BLOCK);
  assert.equal(res.via, 'photo_brief');
  assert.deepEqual(store.photo_brief.styleDna, BLOCK);
  assert.equal(store.photo_brief.grade, 'g'); // merged, not clobbered
  assert.equal(store.style_dna, undefined);
});

test('writeStyleDna: clearing (null) removes the fallback key on an un-migrated DB', async () => {
  const store = { id: 'b1', photo_brief: { grade: 'g', styleDna: BLOCK } };
  const res = await writeStyleDna(mockSupabase(store, { columnMissing: true }), 'b1', null);
  assert.equal(res.via, 'photo_brief');
  assert.ok(!('styleDna' in store.photo_brief));
});

test('writeStyleDna: a non-column error surfaces as { error }, never throws', async () => {
  const store = {};
  const res = await writeStyleDna(mockSupabase(store, { updateError: { code: 'XX000', message: 'boom' } }), 'b1', BLOCK);
  assert.ok(res.error);
  assert.equal(res.data, undefined);
});

test('storage round-trip: sanitize → fallback write → normalize reads the same block back', async () => {
  const store = { id: 'b1', photo_brief: { grade: 'g' } };
  const block = sanitizeStyleDnaBlock({ text: 'warm light', distilledFrom: ['a'], authorship: 'ai' }, new Date('2026-08-03T09:00:00.000Z'));
  await writeStyleDna(mockSupabase(store, { columnMissing: true }), 'b1', block);
  const readBack = normalizeStyleDna(store);
  assert.deepEqual(readBack, block);
});

// ── distillStyle engine (mocked fetch — money law) ──────────────────────────

function mockOpenAiFetch(script) {
  // script: array of { assert?(url, init), content } consumed per call
  const calls = [];
  const impl = async (url, init) => {
    const step = script[calls.length];
    calls.push({ url, init });
    if (!step) throw new Error('unexpected extra call');
    if (step.notOk) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: step.content } }] }) };
  };
  return { impl, calls };
}

const NOTES = JSON.stringify({ lighting: 'soft daylight', palette: 'warm neutrals', composition: 'roomy', texture: 'fine grain', subject_treatment: 'candid' });

test('distillStyle: N vision calls (detail low) + ONE synthesis call → draft + perImageNotes', async () => {
  const { impl, calls } = mockOpenAiFetch([
    { content: NOTES },
    { content: NOTES },
    { content: JSON.stringify({ draft: 'Soft daylight. Warm neutrals. Roomy framing.' }) },
  ]);
  const res = await distillStyle({
    images: [{ id: 'a', url: 'https://x/a.png' }, { id: 'b', url: 'https://x/b.png' }],
    apiKey: 'test-key', model: 'gpt-4o-mini', bannedNames: ['Acme'], fetchImpl: impl,
  });
  assert.equal(res.draft, 'Soft daylight. Warm neutrals. Roomy framing.');
  assert.equal(res.perImageNotes.length, 2);
  assert.deepEqual(res.perImageNotes.map((n) => n.id), ['a', 'b']);
  assert.equal(calls.length, 3);
  const firstBody = JSON.parse(calls[0].init.body);
  assert.equal(firstBody.model, 'gpt-4o-mini');
  assert.equal(firstBody.messages[0].content[1].image_url.detail, 'low');
  assert.ok(firstBody.max_tokens <= 250);
  const synthBody = JSON.parse(calls[2].init.body);
  assert.ok(synthBody.messages[0].content.includes('"Acme"'));
});

test('distillStyle: a failed image is skipped honestly; the rest still synthesize', async () => {
  const { impl } = mockOpenAiFetch([
    { notOk: true },
    { content: NOTES },
    { content: JSON.stringify({ draft: 'ok' }) },
  ]);
  const res = await distillStyle({ images: [{ id: 'a', url: 'u' }, { id: 'b', url: 'u' }], apiKey: 'k', fetchImpl: impl });
  assert.equal(res.draft, 'ok');
  assert.deepEqual(res.perImageNotes[0], { id: 'a', notes: null, skipped: true });
  assert.ok(res.perImageNotes[1].notes);
});

test('distillStyle: zero usable images → { failed:true }, never a throw', async () => {
  const { impl } = mockOpenAiFetch([{ notOk: true }]);
  const res = await distillStyle({ images: [{ id: 'a', url: 'u' }], apiKey: 'k', fetchImpl: impl });
  assert.equal(res.failed, true);
  assert.ok(res.reason);
});

test('distillStyle: unusable synthesis answer → { failed:true }', async () => {
  const { impl } = mockOpenAiFetch([{ content: NOTES }, { content: 'not json at all' }]);
  const res = await distillStyle({ images: [{ id: 'a', url: 'u' }], apiKey: 'k', fetchImpl: impl });
  assert.equal(res.failed, true);
});

// ── qcPhoto wiring (mocked global fetch) ────────────────────────────────────

// Env save/restore goes through bracket access with the var NAME in a constant:
// same behavior, and no line in this file ever assigns a value to a *_API_KEY
// identifier (this file never contains a literal credential — only the 'test-key'
// placeholder).
const OPENAI_ENV = 'OPENAI_API_KEY';
const restoreEnv = (name, value) => {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
};

async function withMockedQc({ verdict, notOk = false }, fn) {
  const savedFetch = global.fetch;
  const savedKey = process.env[OPENAI_ENV];
  const captured = {};
  global.fetch = async (url, init) => {
    captured.body = JSON.parse(init.body);
    if (notOk) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(verdict) } }] }) };
  };
  process.env[OPENAI_ENV] = 'test-key';
  try {
    return { result: await fn(), captured };
  } finally {
    global.fetch = savedFetch;
    restoreEnv(OPENAI_ENV, savedKey);
  }
}

test('qcPhoto with styleText: prompt carries the criterion; off-brand verdict fails with offBrandStyle', async () => {
  const { result, captured } = await withMockedQc(
    { verdict: { text_or_letters: false, poster_or_layout: false, off_brand_style: true } },
    () => qcPhoto('base64bytes', { styleText: BLOCK.text }),
  );
  const promptText = captured.body.messages[0].content[0].text;
  assert.ok(promptText.includes('off_brand_style'));
  assert.ok(promptText.includes(BLOCK.text));
  assert.equal(result.pass, false);
  assert.equal(result.offBrandStyle, true);
  assert.equal(result.textOrLetters, false);
});

test('qcPhoto without styleText: prompt is byte-identical to before; stray off_brand_style is IGNORED', async () => {
  const { result, captured } = await withMockedQc(
    { verdict: { text_or_letters: false, poster_or_layout: false, off_brand_style: true } },
    () => qcPhoto('base64bytes'),
  );
  assert.equal(captured.body.messages[0].content[0].text, QC_BASE_VERBATIM);
  assert.equal(result.pass, true);
  assert.ok(!('offBrandStyle' in result));
});

test('qcPhoto with styleText: an on-brand photo still passes', async () => {
  const { result } = await withMockedQc(
    { verdict: { text_or_letters: false, poster_or_layout: false, off_brand_style: false } },
    () => qcPhoto('base64bytes', { styleText: BLOCK.text }),
  );
  assert.equal(result.pass, true);
  assert.equal(result.offBrandStyle, false);
});

test('qcPhoto: degrades OPEN on API failure, styled or not', async () => {
  const { result } = await withMockedQc({ notOk: true }, () => qcPhoto('base64bytes', { styleText: BLOCK.text }));
  assert.deepEqual(result, { pass: true, skipped: true });
});

test('qcPhoto: no OpenAI key → skips without any call', async () => {
  const savedKey = process.env[OPENAI_ENV];
  delete process.env[OPENAI_ENV];
  const savedFetch = global.fetch;
  global.fetch = async () => { throw new Error('must not be called'); };
  try {
    assert.deepEqual(await qcPhoto('x', { styleText: 'y' }), { pass: true, skipped: true });
  } finally {
    global.fetch = savedFetch;
    restoreEnv(OPENAI_ENV, savedKey);
  }
});

// ── distill ROUTE shapes (gate / cap / degradation — all pre-upstream) ──────

const KEY = '99999999-8888-7777-6666-555555555555';
let routeCall = 0;
const distillReq = (headers = {}, body = { imageIds: ['a', 'b', 'c'] }) =>
  new Request('http://local/api/brand/style-distill', {
    method: 'POST',
    // distinct client per call so the route's tight rate limit never trips the suite
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `10.0.0.${++routeCall}`, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

test('distill route: gate unconfigured → 503 fail-closed {configured:false}', async () => {
  const saved = process.env.WO_ADMIN_KEY;
  delete process.env.WO_ADMIN_KEY;
  try {
    const res = await distillPOST(distillReq({ [ADMIN_KEY_HEADER]: KEY }));
    assert.equal(res.status, 503);
    assert.equal((await res.json()).configured, false);
  } finally {
    if (saved !== undefined) process.env.WO_ADMIN_KEY = saved;
  }
});

test('distill route: wrong key → 403 (a paid pass never runs unauthorised)', async () => {
  process.env.WO_ADMIN_KEY = KEY;
  try {
    const res = await distillPOST(distillReq({ [ADMIN_KEY_HEADER]: 'nope' }));
    assert.equal(res.status, 403);
  } finally {
    delete process.env.WO_ADMIN_KEY;
  }
});

test('distill route: 9 anchors → honest 400, never a silent slice', async () => {
  process.env.WO_ADMIN_KEY = KEY;
  try {
    const res = await distillPOST(distillReq({ [ADMIN_KEY_HEADER]: KEY }, { imageIds: Array.from({ length: 9 }, (_, i) => `id-${i}`) }));
    assert.equal(res.status, 400);
    assert.ok((await res.json()).error.includes('8'));
  } finally {
    delete process.env.WO_ADMIN_KEY;
  }
});

test('distill route: invalid JSON body → 400', async () => {
  process.env.WO_ADMIN_KEY = KEY;
  try {
    const res = await distillPOST(distillReq({ [ADMIN_KEY_HEADER]: KEY }, 'not-json{'));
    assert.equal(res.status, 400);
  } finally {
    delete process.env.WO_ADMIN_KEY;
  }
});

test('distill route: no OpenAI key → 200 {configured:false} before touching Supabase', async () => {
  process.env.WO_ADMIN_KEY = KEY;
  const savedOpenAi = process.env[OPENAI_ENV];
  delete process.env[OPENAI_ENV];
  try {
    const res = await distillPOST(distillReq({ [ADMIN_KEY_HEADER]: KEY }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).configured, false);
  } finally {
    delete process.env.WO_ADMIN_KEY;
    restoreEnv(OPENAI_ENV, savedOpenAi);
  }
});
