# FeedForge

**Type a topic. Get a publish-ready Qoneqt video.**

Built for **Qoneqt × CTRL FREAK 2026** by **Team Dravex — MIT ADT University**.

> 🚧 README skeleton. Sections marked _TODO_ are filled in as milestones land.

## Problem

_TODO (M2)_: Community feeds like Qoneqt's Global Feed need a steady stream of short vertical videos. Making them by hand is slow and the quality is uneven.

## Solution

_TODO (M2)_: FeedForge is an AI pipeline that turns a topic into a publish-ready video plan. A separate critic model checks every plan before it moves on.

## Architecture

![FeedForge architecture](docs/architecture.png)

```
Input → Script Engine (LLM) → Quality Gate (LLM critic) → Asset Engine → Composer (FFmpeg) → Publish Pack
        └──────────── Phase 1 ────────────┘               └──────────── Phase 2 ────────────┘
```

_TODO (M2)_: module breakdown (routes, pipeline/stages, providers, queue, store, schemas).

## Phase 1 vs Phase 2

| | Phase 1 (this build) | Phase 2 (roadmap) |
|---|---|---|
| Input | ✅ topic → job | batch mode |
| Script Engine | ✅ | |
| Quality Gate | ✅ | |
| Assets / Compose / Publish | — | stock/AI visuals, TTS, FFmpeg composer, publish pack |

## JSON contract

_TODO (M2)_

## Quality Gate rules

_TODO (M2)_

## Tech stack

- **Server:** Node.js, TypeScript, Express, Zod
- **Web:** React, Vite, TypeScript, Tailwind CSS
- **Tests:** Vitest
- **Deploy:** a single Docker service on Render

## Run locally

```bash
cp .env.example .env      # then fill in LLM_PROVIDER, LLM_MODEL and the matching API key
npm install
npm run dev:server        # API on http://localhost:8080
npm run dev:web           # dashboard on http://localhost:5173 (proxies /api)
npm test
```

## Deploy

_TODO (M4)_

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | yes | `anthropic` | `anthropic` \| `openai` \| `gemini` |
| `LLM_MODEL` | yes | — | Exact model id for the chosen provider |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | the one matching the provider | — | Provider API key |
| `PORT` | no | `8080` | HTTP port |
| `DATA_DIR` | no | `./data` | Job JSON storage directory |
| `RATE_LIMIT_MAX` | no | `10` | Max `POST /api/jobs` per window per IP |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate limit window |

## Known simplifications (Phase 1)

- An in-process job queue sits behind a `JobQueue` interface. BullMQ + Redis is planned.
- Jobs are stored as JSON files behind a `JobStore` interface. Postgres is planned, with Cloudflare R2 for media.

## Team

**Dravex — MIT ADT University**

## License

MIT
