# Architecture

## Overview

MAP is a self-hosted Next.js application backed by PostgreSQL and Redis, with a companion MCP server process. Everything runs via Docker Compose.

```
Browser
  └── Next.js (port 3000)
        ├── App Router pages (app/)
        ├── API routes (app/api/)
        ├── PostgreSQL 16 — persistent storage
        └── Redis 7 — real-time pub/sub + presence

MCP Server (port 3100, 127.0.0.1 only)
  └── PostgreSQL 16 — reads/writes agents directly
```

---

## Request flow

### Prompt → Graph

1. User pastes a prompt into the AI Generator dialog
2. Browser POSTs to `/api/generate`
3. API route calls the prompt-to-graph pipeline (v4, v6, or v7)
4. Pipeline sends structured prompts to Gemini Flash
5. LLM output is parsed into an `AgentConfig` (nodes + edges)
6. `AgentConfig` is saved to PostgreSQL and returned to the browser
7. React Flow renders the graph

### Graph → Prompt (Re-sync)

1. User opens the Re-sync dialog
2. Browser calls `graph-to-prompt` deterministically (no LLM)
3. Result is diffed against the original prompt
4. Similarity score + diff view shown in the dialog

### Real-time collaboration

1. User edits a node → browser PATCHes `/api/agents/:id`
2. Server writes to PostgreSQL, then publishes a Redis message
3. All other connected clients receive the update via SSE (`/api/agents/:id/stream`)
4. React Flow re-renders affected nodes

---

## Data model

The central type is `AgentConfig`:

```ts
AgentConfig {
  id: string
  name: string
  nodes: NodeData[]        // graph nodes
  connections: Connection[] // graph edges
  originalPrompt?: string
  editedPrompt?: string
  settings: AgentSettings  // model, provider, rules
  version?: string
}
```

Stored in the `agents` table in PostgreSQL. Version snapshots live in `agent_versions`.

---

## Prompt-to-graph pipeline versions

| Version | Approach | Used by |
|---|---|---|
| v1 | Single-pass Gemini generation | API routes, shared helpers |
| v4 | Ledger-based staged generation | Default UI pipeline |
| v6 | Enhanced with annotation support | UI (v6 mode) |
| v7 | Latest — improved structure + multi-agent | UI (v7 mode) |

Each version lives in `lib/prompt-to-graph/v{n}/` and exports a single async function.

---

## MCP server

A separate Node.js process (`mcp-server/`) that exposes MAP agents as MCP tools. It connects directly to PostgreSQL — it does not proxy through the Next.js app.

Bound to `127.0.0.1:3100` — not internet-accessible without a reverse proxy.

Authentication: Bearer token checked on every request, stored hashed in the `mcp_tokens` table.

---

## Auth

Session-based (not JWT). On login:
1. Server verifies `bcrypt` password hash from `users` table
2. Creates a row in `sessions` with `sha256(raw_token)`
3. Raw token is set as an `HttpOnly` cookie
4. Every request reads the cookie, looks up the session, checks expiry

Sessions expire after 7 days. Admins can revoke any session instantly by deleting the row.

---

## Key directories

| Path | Purpose |
|---|---|
| `app/api/` | Next.js API routes |
| `lib/ai/` | LLM client + graph edit/chat agents |
| `lib/graph/` | Layout algorithms, graph→prompt |
| `lib/prompt-to-graph/` | Text→graph pipeline versions |
| `lib/storage/` | localStorage persistence + version control |
| `mcp-server/src/` | MCP server entry + tool handlers |
| `db/init.sql` | PostgreSQL schema + seed |
