# Project Structure

A guide to what lives where in this repository.

```
Project_graph/
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout (fonts, theme, toaster)
│   ├── globals.css               # Global CSS + Tailwind base
│   ├── page.tsx                  # Root redirect → /introduction
│   ├── app/
│   │   └── page.tsx              # Main graph editor page (primary UI)
│   └── introduction/
│       └── page.tsx              # Landing / onboarding page
│
├── components/                   # React components
│   ├── graph/                    # Graph canvas and node components
│   │   ├── agent-canvas.tsx      # React Flow canvas, drag/drop, edge wiring
│   │   ├── agent-node.tsx        # Individual graph node renderer
│   │   ├── agent-tree.tsx        # Sidebar tree view of the agent graph
│   │   ├── agent-tab-bar.tsx     # Tab switcher for multiple open agents
│   │   ├── compilation-status.tsx# Shows graph validation status indicator
│   │   └── version-branch-tree.tsx # Visual branch/version tree
│   │
│   ├── dialogs/                  # Modal dialogs
│   │   ├── ai-generator-dialog.tsx    # Prompt → graph generation UI
│   │   ├── ai-conflict-dialog.tsx     # AI conflict analysis results
│   │   ├── resync-dialog.tsx          # Bidirectional graph ↔ prompt sync
│   │   ├── settings-dialog.tsx        # App settings (API keys, models, rules)
│   │   ├── simulation-studio-dialog.tsx # Run and replay agent simulations
│   │   ├── version-control-dialog.tsx # Branch, diff, restore versions
│   │   ├── templates-dialog.tsx       # Browse and apply agent templates
│   │   ├── pattern-browser-dialog.tsx # Browse reusable graph patterns
│   │   ├── multi-agent-wizard.tsx     # Multi-agent orchestration setup
│   │   ├── agent-hub-dialog.tsx       # Manage agent hub connections
│   │   ├── export-json-dialog.tsx     # Export graph as JSON
│   │   ├── json-parser-dialog.tsx     # Import graph from JSON
│   │   ├── keyboard-shortcuts-dialog.tsx # Keyboard shortcut reference
│   │   └── simulation-studio-dialog.tsx  # Simulation playback and replay
│   │
│   ├── panels/                   # Sidebar and side panels
│   │   ├── properties-panel.tsx  # Node property editor (right sidebar)
│   │   ├── graph-chat-panel.tsx  # Chat interface for graph editing via LLM
│   │   ├── comments-panel.tsx    # Inline comments on graph nodes
│   │   ├── complexity-metrics-panel.tsx # Graph complexity analysis view
│   │   └── mcp-control-panel.tsx # MCP server start/stop controls
│   │
│   ├── toolbar.tsx               # Top toolbar (actions, modes, tools)
│   ├── intro-sidebar-nav.tsx     # Navigation for the introduction page
│   ├── theme-provider.tsx        # Dark/light mode provider (next-themes)
│   └── ui/                       # Shadcn/Radix UI primitives (auto-generated)
│
├── lib/                          # Business logic and utilities
│   ├── types.ts                  # Shared TypeScript types (AgentConfig, NodeData, etc.)
│   ├── utils.ts                  # General utility functions (cn, etc.)
│   ├── validation.ts             # Zod schemas for graph and agent validation
│   ├── templates.ts              # Built-in agent templates (DEMO_AGENT, etc.)
│   ├── patterns.ts               # Reusable graph pattern definitions
│   ├── text-to-graph.ts          # Plain text ↔ agent config serialization
│   ├── dag-prompt-rules.ts       # DAG rules injected into LLM prompts
│   ├── complexity-metrics.ts     # Graph complexity scoring algorithms
│   ├── capability-analyzer.ts    # Detects risk/capability from node types
│   ├── agent-runner.ts           # Executes an agent graph step-by-step
│   ├── simulation-runner.ts      # Runs full agent simulations with replay
│   ├── diff-utils.ts             # Line-diff utilities for graph ↔ prompt compare
│   ├── collaboration.ts          # Comment and annotation helpers
│   ├── undo-redo.ts              # Undo/redo history stack
│   ├── hub-mock.ts               # Mock data for agent hub (dev only)
│   ├── example-agents.ts         # Hardcoded example agent configs
│   │
│   ├── ai/                       # LLM integration layer
│   │   ├── llm-client.ts         # Unified Gemini API client wrapper
│   │   ├── graph-edit-agent.ts   # LLM-powered graph edit from chat instructions
│   │   ├── graph-edit-agent-experimental.ts # Experimental edit strategies
│   │   ├── graph-chat-agent.ts   # Conversational agent for graph Q&A
│   │   └── ai-conflict-analyzer.ts # Structural conflict + risk analysis via LLM
│   │
│   ├── graph/                    # Graph layout and transformation
│   │   ├── auto-layout.ts        # Dagre-based automatic node layout
│   │   ├── force-directed-layout.ts # Force-directed layout algorithm
│   │   ├── graph-to-prompt.ts    # Deterministic graph → structured prompt
│   │   └── collapse-options.ts   # Logic for collapsing/expanding option nodes
│   │
│   ├── storage/                  # Persistence layer
│   │   ├── storage.ts            # localStorage read/write for agents + settings
│   │   └── version-control.ts    # Agent version branching and diffing
│   │
│   └── prompt-to-graph/          # Text → graph algorithm (multiple versions)
│       ├── v1/                   # V1: full Gemini generation pipeline (used by API)
│       │   ├── prompt-to-graph.ts        # Main entry point
│       │   ├── prompt-to-graph-shared.ts # Shared parsing utilities
│       │   ├── multi-agent-context.ts    # Context injection for multi-agent
│       │   ├── cross-agent-validation.ts # Validates cross-agent references
│       │   └── role-matching.ts          # Fuzzy role matching between agents
│       ├── v4/                   # V4: ledger-based staged generation
│       │   ├── index.ts          # Public API exports
│       │   ├── generate.ts       # Main generation pipeline
│       │   ├── prompt.ts         # System and repair prompts
│       │   ├── parse.ts          # Ledger parsing from LLM output
│       │   ├── reconstruct.ts    # Ledger → AgentConfig reconstruction
│       │   ├── multi-agent.ts    # Multi-agent orchestration for V4
│       │   ├── types.ts          # V4-specific types (Ledger, PlanNode, etc.)
│       │   └── utils.ts          # Position mapping utilities
│       ├── v6/                   # V6: enhanced generation with annotations
│       └── v7/                   # V7: latest pipeline with improved structure
│
├── hooks/                        # Custom React hooks
│   ├── use-mobile.ts             # Detects mobile viewport
│   └── use-toast.ts              # Toast notification hook
│
├── mcp-server/                   # Standalone MCP server (Claude Desktop integration)
│   ├── src/
│   │   ├── index.ts              # Entry point
│   │   ├── server.ts             # MCP server setup and routing
│   │   ├── management-api.ts     # REST API for agent CRUD
│   │   ├── storage.ts            # Server-side agent state persistence
│   │   ├── logger.ts             # Structured logging
│   │   ├── types.ts              # Server type definitions
│   │   └── tools/                # MCP tool handlers (one per tool)
│   ├── package.json              # Separate dependencies from main app
│   └── .env.example              # Required env vars for the MCP server
│
├── public/                       # Static assets served at /
│   └── icon.svg, *.png           # App icons and placeholders
│
├── styles/                       # Additional global styles
│   └── globals.css               # Tailwind directives (supplemental)
│
├── docs/                         # Project documentation and screenshots
│   ├── project-structure.md      # This file
│   ├── architecture.md           # System architecture deep-dive
│   ├── full-editor.png           # Hero screenshot
│   ├── graph-editor.png          # Graph canvas screenshot
│   ├── node-detail.png           # Node detail panel screenshot
│   ├── resync.png                # Re-sync diff view screenshot
│   ├── ai-dialog.png             # AI generator dialog screenshot
│   ├── agent-hub.png             # Agent hub screenshot
│   ├── list_of_prompts_MCP.png   # MCP list_prompts screenshot
│   ├── prompt-assiging.png       # Token prompt assignment screenshot
│   └── prompt-usage.png          # Prompt usage stats screenshot
│
├── .github/                      # GitHub configuration
│   ├── workflows/
│   │   └── release-please.yml    # Automated changelog + GitHub releases
│   ├── ISSUE_TEMPLATE/           # Bug report and feature request templates
│   └── PULL_REQUEST_TEMPLATE.md  # PR checklist template
│
├── .env.example                  # Required environment variables (committed)
├── .eslintrc.json                # ESLint config
├── .prettierrc                   # Prettier formatting config
├── .gitignore
├── next.config.mjs               # Next.js config (ignoreBuildErrors enabled)
├── postcss.config.mjs            # PostCSS + Tailwind 4 config
├── tsconfig.json                 # TypeScript config (strict, @/* path alias)
├── vitest.config.ts              # Vitest test runner config
├── package.json                  # Dependencies and npm scripts
├── CHANGELOG.md                  # Version history
├── CONTRIBUTING.md               # Contribution guide
├── LICENSE                       # MIT License
└── README.md                     # Project overview and getting started
```

## Key Concepts

**AgentConfig** — the central data model. Represents one agent as a graph: a list of nodes (`NodeData[]`) and edges (`Connection[]`), plus metadata like name, description, and version.

**Prompt-to-Graph (P2G)** — the core feature. Takes a natural language prompt and calls Gemini to produce a structured `AgentConfig`. Two implementations: V1 (mature, full-featured) and V4 (ledger-based, more structured output).

**Graph-to-Prompt (G2P)** — the reverse: converts an `AgentConfig` back to a structured prompt deterministically (no LLM). Used for the Re-sync feature to compare what the graph says vs what the original prompt said.

**MCP Server** — a separate Node.js process that exposes the app's agent CRUD as MCP tools, allowing Claude Desktop to read and write agents directly.
