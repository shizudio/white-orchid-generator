#!/usr/bin/env node
// ── White Orchid MCP — stdio server ──────────────────────────────────────────
// A LOCAL Model Context Protocol server that exposes the real Content Studio
// to any MCP client (Claude Desktop / Claude Cowork / Claude Code). Every tool
// drives the actual running app headlessly via mcp-server/driver.mjs — zero
// re-implemented generation, zero new mutation paths. See README.md for setup.
//
// Contracts live in tools.mjs (SDK-free, unit-tested by the repo suite); this
// file is only wiring: low-level Server + stdio transport + honest errors.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, validateArgs, baseUrl } from './tools.mjs';
import { generatePost, refinePost, exportPost, listPosts, TOOL_TIMEOUT_MS, GENERATE_TIMEOUT_MS } from './driver.mjs';

export function createServer() {
  const server = new Server(
    { name: 'white-orchid-studio', version: '1.0.0' },
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

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const checked = validateArgs(name, args);
    if (!checked.ok) return errorResult(checked.error);

    try {
      switch (name) {
        case 'wo_generate_post': {
          const r = await generatePost(checked.value, stageLogger(name));
          const { png, ...meta } = r;
          return { content: [image(png), text(meta)] };
        }
        case 'wo_refine_post': {
          const r = await refinePost(checked.value, stageLogger(name));
          const { png, ...meta } = r;
          return { content: [image(png), text(meta)] };
        }
        case 'wo_export_post': {
          const r = await exportPost(checked.value, stageLogger(name));
          const images = r.results.filter(x => x.png).map(x => image(x.png));
          const meta = {
            ...r,
            results: r.results.map(({ png, ...rest }) => rest), // files carry the bytes; meta stays readable
          };
          return { content: [...images, text(meta)] };
        }
        case 'wo_list_posts': {
          const r = await listPosts(checked.value);
          return { content: [text(r)] };
        }
        default:
          return errorResult(`unknown tool: ${name}`);
      }
    } catch (err) {
      // A dead browser / stalled stage / unreachable server lands HERE as a
      // stage-named message — an honest MCP error, never a hang.
      const hint = /could not reach|ECONNREFUSED/i.test(String(err?.message))
        ? ` (start the studio first — e.g. \`npm run dev\` in the repo — or point WO_MCP_BASE_URL at a running instance; currently ${baseUrl()})`
        : '';
      return errorResult(`${err?.message || err}${hint}`);
    }
  });

  return server;
}

// Only connect when executed directly (`node index.mjs`), so tests can import
// the wiring without opening stdio.
const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href;
if (isMain) {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — stdout belongs to the MCP protocol.
  console.error(`[white-orchid-mcp] ready — driving ${baseUrl()} (timeouts: ${TOOL_TIMEOUT_MS / 1000}s, generate ${GENERATE_TIMEOUT_MS / 1000}s)`);
}
