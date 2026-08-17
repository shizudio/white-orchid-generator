// ── White Orchid MCP — shared server construction ────────────────────────────
// The transport-agnostic heart of the MCP server: tool listing, argument
// validation, driver dispatch, result shaping, and honest errors. BOTH entries
// import this — index.mjs (stdio, the laptop setup) and http.mjs (Streamable
// HTTP, the remote deployment) — so the tool behavior is identical by
// construction, not by discipline.
//
// createServer(options):
//   drivers — injectable {generatePost, refinePost, exportPost, listPosts};
//             defaults to the real Playwright driver. Tests inject mocks so
//             the full wiring is exercisable at $0 AI spend.
//   gate    — optional concurrency gate (createGate) applied to the three
//             BROWSER-driving tools only (wo_list_posts is a cheap fetch).
//             stdio passes none (MCP clients serialize calls); HTTP passes a
//             shared gate so N remote users cannot stampede one small VM into
//             a pile of concurrent Chromium instances.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, validateArgs, baseUrl } from './tools.mjs';
import * as realDrivers from './driver.mjs';

// ── Concurrency gate ─────────────────────────────────────────────────────────
// Bounded: at most `max` running, at most `queueMax` waiting, each waiter for
// at most `queueWaitMs`. Overflow and timeout both produce an HONEST busy
// error (the caller sees "at capacity, try again", never a silent multi-minute
// hang). Pure and clock-injectable; unit-tested in scripts/tests/.

export class BusyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BusyError';
  }
}

export function createGate({ max = 2, queueMax = 4, queueWaitMs = 90_000 } = {}) {
  let active = 0;
  const queue = [];

  const pump = () => {
    while (active < max && queue.length > 0) {
      const next = queue.shift();
      clearTimeout(next.timer);
      active += 1;
      next.resolve(makeRelease());
    }
  };

  const makeRelease = () => {
    let released = false;
    return () => {
      if (released) return; // double-release must never free a phantom slot
      released = true;
      active -= 1;
      pump();
    };
  };

  return {
    get active() { return active; },
    get queued() { return queue.length; },
    acquire() {
      if (active < max) {
        active += 1;
        return Promise.resolve(makeRelease());
      }
      if (queue.length >= queueMax) {
        return Promise.reject(new BusyError(
          `The studio driver is at capacity (${max} concurrent browser sessions, ${queueMax} already waiting). `
          + 'Generations take 30–120s — try again in a couple of minutes.',
        ));
      }
      return new Promise((resolve, reject) => {
        const entry = { resolve, timer: null };
        entry.timer = setTimeout(() => {
          const i = queue.indexOf(entry);
          if (i >= 0) queue.splice(i, 1);
          reject(new BusyError(
            `Waited ${Math.round(queueWaitMs / 1000)}s for a free browser slot and none opened up — `
            + 'the studio driver is busy with other generations. Try again in a couple of minutes.',
          ));
        }, queueWaitMs);
        entry.timer.unref?.();
        queue.push(entry);
      });
    },
  };
}

// ── Server construction ──────────────────────────────────────────────────────

export function createServer({ drivers = realDrivers, gate = null } = {}) {
  const server = new Server(
    { name: 'white-orchid-studio', version: '1.1.0' },
    { capabilities: { tools: {}, logging: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // Progress via MCP logging notifications (the SDK supports them; clients
  // without logging simply never see these — the call still just blocks).
  const stageLogger = (tool) => (stage) => {
    server.sendLoggingMessage({ level: 'info', logger: 'white-orchid-studio', data: `${tool}: ${stage}` })
      .catch(() => { /* client may not accept logging — never fail the drive */ });
  };

  const image = (base64) => ({ type: 'image', data: base64, mimeType: 'image/png' });
  const text = (obj) => ({ type: 'text', text: JSON.stringify(obj, null, 2) });
  const errorResult = (message) => ({ isError: true, content: [{ type: 'text', text: message }] });

  // Browser tools go through the gate (when one is set); a queue-full or
  // wait-timeout surfaces as an honest tool error, never a hang.
  const gated = async (fn) => {
    if (!gate) return fn();
    const release = await gate.acquire();
    try { return await fn(); } finally { release(); }
  };

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const checked = validateArgs(name, args);
    if (!checked.ok) return errorResult(checked.error);

    try {
      switch (name) {
        case 'wo_generate_post': {
          const r = await gated(() => drivers.generatePost(checked.value, stageLogger(name)));
          const { png, ...meta } = r;
          return { content: [image(png), text(meta)] };
        }
        case 'wo_refine_post': {
          const r = await gated(() => drivers.refinePost(checked.value, stageLogger(name)));
          const { png, ...meta } = r;
          return { content: [image(png), text(meta)] };
        }
        case 'wo_export_post': {
          const r = await gated(() => drivers.exportPost(checked.value, stageLogger(name)));
          const images = r.results.filter(x => x.png).map(x => image(x.png));
          const meta = {
            ...r,
            results: r.results.map(({ png, ...rest }) => rest), // files carry the bytes; meta stays readable
          };
          return { content: [...images, text(meta)] };
        }
        case 'wo_list_posts': {
          const r = await drivers.listPosts(checked.value);
          return { content: [text(r)] };
        }
        default:
          return errorResult(`unknown tool: ${name}`);
      }
    } catch (err) {
      // A dead browser / stalled stage / unreachable server / busy gate lands
      // HERE as an honest MCP error, never a hang.
      const hint = /could not reach|ECONNREFUSED/i.test(String(err?.message))
        ? ` (start the studio first — e.g. \`npm run dev\` in the repo — or point WO_MCP_BASE_URL at a running instance; currently ${baseUrl()})`
        : '';
      return errorResult(`${err?.message || err}${hint}`);
    }
  });

  return server;
}
