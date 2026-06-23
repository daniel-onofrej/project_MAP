# Changelog

All notable changes to MAP will be documented in this file.

This file is automatically updated by [Release Please](https://github.com/googleapis/release-please) on every release. Do not edit it manually.

Commit messages follow the [Conventional Commits](https://www.conventionalcommits.org) spec:

| Prefix | Effect |
|---|---|
| `feat:` | New feature → bumps **minor** version |
| `fix:` | Bug fix → bumps **patch** version |
| `feat!:` / `fix!:` / `BREAKING CHANGE:` | Breaking change → bumps **major** version |
| `chore:`, `docs:`, `refactor:`, `style:` | No version bump |

## [Unreleased]

### Added
- Native OpenShell deployment platform for turning saved graph prompts into persistent sandbox runtimes.
- Sandboxes UI with deployment setup, preflight checks, status, chat, logs, runtime metadata, provider status, and start/stop/restart/delete controls.
- Agent Hub runtime controls that show deployed runtime counts, running sandboxes, pinned prompts, logs, chat output, and OpenShell CLI access.
- Runtime catalog for Codex CLI, Claude Code, OpenCode, Gemini CLI, and custom commands.
- Provider catalog and setup flow for OpenAI-compatible APIs, Anthropic, Azure OpenAI, Azure AI Foundry, Google AI Studio, Google Vertex AI, NVIDIA API Catalog, local endpoints, and custom APIs.
- RuntimeManifest v2 support with gateways, execution modes, provider modes, generated/custom policies, resource limits, labels, privacy routing, and security notes.
- Runtime packages for environment variables, secret mappings, tools, startup scripts, extra files, declared ports, external connections, and graph-derived asset requirements.
- Deployment worker service for OpenShell provisioning, provider attachment, runtime chat, policy updates, logs, lifecycle actions, reconciliation, setup checks, and bounded OpenShell CLI commands.
- MCP deployment tools for creating, inspecting, chatting with, reconciling, and managing OpenShell deployments from external MCP clients.
- Database schema and migrations for runtime gateways, deployments, deployment messages, providers, events, runtime packages, runtime manifests, and graph runtime assets.
- Tests for deployment validation, setup/preflight behavior, runtime package normalization, graph-derived runtime assets, and version consistency.

### Changed
- Docker Compose now starts the full local runtime stack: Postgres, Redis, Next.js, MCP server, OpenShell bootstrap, OpenShell gateway, and deployment worker.
- README and wiki content now document OpenShell runtimes, provider setup, deployment workflows, environment variables, and runtime package structure.
- Release automation now supports manual Release Please dispatch, package-version verification, synced package versions across services, and bootstrap/CI workflows.
- Agents, versions, prompt cards, tree views, and storage now carry runtime package metadata where needed.
- Terminal/log output is normalized to strip ANSI/control sequences and format OpenShell timestamps before showing or storing runtime output.
- `.gitignore` and Docker ignore rules cover local secrets, generated build output, OpenShell cache files, logs, certificates, local DB volumes, and dependency folders.

### Fixed
- Codex runtime commands now use a supported `codex exec` prompt format.
- Gemini CLI runtime commands include response rules that suppress planning/debug chatter in user-facing chat output.
- Deployment access checks now respect user role, ownership, group membership, and shared-agent permissions.
- Runtime and provider input validation now normalizes identifiers, environment keys, paths, package entries, resource limits, and one-time credential inputs.

### Security
- Provider credentials can be supplied through worker environment variables or one-time provider credential values instead of being stored in runtime packages.
- Runtime-scoped MAP MCP tokens are created for sandbox MCP access and stored only as hashes/prefixes.
- Legacy secret environment pass-through and raw OpenShell CLI access are feature-gated by environment flags.
- OpenShell runtime operations can be disabled with `OPENSHELL_RUNTIME_ENABLED=false` without taking the rest of the app offline.

## [0.1.0] — Initial release

### Added
- Prompt-to-Graph: generate structured agent graphs from natural language (V4, V6, V7 pipelines)
- Graph-to-Prompt: bidirectional conversion with similarity scoring
- Visual graph editor with 16 node types built on React Flow
- Multi-agent workflow design with automatic agent detection and conflict detection
- Git-style version control with visual branch tree and one-click rollback
- Real-time collaboration: live presence, node locking, inline comments via Redis pub/sub
- Multi-user auth: Admin / Editor / Viewer roles with workspace group isolation
- Chat editing: conversational graph editing through an LLM-powered chat panel
- Pattern library: pre-built agent patterns with a prompt-based pattern generator
- Simulation Studio: step-through node-by-node execution preview
- MCP Server: expose agent prompts to Claude Code, Cursor, Codex, Windsurf, and Claude Desktop
- Native OpenShell runtime platform: deploy pinned graph prompts into persistent sandbox runtimes
- Agent Hub and Sandboxes runtime controls: status, logs, chat, OpenShell CLI access, start, kill, restart, and delete
- Runtime packaging: ship tools, scripts, files, environment variables, declared ports, connections, and security notes with each sandbox
- Docker Compose deployment with optional Nginx reverse proxy
- CI/CD release automation: version consistency checks, Release Please patch-line releases, and one-time v0.1.0 bootstrap release workflow
