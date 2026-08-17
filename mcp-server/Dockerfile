# ── White Orchid MCP — remote container ──────────────────────────────────────
# Self-contained: mcp-server/ deploys ALONE (no repo-root node_modules). The
# Microsoft Playwright base image ships the matching Chromium build + all OS
# deps, so `npm ci` here installs only the npm packages (the playwright npm
# package downloads no browsers on install). Keep this tag in lockstep with
# the playwright version in package.json.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=pwuser:pwuser . .

# Run as the image's unprivileged browser user (Chromium refuses root without
# --no-sandbox, and we'd rather keep the sandbox). Profile + export dirs go to
# paths pwuser owns.
USER pwuser
ENV WO_MCP_PROFILE_DIR=/tmp/wo-profile \
    WO_MCP_OUT_DIR=/tmp/wo-out \
    PORT=8787

EXPOSE 8787
CMD ["node", "http.mjs"]
