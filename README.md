# AMightyClaw

A self-hosted AI assistant with webchat UI, multi-model support, persistent memory, and personality via Soul.MD.

## Quickstart

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run setup wizard
node packages/cli/dist/cli.js setup

# Start the server
node packages/cli/dist/cli.js start
```

Then open `http://127.0.0.1:3333` in your browser.

## Features

- **Multi-model support** — OpenAI, Anthropic, Google, Mistral, Ollama via Vercel AI SDK
- **Profile system** — Free/Regular/Premium tiers with per-profile API keys and daily token limits
- **Persistent memory** — SQLite-backed conversations, facts extracted from chat, hybrid FTS5 search
- **Soul.MD** — Customizable personality with hot-reload (edit `~/.amightyclaw/SOUL.md`)
- **Webchat UI** — React SPA with streaming responses, markdown rendering, conversation sidebar
- **Cron scheduler** — Schedule recurring messages with cron expressions
- **Security** — AES-256 encrypted API keys, bcrypt auth, JWT sessions, Helmet.js, rate limiting

## CLI Commands

```bash
amightyclaw setup          # Interactive setup wizard
amightyclaw start          # Start the server
amightyclaw status         # Show server status
amightyclaw cron add       # Add a scheduled task
amightyclaw cron list      # List scheduled tasks
amightyclaw cron remove    # Remove a scheduled task
```

## Configuration

All data is stored in `~/.amightyclaw/`:

```
~/.amightyclaw/
├── config.json    # Server config, profiles, encrypted API keys
├── SOUL.md        # AI personality (editable, hot-reloads)
├── data/
│   └── memory.db  # SQLite database
└── logs/
    └── app.log    # Structured JSON logs
```

## Docker

```bash
docker compose up -d
```

## Architecture

```
Browser ←→ Socket.IO ←→ Gateway ←→ MessageBus ←→ AgentLoop
                                                   ├── Soul.MD
                                                   ├── Memory (SQLite)
                                                   └── ProviderRegistry → LLM APIs
```

## Tech Stack

Node.js 22+, TypeScript, Express 5, Socket.IO, React 19, Vite 6, Tailwind 4, SQLite (better-sqlite3), Vercel AI SDK, pnpm workspaces.
