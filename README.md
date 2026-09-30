# FeedForge

**Type a topic. Get a publish-ready Qoneqt video.**

Built for **Qoneqt × CTRL FREAK 2026** by **Team Dravex — MIT ADT University**.

> 🚧 README skeleton. Sections marked _TODO_ are filled in as milestones land.

## Problem

Community feeds like Qoneqt's Global Feed need a steady stream of short vertical videos. Making them by hand is slow and the quality is uneven. Generating them with AI and no checks is fast, but it produces generic hooks, bloated pacing and occasional unsafe claims.

## Solution

FeedForge turns a topic into a **publish-ready video plan** and **refuses to ship weak or unsafe content**:

1. **Script Engine.** The LLM drafts 3 hook options, picks the strongest, and writes a scene-by-scene plan for a 25–45s vertical video. It includes voiceover, on-screen text, stock-footage queries, a title, a description and hashtags.
2. **Quality Gate.** A *separate* LLM call acts as a strict critic and scores the plan on hook, clarity, pacing and safety. The pass/fail rules are **enforced in code**. A failing plan is rewritten using the critic's feedback, up to 2 times. An unsafe plan is rejected outright.
3. Every attempt is stored: the plan, scores, feedback and timestamps. The Quality Gate is fully auditable.

## Architecture

![FeedForge architecture](docs/architecture.png)

```
Input → Script Engine (LLM) → Quality Gate (LLM critic) → Asset Engine → Composer (FFmpeg) → Publish Pack
        └──────────── Phase 1 ────────────┘               └──────────── Phase 2 ────────────┘
```

```
POST /api/jobs ─► Pipeline.submit ─► JobStore.create ─► JobQueue.enqueue({stage:'script'})
                                                                 │
          ┌──────────────────────────────────────────────────────┘
          ▼
   [script] ──► [quality_gate] ──pass──────────► passed   (Phase 2: ─► assets ─► compose ─► publish)
       ▲              │ ├─safety < 8──────────► rejected
       │              │ └─attempts exhausted──► failed
       └── rewrite ◄──┘   (critic feedback fed back, max 2 rewrites)

   Every state change ─► JobStore (JSON file) + JobEvents ─► SSE /api/jobs/:id/events
```

| Module | Responsibility |
|---|---|
| `server/src/routes` | HTTP API: health, jobs, SSE. Zod-validated bodies, `{ error: { code, message } }` errors, rate limit |
| `server/src/pipeline/runner.ts` | Orchestrates stages, records attempts and timings, applies gate decisions |
| `server/src/pipeline/stages` | `scriptEngine.ts`, `qualityGate.ts`: one LLM stage each |
| `server/src/pipeline/gate.ts` | Pure Quality Gate rules (overall, pass, decide) |
| `server/src/pipeline/llmJson.ts` | JSON extraction + Zod validation + one repair re-ask with the exact Zod errors |
| `server/src/providers` | `LLMProvider` interface. Gemini is implemented; Anthropic/OpenAI are stubs |
| `server/src/queue` | `JobQueue` interface + in-process implementation (per-stage retry, exponential backoff) |
| `server/src/store` | `JobStore` interface + JSON-file implementation (atomic writes) |
| `server/src/schemas` | Zod schemas and types for plan, review, job |

Each stage is a separate queue task that returns the next task. Phase 2 stages (`assets`, `compose`, `publish`) chain on after `passed` without changing the Phase 1 flow. `JobQueue` maps 1:1 onto BullMQ (retry policy → `attempts` + exponential `backoff`).

## Dashboard

A single page (React + Tailwind) that streams every stage live over Server-Sent Events:

- **Topic input**, with 3 example chips that start a job in one click.
- **Pipeline stepper:** Input → Script → Quality Gate run live, including the rewrite loop ("Rewrite · 2/3"). Assets, Compose and Publish are shown greyed out as Phase 2. A live line narrates the current step with an elapsed timer and shows provider retries.
- **Job list** with live status badges. The selected job is patched from its SSE stream, and the list polls only while a job is in flight.
- **Quality Gate panel:**
  - Every attempt appears as a card with hook/clarity/pacing/safety score bars (the safety bar has a threshold tick at 8), the overall score, and the critic's feedback.
  - Each card has a verdict **in words**: PASSED / FAILED: overall below 7 / REJECTED: safety below 8. Rewrites are labeled "Rewritten from attempt N".
  - A verdict box checks both rules, and shows rewrites used and the overall-score trend (e.g. `6.25 → 7 → 8.5`).
- **Plan:** a large hook with the 3 drafted options (the chosen one is marked), a scene table, title, description and hashtags. A plan that never passed the gate is clearly labeled as a draft.
- **Stage timings:** per-stage totals, end-to-end time, and every run including retries and errors.
- **Download JSON** exports the full job.
- **States:** loading, empty and error states are handled. The layout is responsive down to 390px, and the selected job is kept in the URL (`#/jobs/<id>`).

## Phase 1 vs Phase 2

| | Phase 1 (this build) | Phase 2 (roadmap) |
|---|---|---|
| Input | ✅ topic → job | batch mode |
| Script Engine | ✅ | |
| Quality Gate | ✅ | |
| Assets / Compose / Publish | — | stock/AI visuals, TTS, FFmpeg composer, publish pack |

## JSON contract

Script Engine output (validated with Zod in `server/src/schemas/plan.ts`):

```jsonc
{
  "topic": "string",
  "hookOptions": ["string", "string", "string"],   // exactly 3
  "hook": "string",                                // ≤ 12 words, must be one of hookOptions
  "title": "string",
  "description": "string",
  "hashtags": ["#string"],                         // 3–6, each starts with #
  "scenes": [{
    "id": 1,                                       // renumbered 1..n in code
    "durationSec": 5,                              // 2–8
    "visualQuery": "string",                       // stock-footage search query
    "onScreenText": "string",                      // ≤ 8 words
    "voiceover": "string"
  }],
  "totalDurationSec": 32                           // recomputed in code as Σ scene durations, must be 25–45
}
```

Quality Gate output (the critic returns `scores` + `feedback`; `overall` and `pass` are computed in code):

```json
{ "scores": { "hook": 8, "clarity": 8, "pacing": 7, "safety": 10 }, "overall": 8.25, "pass": true, "feedback": "..." }
```

If the output is invalid JSON or fails the schema, the model is re-asked **once** with the exact Zod errors. If it is still invalid, the job fails with `LLM_OUTPUT_INVALID`.

Full real job outputs: [`examples/`](examples/).

### API

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/jobs` | `{ "topic": "3–200 chars" }` → `202 { "jobId" }`. Rate-limited per IP |
| `GET` | `/api/jobs` | Job summaries, newest first |
| `GET` | `/api/jobs/:id` | Full job: input, status, current stage, all attempts, final plan, stage timings, error |
| `GET` | `/api/jobs/:id/events` | SSE: `event: job` (full job) on every update, `event: end` on a terminal status |
| `GET` | `/api/health` | Liveness + configured provider/model |

All errors use `{ "error": { "code": "...", "message": "..." } }`.

## Quality Gate rules

These are enforced in code (`server/src/pipeline/gate.ts`), not just in the prompt:

- `overall` = the average of the four scores, computed in code. The model's own numbers are ignored.
- **Pass** only if `overall ≥ 7` **and** `safety ≥ 8`.
- **Fail (quality)** → the plan is rewritten by the Script Engine with the critic's feedback. There are at most **2 rewrites (3 attempts total)**. If all 3 fail, the status is `failed` (`QUALITY_GATE_EXHAUSTED`).
- **Fail (safety < 8)** → the job is immediately `rejected` (`SAFETY_REJECTED`). It is never rewritten and never proceeds. A provider-side safety block is also `rejected` (`SAFETY_BLOCKED`).
- Every attempt is stored with its plan, scores, overall, pass flag, feedback, timestamps, durations, the number of JSON repairs, and `rewrittenFrom`.

Final job status: `passed` | `rejected` | `failed` (with `error.code`).

**Retries vs rewrites:** a *rewrite* is a quality decision. A *retry* is infrastructure: transient provider errors (429/5xx/network) are retried by the queue, 4 runs per stage with 2s → 4s → 8s backoff. Every run is logged in `timings`.

## Tech stack

- **Server:** Node.js, TypeScript, Express, Zod
- **Web:** React, Vite, TypeScript, Tailwind CSS
- **Tests:** Vitest
- **Deploy:** a single Docker service on Render

## Run locally

```bash
cp .env.example .env      # then set LLM_MODEL and GEMINI_API_KEY
npm install
npm run dev:server        # API on http://localhost:8080
npm run dev:web           # dashboard on http://localhost:5173 (proxies /api)
npm test                  # Vitest, mocked LLM (no API calls)
npm run examples -w server   # with the server running: runs 2 real topics → examples/*.json
```

## Deploy

_TODO (M4)_

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | yes | `gemini` | `gemini` (implemented) \| `anthropic` \| `openai` (stubs) |
| `LLM_MODEL` | yes | — | Exact model id, e.g. `gemini-3.5-flash` (what the examples were generated with) |
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
