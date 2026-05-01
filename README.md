# MAP — Model Attention Path

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.1.0-green.svg)](package.json)
[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

**MAP is a self-hosted visual editor for designing, versioning, and sharing AI agent workflows.**

You describe what an agent should do in plain text — MAP turns it into a structured graph of nodes and edges. You can then edit that graph visually, collaborate with your team in real time, track every change in version history, and push finished prompts directly to AI coding tools like Claude Code, Cursor, or Codex via a built-in MCP server.

![MAP full editor interface](docs/full-editor.png)

---

## Why MAP?

- **Self-hosted** — your prompts and agent data never leave your infrastructure
- **MCP-native** — Claude Code, Cursor, and Windsurf can pull prompts directly from MAP at runtime
- **Bidirectional** — edit visually or in text; MAP keeps both in sync with a diff score

---

## What it does

### Prompt → Graph
Paste any agent description in natural language. MAP sends it through a multi-stage AI pipeline and returns a structured graph: decision branches, tool calls, personas, loops, conditions, and more — all as editable visual nodes.

![AI generator dialog](docs/ai-dialog.png)

### Graph → Prompt
The conversion is fully bidirectional. Edit nodes and edges visually, then regenerate the prompt from the graph at any time. A similarity score shows how closely the graph still matches the original description.

### Visual graph editor
Built on React Flow. Drag nodes, draw edges, rename, recolor, and restructure your agent workflow without touching text. Supports 16 node types: `start`, `end`, `decision`, `action`, `tool_call`, `rule`, `step`, `condition`, `loop`, `persona`, `memory`, `escalation`, `error`, and more.

![Graph editor showing a multi-node agent workflow](docs/graph-editor.png)

![Node detail and prompt panel](docs/node-detail.png)

### Multi-agent workflows
Design agent orchestration systems visually. The wizard detects when a prompt describes multiple agents, splits it automatically, and generates a separate graph per agent — with conflict detection and cross-agent edge validation.

### Git-style version control
Every node edit auto-commits a snapshot. Versions branch like git: edits on `v1` create `v1.1`, `v1.2`; restoring `v1` and editing creates a new branch `v2`. A visual branch tree shows the full lineage. Roll back to any snapshot in one click.

![Prompt Re-sync diff view showing 87% match with added and removed lines](docs/resync.png)

### Real-time collaboration
Multiple users can edit the same graph simultaneously. Presence indicators show who is where. Node locking prevents edit conflicts. Inline comments thread per-node.

### MCP server
A built-in [Model Context Protocol](https://modelcontextprotocol.io) server exposes your saved prompts to external AI tools. Claude Code, Cursor, Codex, Windsurf, and Claude Desktop can call `list_prompts` and `pull_prompt` to fetch your agent prompts directly. Every pull is logged in the Agent Hub.

![Agent Hub showing prompt pull history](docs/agent-hub.png)

### Pattern library & templates
Browse a library of pre-built agent patterns (customer support, RAG pipeline, classifier, etc.) and use them as starting points. Generate custom patterns from a prompt using the pattern generator.

### Simulation Studio
Step through an agent graph node by node with a live simulation panel. Inspect what each node would produce at runtime before deploying.

### Chat editing
Open the chat panel inside the editor and describe changes conversationally: "add a safety check before the output node" or "turn this into a loop". The LLM applies the edit to the graph.

### Multi-user access control
| Role | Permissions |
|---|---|
| Admin | Full access — manage users, groups, all graphs |
| Editor | Create and edit graphs, invite to groups |
| Viewer | Read-only — view graphs and comments |

No self-registration. Admins create accounts for team members at `/admin/users`.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19 + Tailwind CSS 4 + shadcn/ui |
| Graph | React Flow (@xyflow/react) |
| AI | Google Gemini (`@google/genai`) |
| Database | PostgreSQL 16 + Drizzle ORM |
| Real-time | Redis 7 + Server-Sent Events |
| MCP | Custom HTTP MCP server (port 3100) |
| Proxy | Nginx |
| Runtime | Docker + Docker Compose |

---

## Quick start

**Requirements:** Docker and Docker Compose.

```bash
git clone https://github.com/your-username/MAP.git
cd MAP
cp .env.example .env
```

Open `.env` and add at least one AI API key:

```env
GEMINI_API_KEY=your_key_here
```

Start everything:

```bash
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the default admin account:

| Field | Default |
|---|---|
| Email | `admin@map.local` |
| Password | `admin123` |

> Change the default password immediately after first login via **Admin → Users**.

---

## What gets started

`docker compose up` starts four services:

| Service | Description |
|---|---|
| `postgres` | PostgreSQL 16 — main database |
| `redis` | Redis 7 — real-time pub/sub and presence |
| `nextjs` | The Next.js web app (port 3000) |
| `mcp-server` | MCP server for external AI tool integrations (port 3100) |

No manual database setup or migration steps needed.

To add Nginx as a reverse proxy (port 80/443):
```bash
docker compose --profile nginx up -d
```

---

## Environment variables

Copy `.env.example` to `.env`. All values have safe defaults for local use.

```env
# At least one AI key required for graph generation
GEMINI_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GROQ_API_KEY=

# Default admin account (created on first boot)
ADMIN_EMAIL=admin@map.local
ADMIN_PASSWORD=admin123

# Change these in production
DB_PASSWORD=maplocal
SESSION_SECRET=changeme_32byte_dev_secret_here!
MCP_AUTH_TOKEN=dev_mcp_token_change_in_prod
APP_URL=http://localhost:3000
```

Generate secure secrets:
```bash
openssl rand -hex 32
```

---

## AI models

MAP uses **Gemini Flash** by default. You can switch the model per-agent in the editor settings panel. Supported providers:

- Google Gemini (default)
- OpenAI
- Anthropic
- Groq
- Any OpenAI-compatible endpoint (Ollama, LM Studio, vLLM)

> **Note:** Only Google Gemini has been fully tested. Other providers and models are available in the settings but are not guaranteed to work correctly at this time. Use them at your own discretion.

---

## Project structure

A full map of the repository lives in [docs/project-structure.md](docs/project-structure.md).

---

## Development

Run Postgres and Redis in Docker, everything else locally:

```bash
# Start only the backing services
docker compose up -d postgres redis

# Install dependencies and run migrations
npm install
npm run db:migrate

# Start the dev server
npm run dev
```

App available at [http://localhost:3000](http://localhost:3000).

---

## MCP server — connecting external AI tools

The MCP server starts automatically on port `3100` (bound to `127.0.0.1` only — not internet-accessible).

### Authentication

Each external tool authenticates with an **API token** scoped to specific group workspaces:

1. Open the app → sidebar → **MCP Server** → **API Tokens** → **+ New Token**
2. Name it, select which groups it can access, click **Generate**
3. Copy the token — shown only once

![Assigning prompt access to a token](docs/prompt-assiging.png)

![Prompt usage statistics](docs/prompt-usage.png)

### Claude Code

```bash
claude mcp add MAP --transport http http://localhost:3100/mcp \
  --header "Authorization: Bearer YOUR_TOKEN"
```

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "MAP": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3100/mcp"]
    }
  }
}
```

### Cursor

Open Cursor Settings → **MCP Servers** → **Add new server**:

```json
{
  "mcpServers": {
    "MAP": {
      "url": "http://localhost:3100/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "MAP": { "serverUrl": "http://localhost:3100/mcp" }
  }
}
```

### Available MCP tools

| Tool | Description |
|---|---|
| `list_prompts` | Lists all prompts with name, description, and pull count |
| `pull_prompt` | Fetches full prompt content by ID — logged in Agent Hub |

![MCP list_prompts response in an AI tool](docs/list_of_prompts_MCP.png)

---

## Releases

Releases are automated via [Release Please](https://github.com/googleapis/release-please). Every push to `main` that contains a conventional commit will open or update a release PR. Merging that PR tags the release, publishes a GitHub Release, and updates `CHANGELOG.md`.

Commit message format:

| Prefix | Result |
|---|---|
| `feat: ...` | New minor version |
| `fix: ...` | New patch version |
| `feat!: ...` or `BREAKING CHANGE:` | New major version |
| `chore:`, `docs:`, `refactor:` | No release |

---

## License

MIT — see [LICENSE](LICENSE).
