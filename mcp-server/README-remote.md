# White Orchid MCP — remote deployment (owner runbook)

This makes the studio's MCP tools reachable from **claude.ai** (and any other
MCP client) **without your laptop running**: the same server as the local stdio
setup (`server.mjs` behind `http.mjs`), on a small always-on host, pointed at
the **production** studio deployment on Vercel.

```
claude.ai / Claude Code ──HTTPS──▶  Fly.io VM (this container)
                                    └─ headless Chromium drives ──▶ production studio (Vercel)
```

## Read this first — money and access

- **Anyone holding the URL + token can generate posts and spend the production
  environment's AI credits.** Treat the URL+token pair exactly like a
  password. Share it only with people you'd hand your studio login.
- **Rotate by changing the secret** (`fly secrets set WO_MCP_AUTH_TOKEN=<new>`
  — the machine restarts with the new token and every old link dies).
- **Every remote generation spends the production environment's credits**
  (assistant plan + photo generation when configured), exactly like working in
  the studio by hand. That is the point — but it is real money.
- **All users share the one brand workspace.** Sessions created by any
  connected user land in the same shared Posts, refine each other's sessions,
  and see each other's work. That IS the product model (one brand, many
  hands) — not a bug, but say it out loud to the team.
- **The base URL must be the Vercel deployment**, never your laptop —
  otherwise "works when my computer is down" is broken by construction.
- Guardrails built in: per-IP + global rate limits, max 2 concurrent browser
  drives (others queue briefly, then get an honest "busy — try again" error),
  request size caps, no unauthenticated mode at all.

## Cost

Fly.io `shared-cpu-1x` with **2GB RAM**, one machine always on: **≈ $10/mo**
(1GB is ≈ $5/mo but headless Chromium driving the studio can OOM there; 2GB is
the honest recommendation). Auto-stop is deliberately **off** — generations
run 30–120s and users should not pay a cold-start toll.

## Deploy to Fly.io (primary recommendation)

You (the owner) do these — account creation and payment cannot be delegated.

1. **Create a Fly.io account** at https://fly.io and install the CLI:
   ```bash
   brew install flyctl
   fly auth login
   ```
2. **From `mcp-server/` in this repo** (the `fly.toml` here is ready; the app
   name must be globally unique — change `app = "white-orchid-mcp"` if taken):
   ```bash
   cd mcp-server
   fly launch --no-deploy --copy-config --name white-orchid-mcp
   ```
   Answer "no" to Postgres/Redis/anything extra.
3. **Set the secrets** (never commit these anywhere):
   ```bash
   # generate a strong token — save it in your password manager:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

   fly secrets set \
     WO_MCP_AUTH_TOKEN=<the token you just generated> \
     WO_MCP_BASE_URL=<PRODUCTION-STUDIO-URL>
   ```
   `WO_MCP_BASE_URL` is the production studio on Vercel — likely
   `https://white-orchid-generator.vercel.app`
   <!-- PLACEHOLDER — verify in the Vercel dashboard (project
        white-orchid-generator → Domains) and use the canonical production
        domain. The repo pins no production URL; staging is
        white-orchid-generator-git-staging-shizudios-projects.vercel.app.
        NOTE: if production sits behind Vercel SSO/protection, the headless
        driver cannot log in — use the public production domain. -->
4. **Deploy and verify:**
   ```bash
   fly deploy
   curl https://white-orchid-mcp.fly.dev/healthz          # → ok
   curl -s https://white-orchid-mcp.fly.dev/mcp           # → {"error":"unauthorized"} (good — fail-closed)
   ```
5. Later operations:
   ```bash
   fly logs                # live logs (token is never printed)
   fly secrets set WO_MCP_AUTH_TOKEN=<new>   # rotate the token
   fly apps destroy white-orchid-mcp         # tear the whole thing down
   ```

## Connect claude.ai

Settings → **Connectors** → **Add custom connector**, then paste as the URL:

```
https://white-orchid-mcp.fly.dev/mcp?key=<your token>
```

That is the mechanism that works with every claude.ai plan today: the token
rides inside the URL (the connector UI's own auth fields are OAuth-oriented;
static bearer headers are still beta). Two equivalent URL forms are accepted —
`/mcp?key=<token>` and `/t/<token>/mcp` — pick either. Clients that can send
headers (Claude Code, API callers, curl) may instead use
`Authorization: Bearer <token>` against plain `/mcp`.

Claude Code hookup:

```bash
claude mcp add --transport http white-orchid-studio \
  https://white-orchid-mcp.fly.dev/mcp \
  --header "Authorization: Bearer <your token>"
```

Then in any conversation: "use white-orchid-studio to generate a post
thanking our volunteers" → `wo_generate_post` runs on the VM against
production, and the post appears in everyone's shared Posts.

## Railway (alternative)

Railway also works (always-on container, ~$5-10/mo on usage pricing):

1. https://railway.app → New Project → **Deploy from GitHub repo**, set the
   **root directory** to `mcp-server/` (it builds the Dockerfile there).
2. Variables: `WO_MCP_AUTH_TOKEN`, `WO_MCP_BASE_URL` (same values as above).
   Railway injects `PORT` automatically; the server honors it.
3. Settings → Networking → **Generate domain**, then use
   `https://<generated>.up.railway.app/mcp?key=<token>` in claude.ai.
4. Disable any "serverless"/sleep option — the server must stay warm.

## Environment variables (remote)

| Var | Required | Meaning |
|---|---|---|
| `WO_MCP_AUTH_TOKEN` | **yes — refuses to boot without it** | Shared secret (≥16 chars; generate 32 random bytes). Accepted as `Authorization: Bearer`, `?key=`, or `/t/<token>/` path. |
| `WO_MCP_BASE_URL` | yes | The **production** studio origin the headless browser drives. |
| `PORT` | no (8787) | Listen port; Fly/Railway set it. |
| `WO_MCP_TIMEOUT_MS` / `WO_MCP_GENERATE_TIMEOUT_MS` | no | Same per-call budgets as the stdio server (120s / 180s defaults). |

The local stdio setup (`index.mjs` + Claude Desktop config) is unchanged and
keeps working exactly as before — see `README.md`.
