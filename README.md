# KalpanaAI

Type a topic. Get a fully animated explainer video — script, voiceover, motion graphics, and all.

KalpanaAI is an open-source AI video generation platform that transforms any topic into a cinematic animated video. It generates a narration script, converts it to speech with word-level timing, creates scene-by-scene animation directions, produces React-based motion graphics via Remotion, and renders the final MP4 — all through a single pipeline triggered by one prompt.

Built for the [ElevenLabs Hackathon](https://elevenlabs.io).

## How It Works

```
User types a topic
        ↓
┌─────────────────────────────────────────────────────────┐
│  1. Script Generation    → Gemini AI writes the script  │
│  2. Script Review        → User edits / approves        │
│  3. TTS + Transcription  → ElevenLabs voiceover + timing│
│  4. Timestamp Mapping    → Words mapped to scenes       │
│  5. Direction Generation → AI creates animation cues    │
│  6. Code Generation      → Remotion React code produced │
│  7. Preview              → Live preview + AI chat tweak │
│  8. Rendering            → Final MP4 rendered           │
└─────────────────────────────────────────────────────────┘
        ↓
  Download your video
```

The entire pipeline streams progress to the browser via SSE (Server-Sent Events), so you watch each stage complete in real time.

## Features

- **Topic → Video in one prompt** — describe anything and get a full animated explainer
- **AI script generation** — Gemini generates a structured script with scene boundaries, streamed token-by-token to the UI
- **Script review & editing** — approve, edit, or regenerate the script before proceeding
- **Natural voiceovers** — ElevenLabs TTS with 5 curated voices, adjustable speed/stability/style, and audio preview
- **22 animation themes** — from Studio and Neon to Daylight and IG-optimized palettes (light + dark)
- **Live preview** — Remotion Player renders the animation in-browser before final export
- **AI chat tweaking** — refine animations or script via natural language chat after generation
- **Code autofix** — AI detects and fixes rendering errors automatically
- **Real-time progress** — SSE streaming with reconnection resilience and event buffering
- **Showcase wall** — auto-scrolling carousel of completed videos on the landing page

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 15, React 19, Tailwind CSS 4 | SSR, UI, routing |
| Backend | Express 5, TypeScript | REST API, pipeline orchestration |
| AI — Script & Directions | Google Gemini (via Vercel AI SDK) | Script generation, scene directions, code generation |
| AI — Voice | ElevenLabs | Text-to-speech with word-level timestamps |
| Video Rendering | Remotion 4 | React-based motion graphics → MP4 |
| Job Queue | BullMQ + Redis 7 | Async pipeline stage processing |
| Database | PostgreSQL 16 + Prisma 6 | Pipeline state, themes, chat history |
| Object Storage | MinIO (dev) / Cloudflare R2 (prod) | Audio, video, and thumbnail storage |
| Monorepo | Turborepo 2.9 + npm workspaces | Build orchestration |
| Validation | Zod | Shared request/response schemas |

## Project Structure

```
kalpana-ai/
├── apps/
│   ├── web/                     # Next.js 15 frontend
│   │   └── src/
│   │       ├── app/             # Pages: home, /projects, /jobs/[id]
│   │       ├── features/pipeline/  # Pipeline wizard, preview, script editor, chat
│   │       └── shared/          # UI components, DI providers, HTTP client
│   └── api/                     # Express 5 backend
│       ├── prisma/              # Schema + migrations
│       └── src/
│           ├── pipeline/        # Bounded context (Clean Architecture)
│           │   ├── domain/      # Entities, value objects, repository interfaces
│           │   ├── application/ # Use cases
│           │   ├── infrastructure/  # Workers, AI services, repositories
│           │   └── presentation/    # Controllers, routes, DTOs
│           └── shared/          # Result type, HTTP abstractions, Prisma client
├── packages/
│   └── shared/                  # Types, Zod schemas, themes, voices, SFX library
├── docker-compose.yml           # Postgres, Redis, MinIO
└── .env.example                 # All environment variables
```


## Prerequisites

- **Node.js 24+** (see `.nvmrc` — run `nvm use` if you use nvm)
- **Docker & Docker Compose** (for Postgres, Redis, MinIO)
- **Google Gemini API key** — [Get one here](https://aistudio.google.com/apikey)
- **ElevenLabs API key** — [Get one here](https://elevenlabs.io/app/settings/api-keys)

## Local Development Setup

```bash
# 1. Clone the repo
git clone https://github.com/jeetsoni/video-ai.git
cd video-ai

# 2. Use the correct Node version
nvm use   # or ensure you're on Node 24+

# 3. Copy environment variables and fill in your API keys
cp .env.example .env
# Edit .env → set GEMINI_API_KEY and ELEVENLABS_API_KEY

# 4. Start infrastructure (Postgres, Redis, MinIO)
docker compose up -d

# 5. Install dependencies
npm install

# 6. Set up the database
cd apps/api
npx prisma generate        # Generate Prisma client
npx prisma migrate dev     # Run migrations
npm run db:seed            # Seed animation themes
cd ../..

# 7. Start all apps in dev mode
npm run dev
```

Open [http://localhost:3001](http://localhost:3001) — type a topic and create your first video.

## Services (Local Dev)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3001 |
| API | http://localhost:4000 |
| MinIO Console | http://localhost:9001 |
| MinIO API | http://localhost:9000 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## Available Scripts

```bash
# Root (all apps)
npm run dev              # Start all apps in dev mode
npm run build            # Build all apps
npm run lint             # Lint all apps

# API (from apps/api/)
npm test                 # Run tests
npm run test:coverage    # Run tests with coverage
npm run db:migrate       # Create/run Prisma migrations
npm run db:seed          # Seed animation themes
npm run db:studio        # Open Prisma Studio (DB browser)

# Web (from apps/web/)
npm test                 # Run tests
npm run build            # Production build
```

## Architecture

The backend follows Clean Architecture with four layers. Dependencies point inward only.

```
Presentation → Application → Domain
      ↑              ↑
Infrastructure ──────┘
```

- **Domain** — Entities (`PipelineJob`), value objects (`VideoFormat`, `PipelineStage`, `PipelineStatus`), repository interfaces, and the `Result<T, E>` type for error handling (no exceptions thrown)
- **Application** — Use cases implementing `UseCase<TRequest, TResponse>` (create job, approve script, send tweak, export video, etc.)
- **Infrastructure** — Prisma repositories, BullMQ workers, Gemini/ElevenLabs service adapters, S3 object store, Redis event streaming
- **Presentation** — Express controllers, routes, DTOs, and composition root factories

The frontend uses Clean Architecture adapted for Next.js with dependency injection via React Context (`AppDependenciesContext`).

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test` in the relevant app)
5. Submit a pull request

## License

MIT — see [LICENSE](LICENSE) for details.
