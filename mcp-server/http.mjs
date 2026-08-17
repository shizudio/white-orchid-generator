#!/usr/bin/env node
// ── White Orchid MCP — remote HTTP entry (Streamable HTTP) ───────────────────
// The SAME server construction as the stdio entry (server.mjs), behind the MCP
// SDK's Streamable HTTP transport, for an always-on host (Fly.io / Railway /
// any small VM) so teammates can use the studio tools from claude.ai when the
// owner's laptop is off. See README-remote.md for the owner runbook.
//
// Security model — FAIL-CLOSED shared secret:
//   • WO_MCP_AUTH_TOKEN must be set (and non-trivial) or the process refuses
//     to start. There is no unauthenticated mode.
//   • The token is accepted two ways, because claude.ai custom connectors
//     reliably support only OAuth (static bearer headers are beta):
//       1. `Authorization: Bearer <token>`   (Claude Code, API, curl, and
//          clients that can send headers)
//       2. embedded in the URL — `?key=<token>` or a `/t/<token>/mcp` path
//          segment (works with ANY client that accepts a plain URL, which is
//          exactly what the claude.ai connector field is)
//   • Comparison is constant-time; failures answer 401 with no detail; the
//     token never appears in logs (redacted defensively even if a client puts
//     it somewhere unexpected).
//
// Survivability on a small VM:
//   • per-IP + global fixed-window rate limits (429),
//   • a shared concurrency gate on the browser-driving tools (max 2 Chromium
//     sessions, bounded queue, honest busy errors — see server.mjs),
//   • request body size cap,
//   • idle MCP sessions garbage-collected.
//
// Multi-user note: every connected user drives the SAME brand workspace and
// their generations land in the SAME shared Posts. That is the product model
// (one brand, many hands), not an isolation bug — but it means the URL+token
// pair must be treated as a password (see README-remote.md).

import http from 'node:http';
import crypto from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { baseUrl } from './tools.mjs';
import { TOOL_TIMEOUT_MS, GENERATE_TIMEOUT_MS } from './driver.mjs';
import { createServer as createMcpServer, createGate } from './server.mjs';

export const DEFAULT_PORT = 8787;
export const MIN_TOKEN_LENGTH = 16;
export const MAX_BODY_BYTES = 512 * 1024; // MCP requests are small JSON; images flow OUT, not in
export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const MAX_SESSIONS = 32;

// ── Auth ─────────────────────────────────────────────────────────────────────

export function requireAuthToken(env = process.env) {
  const token = String(env.WO_MCP_AUTH_TOKEN || '').trim();
  if (!token) {
    throw new Error(
      'WO_MCP_AUTH_TOKEN is not set — refusing to start an OPEN server. '
      + 'Generate a strong token with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"  '
      + 'and set it as a secret (fly secrets set WO_MCP_AUTH_TOKEN=…).',
    );
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `WO_MCP_AUTH_TOKEN is too short (${token.length} chars; minimum ${MIN_TOKEN_LENGTH}) — `
      + 'anyone holding this URL+token can spend real AI credits, so it must be a real secret. '
      + 'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }
  return token;
}

// Constant-time string compare (hash both sides so length differences leak
// nothing and timingSafeEqual never throws on length mismatch).
export function tokenMatches(candidate, token) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  const a = crypto.createHash('sha256').update(candidate).digest();
  const b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}

// Pull the presented credential out of a request: Bearer header first, then
// ?key= query, then a /t/<token>/… path segment. Returns null when absent.
export function extractToken(req, url) {
  const h = req.headers?.authorization;
  if (typeof h === 'string' && /^bearer\s+/i.test(h)) {
    const t = h.replace(/^bearer\s+/i, '').trim();
    if (t) return t;
  }
  const q = url.searchParams.get('key');
  if (q) return q;
  const seg = url.pathname.match(/^\/t\/([^/]+)(\/|$)/);
  if (seg) {
    try { return decodeURIComponent(seg[1]); } catch { return seg[1]; }
  }
  return null;
}

// The MCP endpoint path with any /t/<token> prefix stripped, so both
// /mcp?key=… and /t/<token>/mcp normalize to /mcp.
export function normalizePath(pathname) {
  return pathname.replace(/^\/t\/[^/]+(?=\/|$)/, '') || '/';
}

// Defensive log scrubbing: the token itself, key= query values, and bearer
// header values are all replaced before anything reaches the log stream.
export function redact(s, token) {
  let out = String(s);
  if (token) out = out.split(token).join('[redacted]');
  out = out.replace(/([?&]key=)[^&\s]+/gi, '$1[redacted]');
  out = out.replace(/(\/t\/)[^/\s]+/gi, '$1[redacted]');
  out = out.replace(/(bearer\s+)\S+/gi, '$1[redacted]');
  return out;
}

// ── Rate limiting (fixed window, in-memory — one small VM, no cluster) ───────

export function createRateLimiter({ perIpPerMin = 60, globalPerMin = 240, now = Date.now } = {}) {
  let windowStart = now();
  let globalCount = 0;
  let perIp = new Map();
  return {
    allow(ip) {
      const t = now();
      if (t - windowStart >= 60_000) {
        windowStart = t;
        globalCount = 0;
        perIp = new Map();
      }
      globalCount += 1;
      const mine = (perIp.get(ip) || 0) + 1;
      perIp.set(ip, mine);
      return globalCount <= globalPerMin && mine <= perIpPerMin;
    },
  };
}

export function clientIp(req) {
  // Fly/Railway sit in front as a proxy; prefer their client-ip headers.
  const fly = req.headers?.['fly-client-ip'];
  if (fly) return String(fly);
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// ── Body reading with a hard size cap ────────────────────────────────────────

function readBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('request body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// ── HTTP server ──────────────────────────────────────────────────────────────
// One MCP Server+transport pair per Streamable-HTTP session (the SDK's
// stateful pattern); ONE shared gate across all sessions so the Chromium cap
// is global, which is the entire point of the cap.

export function startHttpServer({
  port = DEFAULT_PORT,
  token,
  drivers,                    // test seam — production uses the real driver
  gate = createGate(),        // max 2 browsers, bounded queue (server.mjs)
  limiter = createRateLimiter(),
  log = (line) => console.error(line),
  sessionIdleMs = SESSION_IDLE_MS,
} = {}) {
  if (!token) throw new Error('startHttpServer requires a token — use requireAuthToken() first (fail-closed).');

  const sessions = new Map(); // sessionId → { transport, lastSeen }
  const safeLog = (line) => { try { log(redact(line, token)); } catch { /* logging must never kill a request */ } };

  const json = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  const rpcError = (res, status, code, message) => json(res, status, { jsonrpc: '2.0', error: { code, message }, id: null });

  async function handleMcp(req, res, parsedBody) {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && typeof sessionId === 'string') {
      const entry = sessions.get(sessionId);
      if (!entry) return rpcError(res, 404, -32001, 'Session not found — reinitialize.');
      entry.lastSeen = Date.now();
      await entry.transport.handleRequest(req, res, parsedBody);
      return;
    }
    if (req.method === 'POST' && isInitializeRequest(parsedBody)) {
      if (sessions.size >= MAX_SESSIONS) {
        // Evict the stalest session rather than refusing new users outright.
        const oldest = [...sessions.entries()].sort((a, b) => a[1].lastSeen - b[1].lastSeen)[0];
        if (oldest) { sessions.delete(oldest[0]); oldest[1].transport.close().catch(() => {}); }
      }
      const server = createMcpServer({ drivers, gate });
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => sessions.set(id, { transport, lastSeen: Date.now() }),
      });
      transport.onclose = () => { if (transport.sessionId) sessions.delete(transport.sessionId); };
      await server.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      return;
    }
    rpcError(res, 400, -32000, 'Bad Request: no valid session. Send an initialize request first.');
  }

  const httpServer = http.createServer(async (req, res) => {
    const startedAt = Date.now();
    let url;
    try {
      url = new URL(req.url, 'http://internal');
    } catch {
      return json(res, 400, { error: 'bad request' });
    }
    const path = normalizePath(url.pathname);
    res.on('finish', () => {
      safeLog(`[wo-mcp-http] ${req.method} ${path} → ${res.statusCode} (${Date.now() - startedAt}ms)`);
    });

    // Health first: no auth, no rate accounting, no information beyond "up".
    if (path === '/healthz' && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('ok');
      return;
    }

    // Rate limit BEFORE auth so credential brute-forcing hits the limiter too.
    if (!limiter.allow(clientIp(req))) {
      return json(res, 429, { error: 'rate limited' });
    }

    if (path !== '/mcp') {
      return json(res, 404, { error: 'not found' });
    }

    // Fail-closed auth: constant-time, 401 with zero detail either way.
    const presented = extractToken(req, url);
    if (!presented || !tokenMatches(presented, token)) {
      return json(res, 401, { error: 'unauthorized' });
    }

    if (req.method !== 'POST' && req.method !== 'GET' && req.method !== 'DELETE') {
      return json(res, 405, { error: 'method not allowed' });
    }

    try {
      let parsedBody;
      if (req.method === 'POST') {
        const raw = await readBody(req);
        try {
          parsedBody = raw.length ? JSON.parse(raw.toString('utf8')) : undefined;
        } catch {
          return rpcError(res, 400, -32700, 'Parse error: invalid JSON');
        }
      }
      await handleMcp(req, res, parsedBody);
    } catch (err) {
      if (err?.statusCode === 413) return json(res, 413, { error: 'request body too large' });
      safeLog(`[wo-mcp-http] request error: ${err?.message || err}`);
      if (!res.headersSent) rpcError(res, 500, -32603, 'Internal server error');
      else try { res.end(); } catch { /* stream already gone */ }
    }
  });

  // Garbage-collect idle sessions so abandoned claude.ai tabs don't pin
  // transports (and their server objects) forever on the small VM.
  const gcTimer = setInterval(() => {
    const cutoff = Date.now() - sessionIdleMs;
    for (const [id, entry] of sessions) {
      if (entry.lastSeen < cutoff) {
        sessions.delete(id);
        entry.transport.close().catch(() => {});
      }
    }
  }, 60_000);
  gcTimer.unref?.();

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      const actualPort = httpServer.address().port;
      resolve({
        httpServer,
        port: actualPort,
        sessions,
        close: () => new Promise((r) => {
          clearInterval(gcTimer);
          for (const [, entry] of sessions) entry.transport.close().catch(() => {});
          sessions.clear();
          httpServer.close(() => r());
          // Idle keep-alive sockets would otherwise hold close() open.
          httpServer.closeAllConnections?.();
        }),
      });
    });
  });
}

// ── Boot (direct execution only — tests import the exports above) ────────────

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  let token;
  try {
    token = requireAuthToken();
  } catch (err) {
    console.error(`[wo-mcp-http] REFUSING TO START: ${err.message}`);
    process.exit(1);
  }
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  const { port: boundPort } = await startHttpServer({ port, token });
  console.error(
    `[wo-mcp-http] ready on :${boundPort} — driving ${baseUrl()} `
    + `(timeouts: ${TOOL_TIMEOUT_MS / 1000}s, generate ${GENERATE_TIMEOUT_MS / 1000}s; `
    + 'auth: Bearer header, ?key= query, or /t/<token>/mcp path)',
  );
}
