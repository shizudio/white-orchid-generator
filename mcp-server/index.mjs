#!/usr/bin/env node
// ── White Orchid MCP — stdio entry ───────────────────────────────────────────
// The LOCAL Model Context Protocol entry point (Claude Desktop / Claude Cowork
// / Claude Code): the shared server from server.mjs on the SDK's stdio
// transport. Every tool drives the actual running app headlessly via
// mcp-server/driver.mjs — zero re-implemented generation, zero new mutation
// paths. See README.md for setup; http.mjs is the remote (Streamable HTTP)
// entry over the SAME server construction.
//
// No gate here on purpose: stdio MCP clients serialize tool calls themselves,
// and the persistent Chromium profile is locked to one browser anyway.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { baseUrl } from './tools.mjs';
import { TOOL_TIMEOUT_MS, GENERATE_TIMEOUT_MS } from './driver.mjs';
import { createServer } from './server.mjs';

export { createServer };

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
