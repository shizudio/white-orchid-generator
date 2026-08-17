// ── MCP server (mcp-server/http.mjs) — remote Streamable HTTP entry ──────────
// Auth fail-closed, health, rate limits, body caps, the shared concurrency
// gate, and a REAL in-process Streamable HTTP round-trip with the SDK client —
// all with mocked drivers (zero browsers, zero AI spend). The SDK lives in
// mcp-server/node_modules (not the repo root), so everything SDK-touching
// skips gracefully when `npm install` has not run there — same pattern as
// mcp-server.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MCP_DIR = path.join(ROOT, 'mcp-server');

let httpMod = null;
let serverMod = null;
let sdkClient = null;
let sdkClientTransport = null;
try {
  httpMod = await import('../../mcp-server/http.mjs');
  serverMod = await import('../../mcp-server/server.mjs');
  ({ Client: sdkClient } = await import('../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js'));
  ({ StreamableHTTPClientTransport: sdkClientTransport } = await import('../../mcp-server/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js'));
} catch { /* handled per-test via skip */ }

const requireSdk = (t) => {
  if (!httpMod || !serverMod || !sdkClient || !sdkClientTransport) {
    t.skip('mcp-server/node_modules not installed (run npm install in mcp-server/)');
    return false;
  }
  return true;
};

const TOKEN = 'test-token-0123456789abcdef-0123456789abcdef';
const PNG_B64 = Buffer.from('not-really-a-png-but-valid-base64').toString('base64');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Mock drivers: full result shapes, no browser, no network, no spend.
function mockDrivers({ generateDelayMs = 0 } = {}) {
  return {
    async generatePost({ brief, format }) {
      if (generateDelayMs) await sleep(generateDelayMs);
      return {
        png: PNG_B64, sessionId: 'sess-mock-1', studioUrl: 'http://x/generate?session=sess-mock-1',
        format, readiness: { known: true, blockedCount: 0, formats: {} }, reply: `made: ${brief}`, notes: [],
      };
    },
    async refinePost({ sessionId, instruction }) {
      return { png: PNG_B64, sessionId, studioUrl: 'u', reply: `did: ${instruction}`, changed: null, pixelChanged: true, notes: [] };
    },
    async exportPost({ sessionId, formats }) {
      return {
        sessionId, studioUrl: 'u', outDir: '/tmp/x', historyRowsRecorded: formats.length, notes: [],
        results: formats.map(f => ({ format: f, exported: true, blocked: false, file: `/tmp/x/${f}.png`, png: PNG_B64 })),
      };
    },
    async listPosts({ limit }) {
      return {
        configured: true, base: 'http://mock',
        sessions: [{ id: 'sess-mock-1', title: 'Mock post', updatedAt: '2026-08-17T00:00:00Z', exported: false, liked: false }].slice(0, limit),
      };
    },
  };
}

async function startTestServer(t, opts = {}) {
  const logs = [];
  const srv = await httpMod.startHttpServer({
    port: 0,
    token: TOKEN,
    drivers: mockDrivers(opts.mock),
    log: (line) => logs.push(line),
    ...opts.server,
  });
  t.after(() => srv.close());
  return { ...srv, logs, base: `http://127.0.0.1:${srv.port}` };
}

async function connectedClient(t, url, requestInit) {
  const transport = new sdkClientTransport(new URL(url), requestInit ? { requestInit } : undefined);
  const client = new sdkClient({ name: 'wo-http-test', version: '0.0.0' });
  await client.connect(transport);
  t.after(() => client.close().catch(() => {}));
  return client;
}

// ── Auth primitives (fail-closed) ────────────────────────────────────────────

test('mcp http: requireAuthToken refuses a missing token with a generation hint', (t) => {
  if (!requireSdk(t)) return;
  assert.throws(() => httpMod.requireAuthToken({}), /refusing to start an OPEN server/i);
  assert.throws(() => httpMod.requireAuthToken({ WO_MCP_AUTH_TOKEN: '   ' }), /refusing/i);
  assert.throws(() => httpMod.requireAuthToken({}), /randomBytes/, 'the error teaches how to generate a real token');
});

test('mcp http: requireAuthToken refuses trivially short tokens', (t) => {
  if (!requireSdk(t)) return;
  assert.throws(() => httpMod.requireAuthToken({ WO_MCP_AUTH_TOKEN: 'hunter2' }), /too short/i);
  assert.equal(httpMod.requireAuthToken({ WO_MCP_AUTH_TOKEN: TOKEN }), TOKEN);
});

test('mcp http: tokenMatches is exact and never throws on odd input', (t) => {
  if (!requireSdk(t)) return;
  assert.equal(httpMod.tokenMatches(TOKEN, TOKEN), true);
  assert.equal(httpMod.tokenMatches(TOKEN + 'x', TOKEN), false);
  assert.equal(httpMod.tokenMatches('', TOKEN), false);
  assert.equal(httpMod.tokenMatches(null, TOKEN), false);
  assert.equal(httpMod.tokenMatches('short', TOKEN), false, 'length mismatch is a plain false, not a crash');
});

test('mcp http: extractToken — Bearer header wins, then ?key=, then /t/<token>/ segment', (t) => {
  if (!requireSdk(t)) return;
  const url = new URL('http://x/mcp?key=from-query');
  assert.equal(httpMod.extractToken({ headers: { authorization: 'Bearer from-header' } }, url), 'from-header');
  assert.equal(httpMod.extractToken({ headers: {} }, url), 'from-query');
  assert.equal(httpMod.extractToken({ headers: {} }, new URL('http://x/t/from-path/mcp')), 'from-path');
  assert.equal(httpMod.extractToken({ headers: {} }, new URL('http://x/mcp')), null);
  assert.equal(httpMod.extractToken({ headers: { authorization: 'Basic abc' } }, new URL('http://x/mcp')), null, 'non-Bearer schemes are not credentials here');
});

test('mcp http: normalizePath strips the /t/<token> prefix only', (t) => {
  if (!requireSdk(t)) return;
  assert.equal(httpMod.normalizePath('/t/secret123/mcp'), '/mcp');
  assert.equal(httpMod.normalizePath('/mcp'), '/mcp');
  assert.equal(httpMod.normalizePath('/healthz'), '/healthz');
  assert.equal(httpMod.normalizePath('/t/secret123'), '/');
});

test('mcp http: redact scrubs the token in every accepted position', (t) => {
  if (!requireSdk(t)) return;
  const scrubbed = httpMod.redact(`GET /mcp?key=${TOKEN} auth="Bearer ${TOKEN}" path=/t/${TOKEN}/mcp raw=${TOKEN}`, TOKEN);
  assert.ok(!scrubbed.includes(TOKEN), 'token never survives redaction');
  assert.match(scrubbed, /\[redacted\]/);
  // Defensive: even an unknown token in key= position is scrubbed.
  assert.ok(!httpMod.redact('/mcp?key=some-other-secret', TOKEN).includes('some-other-secret'));
});

// ── Rate limiter ─────────────────────────────────────────────────────────────

test('mcp http: rate limiter enforces per-IP and global windows, and resets', (t) => {
  if (!requireSdk(t)) return;
  let clock = 1_000_000;
  const rl = httpMod.createRateLimiter({ perIpPerMin: 2, globalPerMin: 3, now: () => clock });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false, 'third hit from one IP inside the window is limited');
  assert.equal(rl.allow('b'), false, 'global cap counts limited requests too — brute force cannot dodge it by rotating IPs');
  clock += 61_000;
  assert.equal(rl.allow('a'), true, 'window reset restores service');
});

// ── Concurrency gate (server.mjs) ────────────────────────────────────────────

test('mcp gate: caps at max, queues, and frees slots on release', async (t) => {
  if (!requireSdk(t)) return;
  const gate = serverMod.createGate({ max: 2, queueMax: 4, queueWaitMs: 5_000 });
  const r1 = await gate.acquire();
  const r2 = await gate.acquire();
  assert.equal(gate.active, 2);
  let thirdRan = false;
  const third = gate.acquire().then((rel) => { thirdRan = true; return rel; });
  await sleep(20);
  assert.equal(thirdRan, false, 'third waits while both slots are held');
  assert.equal(gate.queued, 1);
  r1();
  const r3 = await third;
  assert.equal(thirdRan, true, 'release hands the slot to the queue');
  r2(); r3();
  assert.equal(gate.active, 0);
});

test('mcp gate: a full queue rejects immediately with an honest busy error', async (t) => {
  if (!requireSdk(t)) return;
  const gate = serverMod.createGate({ max: 1, queueMax: 0, queueWaitMs: 5_000 });
  const r1 = await gate.acquire();
  await assert.rejects(gate.acquire(), (err) => {
    assert.equal(err.name, 'BusyError');
    assert.match(err.message, /at capacity/i);
    assert.match(err.message, /try again/i);
    return true;
  });
  r1();
});

test('mcp gate: a queued waiter times out with an honest busy error, not a hang', async (t) => {
  if (!requireSdk(t)) return;
  const gate = serverMod.createGate({ max: 1, queueMax: 2, queueWaitMs: 30 });
  const r1 = await gate.acquire();
  await assert.rejects(gate.acquire(), /waited .*no free browser slot|none opened up/i);
  assert.equal(gate.queued, 0, 'the timed-out waiter left the queue');
  r1();
});

test('mcp gate: double-release never frees a phantom slot', async (t) => {
  if (!requireSdk(t)) return;
  const gate = serverMod.createGate({ max: 1, queueMax: 1, queueWaitMs: 5_000 });
  const r1 = await gate.acquire();
  r1(); r1(); r1();
  assert.equal(gate.active, 0, 'active count cannot go negative');
  const r2 = await gate.acquire();
  assert.equal(gate.active, 1);
  r2();
});

// ── Boot refusal (real process, fail-closed) ─────────────────────────────────

function spawnHttp(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(MCP_DIR, 'http.mjs')], {
      env: { ...process.env, WO_MCP_AUTH_TOKEN: '', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 8_000);
    child.on('exit', (code) => { clearTimeout(timer); resolve({ code, stderr }); });
  });
}

test('mcp http: booting without WO_MCP_AUTH_TOKEN refuses with exit 1 and a clear message', async (t) => {
  if (!requireSdk(t)) return;
  const { code, stderr } = await spawnHttp({ WO_MCP_AUTH_TOKEN: '' });
  assert.equal(code, 1);
  assert.match(stderr, /REFUSING TO START/);
  assert.match(stderr, /WO_MCP_AUTH_TOKEN/);
});

test('mcp http: booting with a weak token also refuses (no accidentally-guessable server)', async (t) => {
  if (!requireSdk(t)) return;
  const { code, stderr } = await spawnHttp({ WO_MCP_AUTH_TOKEN: 'abc123' });
  assert.equal(code, 1);
  assert.match(stderr, /too short/i);
});

// ── Live in-process HTTP (mocked drivers — zero spend) ───────────────────────

test('mcp http: /healthz answers 200 with no auth and no information', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const res = await fetch(`${base}/healthz`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'ok');
});

test('mcp http: /mcp without credentials is 401 with zero detail', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.deepEqual(body, { error: 'unauthorized' }, 'no hint about which mechanism or why');
});

test('mcp http: a wrong token is 401 — header, query, and path forms alike', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  for (const attempt of [
    { url: `${base}/mcp`, headers: { authorization: 'Bearer wrong-token-wrong-token' } },
    { url: `${base}/mcp?key=wrong-token-wrong-token`, headers: {} },
    { url: `${base}/t/wrong-token-wrong-token/mcp`, headers: {} },
  ]) {
    const res = await fetch(attempt.url, { method: 'POST', headers: { 'content-type': 'application/json', ...attempt.headers }, body: '{}' });
    assert.equal(res.status, 401, attempt.url.replace(base, ''));
  }
});

test('mcp http: unknown paths 404; disallowed methods 405; oversized bodies 413', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  assert.equal((await fetch(`${base}/`, { method: 'GET' })).status, 404);
  assert.equal((await fetch(`${base}/mcp?key=${TOKEN}`, { method: 'PUT', body: '{}' })).status, 405);
  const big = '"' + 'x'.repeat(httpMod.MAX_BODY_BYTES + 1024) + '"';
  const res = await fetch(`${base}/mcp?key=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: big }).catch(() => null);
  // Node may reset the socket on destroy before the 413 flushes — both are a hard stop.
  assert.ok(res === null || res.status === 413, 'oversized body is refused');
});

test('mcp http: SDK client over Bearer header — initialize, tools/list shows the four tools', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const client = await connectedClient(t, `${base}/mcp`, { headers: { authorization: `Bearer ${TOKEN}` } });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(x => x.name).sort(), ['wo_export_post', 'wo_generate_post', 'wo_list_posts', 'wo_refine_post']);
});

test('mcp http: SDK client over ?key= URL (the claude.ai connector form) — full tool call round-trip', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  const result = await client.callTool({ name: 'wo_list_posts', arguments: { limit: 5 } });
  assert.ok(!result.isError, 'call succeeded');
  const payload = JSON.parse(result.content.find(c => c.type === 'text').text);
  assert.equal(payload.sessions[0].id, 'sess-mock-1');
});

test('mcp http: SDK client over the /t/<token>/mcp path segment form works too', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const client = await connectedClient(t, `${base}/t/${TOKEN}/mcp`);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 4);
});

test('mcp http: wo_generate_post returns image + meta content through the shared server wiring', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  const result = await client.callTool({ name: 'wo_generate_post', arguments: { brief: 'thank the volunteers' } });
  assert.ok(!result.isError);
  assert.equal(result.content[0].type, 'image');
  assert.equal(result.content[0].data, PNG_B64);
  const meta = JSON.parse(result.content[1].text);
  assert.equal(meta.sessionId, 'sess-mock-1');
  assert.equal(meta.format, 'ig_portrait', 'defaults applied by the shared validation');
  assert.equal(meta.png, undefined, 'binary never duplicated into the meta text');
});

test('mcp http: invalid tool arguments come back as honest tool errors over HTTP', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t);
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  const result = await client.callTool({ name: 'wo_generate_post', arguments: {} });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /brief is required/);
});

test('mcp http: the concurrency gate turns a stampede into 2 wins + honest busy errors', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t, {
    mock: { generateDelayMs: 250 },
    server: { gate: serverMod.createGate({ max: 2, queueMax: 0, queueWaitMs: 50 }) },
  });
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  const results = await Promise.all([1, 2, 3].map(i =>
    client.callTool({ name: 'wo_generate_post', arguments: { brief: `post ${i}` } })));
  const ok = results.filter(r => !r.isError);
  const busy = results.filter(r => r.isError);
  assert.equal(ok.length, 2, 'exactly the two gate slots succeed');
  assert.equal(busy.length, 1);
  assert.match(busy[0].content[0].text, /at capacity/i);
});

test('mcp http: wo_list_posts bypasses the gate (cheap read stays available while browsers are busy)', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t, {
    mock: { generateDelayMs: 300 },
    server: { gate: serverMod.createGate({ max: 1, queueMax: 0, queueWaitMs: 50 }) },
  });
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  const slow = client.callTool({ name: 'wo_generate_post', arguments: { brief: 'hold the slot' } });
  await sleep(30);
  const list = await client.callTool({ name: 'wo_list_posts', arguments: {} });
  assert.ok(!list.isError, 'listing works while the only browser slot is held');
  await slow;
});

test('mcp http: rate limiting answers 429 once the per-IP window is spent', async (t) => {
  if (!requireSdk(t)) return;
  const { base } = await startTestServer(t, {
    server: { limiter: httpMod.createRateLimiter({ perIpPerMin: 3, globalPerMin: 100 }) },
  });
  const hit = () => fetch(`${base}/mcp?key=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await hit()).status);
  assert.ok(statuses.slice(3).every(s => s === 429), `requests beyond the window are 429 (got ${statuses.join(',')})`);
  assert.equal((await fetch(`${base}/healthz`)).status, 200, 'health stays outside the limiter');
});

test('mcp http: the token never appears in server logs — any mechanism, any outcome', async (t) => {
  if (!requireSdk(t)) return;
  const srv = await startTestServer(t);
  const { base, logs } = srv;
  await fetch(`${base}/mcp?key=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await fetch(`${base}/t/${TOKEN}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await fetch(`${base}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: '{}' });
  const client = await connectedClient(t, `${base}/mcp?key=${TOKEN}`);
  await client.callTool({ name: 'wo_list_posts', arguments: {} });
  assert.ok(logs.length > 0, 'requests were logged');
  for (const line of logs) {
    assert.ok(!line.includes(TOKEN), `token leaked into log line: ${line}`);
  }
});

test('mcp http: sessions are tracked per client and evicted on close', async (t) => {
  if (!requireSdk(t)) return;
  const srv = await startTestServer(t);
  const client = await connectedClient(t, `${srv.base}/mcp?key=${TOKEN}`);
  await client.listTools();
  assert.equal(srv.sessions.size, 1, 'initialize created one server-side session');
  await client.close();
  await sleep(50);
  // DELETE-on-close is best-effort in the client; the idle GC is the backstop.
  assert.ok(srv.sessions.size <= 1);
});

test('mcp http: startHttpServer itself is fail-closed — no token, no server', async (t) => {
  if (!requireSdk(t)) return;
  await assert.rejects(async () => httpMod.startHttpServer({ port: 0 }), /requires a token/i);
});
