# video-ai

AI-powered video editing platform.

## Architecture Decisions

- **Monorepo**: Turborepo 2.9 with npm workspaces
- **Frontend**: Next.js 16 + TypeScript + Tailwind CSS 4 → deployed to Vercel
- **Backend**: Express 5 + TypeScript → deployed via Docker (Railway / Fly.io / VPS)
- **Video Processing**: FFmpeg (direct via child_process — fluent-ffmpeg is deprecated) with BullMQ job queue
- **Database**: PostgreSQL 16 with Prisma 7
- **Cache / Queue**: Redis 7 (BullMQ 5.x for async video processing jobs)
- **Object Storage**: MinIO (S3-compatible) for development, swap to AWS S3 for production
- **Shared Code**: Shared TypeScript package for types, utils, and validation schemas

## Project Structure

```
video-ai/
├── apps/
│   ├── web/                  # Next.js 16 frontend (Vercel)
│   └── api/                  # Express 5 backend (Docker)
├── packages/
│   └── shared/               # Shared types, utils, constants
├── docker-compose.yml        # Local dev: Postgres, Redis, MinIO
├── turbo.json                # Turborepo config
├── package.json              # Root workspace config
└── .env.example              # Environment variables template
```

## Tech Stack

| Layer              | Technology                  | Version | Purpose                          |
| ------------------ | --------------------------- | ------- | -------------------------------- |
| Frontend           | Next.js + Tailwind CSS      | 16 / 4  | SSR, routing, UI                 |
| Backend API        | Express + TypeScript        | 5.2     | REST API, video processing       |
| Video Processing   | FFmpeg (child_process)      | latest  | Transcoding, trimming, merging   |
| Job Queue          | BullMQ + Redis              | 5.x / 7 | Async video processing tasks    |
| Database           | PostgreSQL + Prisma         | 16 / 7  | Data persistence                 |
| Object Storage     | MinIO (dev) / S3 (prod)     | latest  | Video file storage               |
| Monorepo           | Turborepo                   | 2.9     | Build orchestration              |
| Containerization   | Docker + Docker Compose     | latest  | Local dev & backend deployment   |

> **Note:** `fluent-ffmpeg` was deprecated in May 2025. We use FFmpeg directly via `child_process` with a thin wrapper.

## Deployment Strategy

- **Frontend (Next.js)** → Vercel (zero-config, automatic deployments)
- **Backend (Express)** → Docker container on Railway / Fly.io / VPS
- **Infrastructure** → Docker Compose for Postgres, Redis, MinIO

## Local Development

```bash
# 1. Clone the repo
git clone git@github.com:jeetsoni/video-ai.git
cd video-ai

# 2. Copy environment variables
cp .env.example .env

# 3. Start infrastructure (Postgres, Redis, MinIO)
docker compose up -d

# 4. Install dependencies
npm install

# 5. Start all apps in dev mode
npm run dev
```

## Services (Local)

| Service        | URL                          |
| -------------- | ---------------------------- |
| Next.js App    | http://localhost:3000         |
| Express API    | http://localhost:4000         |
| MinIO Console  | http://localhost:9001         |
| MinIO API      | http://localhost:9000         |
| PostgreSQL     | localhost:5432               |
| Redis          | localhost:6379               |
