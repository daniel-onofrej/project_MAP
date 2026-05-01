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
- Docker Compose deployment with optional Nginx reverse proxy
