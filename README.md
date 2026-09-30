# FeedForge

**Type a topic. Get a publish-ready Qoneqt video.**

**Live demo:** https://feedforge-iuee.onrender.com

Built for **Qoneqt × CTRL FREAK 2026** by **Team Dravex — MIT ADT University**.

> **Phase 1 (this repo):** topic → Script Engine → Quality Gate, with a live dashboard, deployed as one Docker service. See [Deploy](#deploy-render) and the [Phase 2 roadmap](#phase-1-vs-phase-2).

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

## Screenshots

![FeedForge dashboard](docs/dashboard.png)

![Quality Gate panel](docs/quality-gate.png)

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
- **Sample runs:** on a fresh deploy the server seeds the real passed runs from [`examples/`](examples/). They are labeled **"Sample run"**, and the newest one opens by default, so visitors land on a complete Quality Gate result even when the job history was wiped or the LLM quota is used up.
- **Friendly errors:** a quota or overload error reads as plain language ("The AI provider is busy right now…"). The raw provider message sits in a collapsed *Technical details* block. Failed jobs have a **Retry** button that re-submits the same topic.
- **Which model served each stage** is shown in the job header and on each attempt card, e.g. `gemini-3.5-flash-lite (fallback)`.
- **States:** loading, empty and error states are handled. The layout is responsive down to 390px, and the selected job is kept in the URL (`#/jobs/<id>`).

## Phase 1 vs Phase 2

| | Phase 1 (this build) | Phase 2 (roadmap) |
|---|---|---|
| Input | ✅ topic → job | Batch mode (a list of topics/trends → many jobs) |
| Script Engine | ✅ 3 hooks → chosen hook → scene plan, Zod-validated | |
| Quality Gate | ✅ Critic scores, rules in code, rewrite loop, safety rejection | |
| Asset Engine | — | Stock clips per `visualQuery`, TTS voiceover per scene |
| Composer | — | FFmpeg: 9:16 clips + voiceover + burned-in `onScreenText` → MP4 |
| Publish Pack | — | MP4 + title/description/hashtags + thumbnail, ready for the Global Feed |
| Dashboard | ✅ Live SSE stages, Quality Gate panel | Assets/Compose/Publish stages light up; video preview |
| Queue / storage | In-process queue, JSON files | BullMQ + Redis, Postgres, Cloudflare R2 |
| Deploy | ✅ One Docker service on Render | Separate API and worker services |

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
| `POST` | `/api/jobs` | `{ "topic": "…" }` (≥ 3 words or ≥ 12 chars, ≤ 200) → `202 { "jobId" }`. Rate-limited per IP |
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

### Production build (same as the container)

```bash
npm run build             # web → web/dist, server → server/dist
npm start                 # Express serves the API and the dashboard on http://localhost:8080
```

### Docker

```bash
docker build -t feedforge .
docker run -p 8080:8080 --env-file .env feedforge   # → http://localhost:8080
```

This is a multi-stage build on `node:24-alpine`. The runtime image contains only the server's production dependencies, the compiled server and the built dashboard. It runs as the non-root `node` user. Express serves `web/dist`: hashed assets are cached for 1 year (`immutable`), `index.html` is `no-cache`, and any other GET falls back to the SPA. `/api/*` always returns JSON.

## Deploy (Render)

FeedForge deploys as **one Docker web service**. [`render.yaml`](render.yaml) is a Render Blueprint.

1. Push this repo to GitHub.
2. In the Render dashboard, choose **New → Blueprint** and select the repo. Render reads `render.yaml`.
3. When prompted, paste your **`GEMINI_API_KEY`**. It is declared `sync: false`, so it lives only in Render and never in git.
4. Click **Apply**. Render builds the Dockerfile and deploys it to `https://feedforge-<suffix>.onrender.com` (the exact URL is shown in the dashboard).
5. Verify:
   - `https://<your-service>.onrender.com/api/health` → `{"status":"ok", ... "model":"gemini-3.5-flash"}`
   - Open the root URL, click an example chip, and watch the stages stream in live.

The Blueprint config:

| Setting | Value |
|---|---|
| `runtime` | `docker` (builds `./Dockerfile`) |
| `plan` | `free` |
| `region` | `singapore`, closest to Qoneqt's audience in India |
| `healthCheckPath` | `/api/health` |
| `autoDeployTrigger` | `commit`: every push to the linked branch redeploys |
| Environment | `LLM_PROVIDER=gemini`, `LLM_MODEL=gemini-3.5-flash`, `LLM_FALLBACK_MODEL=gemini-3.5-flash-lite`, rate limit 10 jobs/min/IP. The key is set in the dashboard |

**Render free-plan behavior (plan the demo around it):**
- The service **spins down after 15 minutes without traffic**, and the next request takes about **1 minute** to wake it. Open the URL a few minutes before presenting.
- The filesystem is **ephemeral**: job history in `./data` is **wiped on every redeploy or restart**. Free services cannot attach a persistent disk. The Phase 2 answer is Postgres.
- SSE works through Render's proxy. The server sends a heartbeat every 15s to keep streams open.
- On deploy, Render sends `SIGTERM`. The server stops cleanly, and any job that was mid-flight is marked `failed` (`INTERRUPTED`) on the next boot.

**Gemini free-tier quota.** A free-tier key has a **daily request cap per model**. At the time of writing, this project's key was capped at 20 requests/day for `gemini-3.5-flash`. One job uses 2 calls if it passes first time, and up to about 6 with rewrites. Mitigations built in:
- **Fallback model:** if the primary returns 429 or 503, that same call is retried once on `LLM_FALLBACK_MODEL`. The free-tier cap is counted per model, so this adds a second daily allowance.
- **Fail fast:** when both models are capped, the job fails immediately with `LLM_QUOTA_EXHAUSTED` and a friendly message, instead of retrying.
- **Sample runs:** these keep the dashboard useful even with no quota left. Check usage at https://ai.dev/rate-limit, and enable billing on the Google AI project before a live demo.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `LLM_PROVIDER` | yes | `gemini` | `gemini` (implemented) \| `anthropic` \| `openai` (stubs) |
| `LLM_MODEL` | yes | — | Exact model id, e.g. `gemini-3.5-flash` (what the examples were generated with) |
| `LLM_FALLBACK_MODEL` | no | — | Tried once per call when the primary returns 429/503, e.g. `gemini-3.5-flash-lite`. The model that actually served each stage is recorded in the job JSON (`servedBy`) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | the one matching the provider | — | Provider API key |
| `PORT` | no | `8080` | HTTP port |
| `DATA_DIR` | no | `./data` | Job JSON storage directory |
| `RATE_LIMIT_MAX` | no | `10` | Max `POST /api/jobs` per window per IP |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate limit window |

## Known simplifications (Phase 1)

- An **in-process job queue** sits behind a `JobQueue` interface. Jobs in flight are lost on restart and marked `INTERRUPTED`. Planned: **BullMQ + Redis**, with one queue per stage and the same handler signature and retry policy.
- Jobs are stored as **JSON files** behind a `JobStore` interface, and are ephemeral on Render's free plan. Planned: **Postgres** for jobs, and **Cloudflare R2** for Phase 2 media (voiceover audio, clips, rendered MP4s).
- **Single instance.** SSE fan-out and the rate limiter are in-memory. Planned: Redis pub/sub and a shared rate-limit store to scale horizontally.
- **No auth.** The API is open, protected only by the per-IP rate limit.
- **One real LLM provider (Gemini).** Anthropic and OpenAI are interface stubs.

## Team

**Dravex — MIT ADT University**

## License

MIT
