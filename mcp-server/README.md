# White Orchid MCP server

A **local stdio MCP server** that lets Claude (Desktop, Cowork, Code, or any MCP
client) generate, refine, and export posts **through the real Content Studio**.
It launches headless Chromium (Playwright) and performs the same flow a human
would — landing prompt → generated design → studio — so the entire brand
constitution (born-clean layout, honesty pipeline, style DNA, readiness gates)
applies untouched. Nothing about generation is re-implemented and no new
mutation paths exist: the session lands in your Posts via the app's **own
autosave**, and you can open it in the studio afterwards to keep refining by
hand (`/generate?session=<id>`).

## Prerequisites

1. **A running studio server.** The MCP server drives a live instance — start
   one first from the repo root:
   ```bash
   npm run dev                # dev server (default port 3000; the house setup uses 3100)
   # or a production build:
   npm run build && npm start
   ```
2. **Repo dependencies installed** (`npm install` at the repo root — Playwright
   is a repo devDependency and is **reused by relative resolution**; the MCP
   server adds no second browser install), plus `npm install` inside
   `mcp-server/` for the MCP SDK.
3. Node 18+ (global `fetch`).

## Costs — read this

**Each `wo_generate_post` / `wo_refine_post` call spends real AI credits
exactly like working in the studio by hand.** The driven page uses the
*server's* configured keys: one generate = one assistant plan call plus (when
Higgsfield/gpt-image is configured) one paid photo generation; one refine = one
assistant call. That is the point of the tool — a prompt is a real generation —
but point it at an environment whose spend you intend. If the server has no
photo keys the pipeline degrades gracefully to a solid-field/Library design
(complete and on-brand) and the tool says so in `notes`.

Pointing `WO_MCP_BASE_URL` at **staging** works too, with the same caveats:
credit spend hits that environment's keys, sessions land in that environment's
shared cloud data, and admin-gated features stay gated there.

## Client configuration

Add this `mcpServers` block (Claude Desktop `claude_desktop_config.json`,
Claude Cowork connector settings, or `claude mcp add` / `.mcp.json` for Claude
Code). Adjust the absolute path and the base URL:

```json
{
  "mcpServers": {
    "white-orchid-studio": {
      "command": "node",
      "args": ["/Users/shinamua/Documents/GitHub/white-orchid-generator/mcp-server/index.mjs"],
      "env": {
        "WO_MCP_BASE_URL": "http://localhost:3100"
      }
    }
  }
}
```

### Environment variables

| Var | Default | Meaning |
|---|---|---|
| `WO_MCP_BASE_URL` | `http://localhost:3100` | The studio origin to drive (local dev, `next start`, or staging). |
| `WO_MCP_TIMEOUT_MS` | `120000` | Per-tool-call budget (refine/export/list). On timeout you get an honest error naming the stalled stage. |
| `WO_MCP_GENERATE_TIMEOUT_MS` | `180000` | Budget for `wo_generate_post` (photo generation alone legitimately runs 30–90s). |
| `WO_MCP_OUT_DIR` | `mcp-server/out/` | Where `wo_export_post` writes PNG files (gitignored). |
| `WO_MCP_PROFILE_DIR` | `mcp-server/.profile/` | Persistent Chromium profile (gitignored). Keeps localStorage between calls so the MCP acts as one consistent "device". |

## Tools

| Tool | Args | What it does |
|---|---|---|
| `wo_generate_post` | `brief` (required), `format?` (`ig_portrait` default; `ig_square`, `story`, `twitter`, `facebook`, `banner`) | Real landing flow → composed design → returns the live canvas PNG + `{ sessionId, studioUrl, readiness, reply, notes }`. |
| `wo_refine_post` | `sessionId`, `instruction` | Opens the session, sends the instruction through the app's real chat (honesty belts intact), returns the updated PNG + the assistant's honest reply + `pixelChanged`. |
| `wo_export_post` | `sessionId`, `formats?` (default all 6) | Runs the app's real per-format export (records export history like a human export). Writes files under `out/<sessionId>/` **and** returns the PNGs. Readiness-blocked formats are reported, never forced. |
| `wo_list_posts` | `limit?` (default 10) | Recent sessions: id, title, updatedAt, exported/liked flags. No browser. |

Progress is surfaced as MCP logging notifications (`wo_generate_post: landing-plan`,
`…: generation`, `…: autosave`, …) for clients that accept logging; others just
see the call block until done.

## Behavior notes

- **One headless browser per tool call**, on a **persistent profile**
  (`mcp-server/.profile/`, ~1–2s launch overhead). A crashed browser or a
  stalled stage produces a stage-named MCP error — never a hang. Run one MCP
  server per profile dir (Chromium locks it).
- **Cloud honesty**: with Supabase configured the session autosaves to the
  shared cloud and shows in Posts everywhere. Without it (unconfigured or
  unreachable) the app degrades gracefully to localStorage — the MCP's
  persistent profile keeps that working across calls (generate → refine →
  export all still function), the tool `notes` say so, and `wo_list_posts`
  (a cloud read) reports the outage honestly.
- `wo_export_post` respects the app's export gate: a format the readiness
  checklist blocks comes back `{ blocked: true }` with its status, exactly as
  the studio would refuse a human.

## Phase 2 (deferred): remote HTTP MCP for claude.ai connectors

A remote MCP (Streamable HTTP on Vercel) would let claude.ai web connect
without a local process — but this server needs **headless Chromium**, which is
heavy/fragile in serverless functions (cold-start binary size, 60s limits vs
30–90s generations). The honest phase-2 shape is a small always-on host (Fly/
Railway/a VM) running this same driver behind the SDK's Streamable HTTP
transport with an auth token, pointed at the production app URL. The tool
contracts in `tools.mjs` are transport-agnostic on purpose — phase 2 swaps the
transport in `index.mjs`, nothing else. Not built yet; ruled out of scope for
task #67.
