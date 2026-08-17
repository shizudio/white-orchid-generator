// ── MCP server (mcp-server/) — contracts, validation, driver plumbing ────────
// Pure tests: tools.mjs is SDK-free by design and driver.mjs imports Playwright
// lazily, so nothing here launches a browser or opens stdio. The live drive is
// verified separately against a running server (see mcp-server/README.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOOLS,
  FORMAT_IDS,
  FORMAT_LABELS,
  DEFAULT_FORMAT,
  validateArgs,
  toolByName,
  studioUrlFor,
  shapeSessionList,
  DEFAULT_BASE_URL,
} from '../../mcp-server/tools.mjs';
import {
  createStages,
  DriverError,
  sha256Hex,
  readinessSummary,
  formatIdForLabel,
  waitForAssistantReply,
} from '../../mcp-server/driver.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── Tool surface ─────────────────────────────────────────────────────────────

test('mcp: exactly the four wo_-prefixed tools are exposed', () => {
  assert.deepEqual(
    TOOLS.map(t => t.name).sort(),
    ['wo_export_post', 'wo_generate_post', 'wo_list_posts', 'wo_refine_post'],
  );
  for (const tool of TOOLS) {
    assert.ok(tool.name.startsWith('wo_'), `${tool.name} carries the wo_ prefix`);
    assert.ok(tool.description.length > 40, `${tool.name} has a real description`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
});

test('mcp: required arguments are declared in the schemas', () => {
  assert.deepEqual(toolByName('wo_generate_post').inputSchema.required, ['brief']);
  assert.deepEqual(toolByName('wo_refine_post').inputSchema.required, ['sessionId', 'instruction']);
  assert.deepEqual(toolByName('wo_export_post').inputSchema.required, ['sessionId']);
  assert.equal(toolByName('wo_list_posts').inputSchema.required, undefined);
});

test('mcp: generation credit-spend warning is in the tool description (honesty)', () => {
  assert.match(toolByName('wo_generate_post').description, /spends real AI credits/i);
});

// ── Format enum mirrors the app (trap M6 — the mirror miss) ──────────────────

test('mcp: FORMAT_IDS mirrors Generator.jsx DIMENSIONS ids, in order', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'Generator.jsx'), 'utf8');
  const block = src.match(/const DIMENSIONS = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'DIMENSIONS array found in Generator.jsx');
  const ids = [...block[1].matchAll(/\{ id:"([a-z_]+)"/g)].map(m => m[1]);
  assert.deepEqual(FORMAT_IDS, ids, 'mcp-server/tools.mjs FORMAT_IDS drifted from Generator.jsx DIMENSIONS');
});

test('mcp: FORMAT_LABELS mirrors Generator.jsx DIMENSIONS labels', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'Generator.jsx'), 'utf8');
  const block = src.match(/const DIMENSIONS = \[([\s\S]*?)\n\];/);
  const labels = Object.fromEntries(
    [...block[1].matchAll(/\{ id:"([a-z_]+)",\s*label:"([^"]+)"/g)].map(m => [m[1], m[2]]),
  );
  assert.deepEqual(FORMAT_LABELS, labels, 'mcp-server/tools.mjs FORMAT_LABELS drifted from Generator.jsx');
});

test('mcp: the generate schema enum and default agree with FORMAT_IDS', () => {
  const schema = toolByName('wo_generate_post').inputSchema.properties.format;
  assert.deepEqual(schema.enum, FORMAT_IDS);
  assert.ok(FORMAT_IDS.includes(DEFAULT_FORMAT));
  assert.equal(DEFAULT_FORMAT, FORMAT_IDS[0], 'the app leads with its default format');
  const exportItems = toolByName('wo_export_post').inputSchema.properties.formats.items;
  assert.deepEqual(exportItems.enum, FORMAT_IDS);
});

// ── Argument validation ──────────────────────────────────────────────────────

test('mcp: wo_generate_post validation', () => {
  assert.equal(validateArgs('wo_generate_post', {}).ok, false);
  assert.equal(validateArgs('wo_generate_post', { brief: '   ' }).ok, false);
  assert.equal(validateArgs('wo_generate_post', { brief: 'x', format: 'a4_flyer' }).ok, false);
  const ok = validateArgs('wo_generate_post', { brief: '  a thank-you post  ' });
  assert.deepEqual(ok, { ok: true, value: { brief: 'a thank-you post', format: DEFAULT_FORMAT } });
  const banner = validateArgs('wo_generate_post', { brief: 'b', format: 'banner' });
  assert.equal(banner.value.format, 'banner');
});

test('mcp: wo_refine_post validation', () => {
  assert.equal(validateArgs('wo_refine_post', { sessionId: 's1' }).ok, false);
  assert.equal(validateArgs('wo_refine_post', { instruction: 'sage bg' }).ok, false);
  const ok = validateArgs('wo_refine_post', { sessionId: ' s1 ', instruction: ' sage ' });
  assert.deepEqual(ok.value, { sessionId: 's1', instruction: 'sage' });
});

test('mcp: wo_export_post validation — defaults to all six, dedupes, rejects unknowns', () => {
  const all = validateArgs('wo_export_post', { sessionId: 's1' });
  assert.deepEqual(all.value.formats, FORMAT_IDS);
  const some = validateArgs('wo_export_post', { sessionId: 's1', formats: ['story', 'story', 'banner'] });
  assert.deepEqual(some.value.formats, ['story', 'banner']);
  assert.equal(validateArgs('wo_export_post', { sessionId: 's1', formats: [] }).ok, false);
  const bad = validateArgs('wo_export_post', { sessionId: 's1', formats: ['story', 'tiktok'] });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /tiktok/);
});

test('mcp: wo_list_posts validation — limit bounds and default', () => {
  assert.equal(validateArgs('wo_list_posts', {}).value.limit, 10);
  assert.equal(validateArgs('wo_list_posts', { limit: 50 }).value.limit, 50);
  assert.equal(validateArgs('wo_list_posts', { limit: 0 }).ok, false);
  assert.equal(validateArgs('wo_list_posts', { limit: 51 }).ok, false);
  assert.equal(validateArgs('wo_list_posts', { limit: 2.5 }).ok, false);
});

test('mcp: unknown tools and junk args fail closed', () => {
  assert.equal(validateArgs('wo_delete_everything', {}).ok, false);
  assert.equal(validateArgs('wo_generate_post', null).ok, false);
  assert.equal(validateArgs('wo_generate_post', [1, 2]).ok, false);
});

// ── sessionId / URL plumbing ─────────────────────────────────────────────────

test('mcp: studioUrlFor builds the ?session= boot-param deep link, encoded', () => {
  assert.equal(
    studioUrlFor('http://localhost:3100', 'sess-123'),
    'http://localhost:3100/generate?session=sess-123',
  );
  assert.equal(
    studioUrlFor('http://localhost:3100/', 'a b&c'),
    'http://localhost:3100/generate?session=a%20b%26c',
  );
  assert.equal(DEFAULT_BASE_URL, 'http://localhost:3100');
});

test('mcp: the boot param wiring exists in Generator.jsx and routes via openSession', () => {
  const src = fs.readFileSync(path.join(ROOT, 'components', 'Generator.jsx'), 'utf8');
  const idx = src.indexOf('get("session")');
  assert.ok(idx > 0, 'Generator.jsx reads the ?session= query param');
  const around = src.slice(Math.max(0, idx - 600), idx + 600);
  assert.match(around, /openSession\(requested\)/, 'the boot param triggers the existing openSession flow, not a parallel restore path');
});

test('mcp: shapeSessionList — full and degraded (un-migrated) column sets', () => {
  const full = shapeSessionList({
    sessions: [
      { id: 'a', title: 'Open house', updated_at: '2026-08-01T00:00:00Z', exported_at: '2026-08-02T00:00:00Z', liked: true },
      { id: 'b', title: '', created_at: '2026-07-01T00:00:00Z' },
      { id: 'c', title: 'Third' },
    ],
  }, 2);
  assert.equal(full.length, 2, 'limit respected');
  assert.deepEqual(full[0], { id: 'a', title: 'Open house', updatedAt: '2026-08-01T00:00:00Z', exported: true, liked: true });
  assert.deepEqual(full[1], { id: 'b', title: 'Post', updatedAt: '2026-07-01T00:00:00Z', exported: false, liked: false });
  assert.deepEqual(shapeSessionList({ configured: false }), []);
  assert.deepEqual(shapeSessionList(null), []);
});

// ── Driver stage machine ─────────────────────────────────────────────────────

test('mcp driver: stages track history and name the current stage', () => {
  const seen = [];
  const stages = createStages(Date.now() + 60_000, s => seen.push(s));
  stages.set('open-landing');
  stages.set('landing-plan');
  assert.equal(stages.current, 'landing-plan');
  assert.deepEqual(stages.history.map(h => h.stage), ['open-landing', 'landing-plan']);
  assert.deepEqual(seen, ['open-landing', 'landing-plan'], 'log callback sees every stage');
  assert.ok(stages.remaining() > 0);
});

test('mcp driver: an expired deadline throws a stage-named DriverError, never hangs', () => {
  const stages = createStages(Date.now() - 1, () => {});
  stages.set('generation');
  assert.throws(() => stages.remaining(), (err) => {
    assert.ok(err instanceof DriverError);
    assert.equal(err.stage, 'generation');
    assert.match(err.message, /\[stage: generation\]/);
    assert.match(err.message, /timed out/);
    return true;
  });
});

test('mcp driver: fail() wraps plain errors with the current stage and passes DriverErrors through', () => {
  const stages = createStages(Date.now() + 60_000, () => {});
  stages.set('export-story');
  const wrapped = stages.fail(new Error('browser has been closed'));
  assert.ok(wrapped instanceof DriverError);
  assert.equal(wrapped.stage, 'export-story');
  assert.match(wrapped.message, /\[stage: export-story\] browser has been closed/);
  const original = new DriverError('boom', 'capture');
  assert.equal(stages.fail(original), original);
});

test('mcp driver: a throwing log callback never breaks the stage machine', () => {
  const stages = createStages(Date.now() + 60_000, () => { throw new Error('client went away'); });
  assert.doesNotThrow(() => stages.set('autosave'));
  assert.equal(stages.current, 'autosave');
});

// ── Driver pure helpers ──────────────────────────────────────────────────────

test('mcp driver: sha256Hex is deterministic and change-sensitive (the refine pixel check)', () => {
  assert.equal(sha256Hex('abc'), sha256Hex('abc'));
  assert.notEqual(sha256Hex('abc'), sha256Hex('abd'));
  assert.match(sha256Hex(Buffer.from('abc')), /^[0-9a-f]{64}$/);
});

test('mcp driver: readinessSummary counts blocked formats and keys by id', () => {
  const summary = readinessSummary([
    { id: 'ig_portrait', label: 'IG Portrait', status: 'Ready' },
    { id: 'banner', label: 'Banner', status: '2 to review ▸' },
    { id: 'story', label: 'Story / Reel', status: 'Blocked' },
  ]);
  assert.equal(summary.known, true);
  assert.equal(summary.blockedCount, 2);
  assert.equal(summary.formats.ig_portrait.ready, true);
  assert.equal(summary.formats.banner.ready, false);
  assert.equal(summary.formats.story.status, 'Blocked');
  assert.deepEqual(readinessSummary([]), { known: false, blockedCount: 0, formats: {} });
});

test('mcp driver: formatIdForLabel maps every strip label back to its id', () => {
  for (const [id, label] of Object.entries(FORMAT_LABELS)) {
    assert.equal(formatIdForLabel(label), id);
  }
  assert.equal(formatIdForLabel('IG Portrait 4:5 extra text'), 'ig_portrait');
  assert.equal(formatIdForLabel('LinkedIn'), null);
});

// ── waitForAssistantReply against a mocked page ──────────────────────────────

function mockChatPage({ replyAfterPolls = 3, settles = true }) {
  let bubblePolls = 0;
  return {
    evaluate: async (fn) => {
      const src = fn.toString();
      if (src.includes('.ad-bubble') && !src.includes('ad-undo-chip')) {
        bubblePolls += 1;
        return bubblePolls >= replyAfterPolls ? 1 : 0;
      }
      if (src.includes('ad-undo-chip')) return settles;
      return null;
    },
  };
}

test('mcp driver: waitForAssistantReply resolves once the bubble count grows and the turn settles', async () => {
  const page = mockChatPage({ replyAfterPolls: 3, settles: true });
  const got = await waitForAssistantReply(page, 0, { timeoutMs: 5_000, pollMs: 1, settleMs: 50, settleFn: async () => {} });
  assert.equal(got, true);
});

test('mcp driver: waitForAssistantReply returns false when no reply arrives in budget', async () => {
  const page = mockChatPage({ replyAfterPolls: Infinity });
  const got = await waitForAssistantReply(page, 0, { timeoutMs: 30, pollMs: 1, settleMs: 10, settleFn: async () => {} });
  assert.equal(got, false);
});

test('mcp driver: waitForAssistantReply still resolves when the settle markers never render', async () => {
  const page = mockChatPage({ replyAfterPolls: 1, settles: false });
  const got = await waitForAssistantReply(page, 0, { timeoutMs: 5_000, pollMs: 1, settleMs: 20, settleFn: async () => {} });
  assert.equal(got, true, 'the settle window is a grace period, not a gate');
});

// ── Server wiring (skipped gracefully when the SDK is not installed) ─────────

test('mcp server: createServer wires list/call handlers over the shared contracts', async (t) => {
  let createServer = null;
  try {
    ({ createServer } = await import('../../mcp-server/index.mjs'));
  } catch {
    t.skip('mcp-server/node_modules not installed (run npm install in mcp-server/)');
    return;
  }
  const server = createServer();
  assert.ok(server, 'server constructed without opening stdio');
});
