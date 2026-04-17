# video-ai

AI-powered video editing platform.

## Architecture Decisions

- **Monorepo**: Turborepo with npm workspaces
- **Frontend**: Next.js + TypeScript + Tailwind CSS → deployed to Vercel
- **Backend**: Express + TypeScript → deployed via Docker (Railway / Fly.io / VPS)
- **Video Processing**: FFmpeg (via fluent-ffmpeg) with BullMQ job queue
- **Database**: PostgreSQL with Prisma ORM
- **Cache / Queue**: Redis (BullMQ for async video processing jobs)
- **Object Storage**: MinIO (S3-compatible) for development, swap to AWS S3 for production
- **Shared Code**: Shared TypeScript package for types, utils, and validation schemas

## Project Structure

```
video-ai/
├── apps/
│   ├── web/                  # Next.js frontend (Vercel)
│   └── api/                  # Express backend (Docker)
├── packages/
│   └── shared/               # Shared types, utils, constants
├── docker-compose.yml        # Local dev: Postgres, Redis, MinIO
├── turbo.json                # Turborepo config
├── package.json              # Root workspace config
└── .env.example              # Environment variables template
```

## Tech Stack

| Layer              | Technology                  | Purpose                          |
| ------------------ | --------------------------- | -------------------------------- |
| Frontend           | Next.js + Tailwind          | SSR, routing, UI                 |
| Backend API        | Express + TypeScript        | REST API, video processing       |
| Video Processing   | FFmpeg + fluent-ffmpeg      | Transcoding, trimming, merging   |
| Job Queue          | BullMQ + Redis              | Async video processing tasks     |
| Database           | PostgreSQL + Prisma         | Data persistence                 |
| Object Storage     | MinIO (dev) / S3 (prod)     | Video file storage               |
| Monorepo           | Turborepo                   | Build orchestration              |
| Containerization   | Docker + Docker Compose     | Local dev & backend deployment   |

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
