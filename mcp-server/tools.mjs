// ── White Orchid MCP — tool contracts ────────────────────────────────────────
// The tool names, JSON Schemas, argument validation, and small pure plumbing
// (format enum, studio deep-link, session-list shaping). Deliberately free of
// any SDK/Playwright import so the repo's unit suite (scripts/tests/
// mcp-server.test.mjs) can exercise the contracts without installing the MCP
// SDK or launching a browser. index.mjs consumes these definitions verbatim.
//
// MIRROR NOTE (trap M6): FORMAT_IDS mirrors the DIMENSIONS ids in
// components/Generator.jsx (the app's one format surface). The unit test
// parses Generator.jsx and fails closed on drift — adding a 7th format there
// without touching this list is a build failure, not a silent gap.

export const FORMAT_IDS = [
  'ig_portrait', // 1080×1350 4:5 — the app's default for new posts
  'ig_square',   // 1080×1080 1:1
  'story',       // 1080×1920 9:16
  'twitter',     // 1600×900  16:9
  'facebook',    // 1200×630  1.91:1
  'banner',      // 1500×500  3:1
];

export const DEFAULT_FORMAT = 'ig_portrait';

// Visible labels in the format strip / export list, keyed by id — the driver
// clicks by label because the strip's buttons carry no data-id attribute.
export const FORMAT_LABELS = {
  ig_portrait: 'IG Portrait',
  ig_square: 'IG Square',
  story: 'Story / Reel',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  banner: 'Banner',
};

export const DEFAULT_BASE_URL = 'http://localhost:3100';

export function baseUrl() {
  const raw = String(process.env.WO_MCP_BASE_URL || DEFAULT_BASE_URL).trim();
  return raw.replace(/\/+$/, '');
}

// Deep link that opens a stored session in the studio (the ?session= boot
// param added in components/Generator.jsx routes through the app's own
// openSession flow — restore semantics, no parallel path).
export function studioUrlFor(base, sessionId) {
  return `${String(base).replace(/\/+$/, '')}/generate?session=${encodeURIComponent(String(sessionId))}`;
}

// ── Tool definitions (MCP listTools shape) ───────────────────────────────────

export const TOOLS = [
  {
    name: 'wo_generate_post',
    description:
      'Generate a brand-governed social post in the White Orchid Content Studio from a plain-language brief. '
      + 'Drives the REAL app headlessly (landing prompt → generated design → studio), so the full brand '
      + 'constitution (born-clean layout, honesty pipeline, style DNA, readiness) applies, and the session '
      + 'lands in the user’s Posts via the app’s own autosave. Returns the live canvas PNG plus '
      + '{ sessionId, studioUrl, readiness, notes }. NOTE: each call spends real AI credits exactly like '
      + 'working in the studio by hand (assistant plan + photo generation when configured). Can take 30–120s.',
    inputSchema: {
      type: 'object',
      properties: {
        brief: {
          type: 'string',
          description: 'The post you want, in plain words — e.g. "a thank-you post for our volunteers".',
          minLength: 1,
        },
        format: {
          type: 'string',
          enum: FORMAT_IDS,
          description: `Target format (default ${DEFAULT_FORMAT}).`,
        },
      },
      required: ['brief'],
      additionalProperties: false,
    },
  },
  {
    name: 'wo_refine_post',
    description:
      'Refine an existing post by sessionId with a plain-language instruction (e.g. "change the background to sage"). '
      + 'Opens the session in the real studio and sends the instruction through the app’s own chat pipeline '
      + '(honesty belts included), then returns the updated canvas PNG plus the assistant’s honest reply. '
      + 'Spends one real assistant call.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'The session id returned by wo_generate_post (or from wo_list_posts).', minLength: 1 },
        instruction: { type: 'string', description: 'What to change, in plain words.', minLength: 1 },
      },
      required: ['sessionId', 'instruction'],
      additionalProperties: false,
    },
  },
  {
    name: 'wo_export_post',
    description:
      'Export a session through the app’s real export pipeline (records export history exactly like a human '
      + 'export). Defaults to all 6 formats; pass formats to export a subset. Writes PNGs under mcp-server/out/ '
      + 'and returns them as images. Formats blocked by the readiness gate are reported honestly, not forced.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', minLength: 1 },
        formats: {
          type: 'array',
          items: { type: 'string', enum: FORMAT_IDS },
          description: 'Subset of formats to export (default: all 6).',
          minItems: 1,
        },
      },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'wo_list_posts',
    description:
      'List recent posts (sessions) from the studio: id, title, updatedAt, exported flag. Read-only, no browser.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max sessions to return (default 10).' },
      },
      additionalProperties: false,
    },
  },
];

export function toolByName(name) {
  return TOOLS.find(t => t.name === name) || null;
}

// ── Argument validation (hand-rolled, fail-closed) ───────────────────────────
// Returns { ok:true, value } with defaults applied, or { ok:false, error }.
// Kept schema-adjacent by hand (4 tools, tiny) so the contract is testable
// without a JSON-Schema library dependency.

export function validateArgs(toolName, args) {
  const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
  const str = (v) => typeof v === 'string' && v.trim().length > 0;

  switch (toolName) {
    case 'wo_generate_post': {
      if (!str(a.brief)) return { ok: false, error: 'brief is required — the post you want, in plain words.' };
      if (a.format !== undefined && !FORMAT_IDS.includes(a.format)) {
        return { ok: false, error: `format must be one of: ${FORMAT_IDS.join(', ')}` };
      }
      return { ok: true, value: { brief: a.brief.trim(), format: a.format || DEFAULT_FORMAT } };
    }
    case 'wo_refine_post': {
      if (!str(a.sessionId)) return { ok: false, error: 'sessionId is required (from wo_generate_post or wo_list_posts).' };
      if (!str(a.instruction)) return { ok: false, error: 'instruction is required — what to change, in plain words.' };
      return { ok: true, value: { sessionId: a.sessionId.trim(), instruction: a.instruction.trim() } };
    }
    case 'wo_export_post': {
      if (!str(a.sessionId)) return { ok: false, error: 'sessionId is required (from wo_generate_post or wo_list_posts).' };
      let formats = FORMAT_IDS;
      if (a.formats !== undefined) {
        if (!Array.isArray(a.formats) || a.formats.length === 0) {
          return { ok: false, error: 'formats must be a non-empty array of format ids.' };
        }
        const bad = a.formats.filter(f => !FORMAT_IDS.includes(f));
        if (bad.length) return { ok: false, error: `unknown format(s): ${bad.join(', ')} — valid: ${FORMAT_IDS.join(', ')}` };
        formats = [...new Set(a.formats)];
      }
      return { ok: true, value: { sessionId: a.sessionId.trim(), formats } };
    }
    case 'wo_list_posts': {
      let limit = 10;
      if (a.limit !== undefined) {
        if (!Number.isInteger(a.limit) || a.limit < 1 || a.limit > 50) {
          return { ok: false, error: 'limit must be an integer between 1 and 50.' };
        }
        limit = a.limit;
      }
      return { ok: true, value: { limit } };
    }
    default:
      return { ok: false, error: `unknown tool: ${toolName}` };
  }
}

// Shape the /api/sessions list payload into the wo_list_posts result rows.
// Tolerates both the full column set and the degraded (un-migrated) one — the
// route omits liked/exported_at when those columns are absent.
export function shapeSessionList(payload, limit = 10) {
  const rows = Array.isArray(payload?.sessions) ? payload.sessions : [];
  return rows.slice(0, limit).map(row => ({
    id: row.id,
    title: row.title || 'Post',
    updatedAt: row.updated_at || row.created_at || null,
    exported: row.exported_at != null,
    liked: row.liked === true,
  }));
}
