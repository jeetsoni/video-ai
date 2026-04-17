# Video AI — Project Conventions

## Overview

AI-powered video editing platform. Fullstack monorepo using Turborepo with Clean Architecture patterns from Prevention (Avesta HQ).

## Tech Stack

- **Monorepo**: Turborepo 2.9 + npm workspaces
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS 4 (apps/web)
- **Backend**: Express 5 + TypeScript (apps/api)
- **Database**: PostgreSQL 16 + Prisma (apps/api/prisma/schema.prisma)
- **Cache/Queue**: Redis 7 (BullMQ for async video processing)
- **Object Storage**: MinIO (dev) / S3 (prod)
- **Shared Package**: @video-ai/shared (packages/shared)
- **Testing**: Jest + ts-jest (80% coverage threshold)
- **Validation**: Zod

## Architecture — Backend (apps/api)

Clean Architecture with 4 layers. Dependencies point inward only.

```
src/
├── <bounded-context>/
│   ├── domain/           # Entities, value objects, errors, repository interfaces
│   ├── application/      # Use cases (implement UseCase<TRequest, TResponse>)
│   ├── infrastructure/   # Repository implementations, external services, mappers
│   └── presentation/     # Controllers, routes, DTOs, factories (composition root)
└── shared/
    ├── domain/           # Result<T,E>, UseCase interface, shared errors, ports
    ├── infrastructure/   # Prisma client, shared services
    └── presentation/http/ # Controller, HttpRequest, HttpResponse, Express app
```

### Foundational Types (already created)

- `src/shared/domain/result.ts` — Result<T, E> for error handling (no throwing)
- `src/shared/domain/use-case.ts` — UseCase<TRequest, TResponse> interface
- `src/shared/presentation/http/controller.ts` — Controller interface
- `src/shared/presentation/http/http-request.ts` — HttpRequest wrapper
- `src/shared/presentation/http/http-response.ts` — HttpResponse wrapper
- `src/shared/presentation/http/controller-factory.ts` — Express adapter

### Rules

- Use `Result.ok()` / `Result.fail()` instead of throwing errors
- Use cases go in `application/use-cases/`
- Factories (composition root) go in `presentation/factories/` — NOT in application/
- Repository interfaces in `domain/interfaces/repositories/`
- Repository implementations in `infrastructure/repositories/`

## Architecture — Frontend (apps/web)

Clean Architecture adapted for Next.js with Atomic Design.

```
src/
├── app/                  # Next.js App Router pages
├── features/<feature>/   # Feature modules (bounded contexts)
│   ├── application/usecases/
│   ├── components/
│   ├── hooks/
│   ├── interfaces/
│   ├── repositories/
│   └── types/
└── shared/
    ├── components/       # atoms/ molecules/ organisms/ templates/
    ├── interfaces/       # HttpClient, ConfigClient, NavigationClient, NotificationClient
    ├── providers/        # AppDependenciesContext (DI container)
    ├── services/         # FetchHttpServiceAdapter, AppConfigServiceAdapter
    ├── config/           # Environment config
    └── lib/              # Utilities (cn helper)
```

## File Naming

- **kebab-case** for all files: `add-project.use-case.ts`
- **Co-located tests**: `*.test.ts` next to implementation
- **Type files**: `.types.ts` suffix
- **Factory files**: `.factory.ts` suffix (in presentation/factories/)
- **Schema files**: `.schema.ts` suffix (for Zod schemas)

## Code Style

- NO "WHAT" comments — only "WHY" comments when business logic is non-obvious
- Self-documenting code through clear naming
- No commented-out code (use git)
- No section divider comments

## Prevention Workflow

Prevention MCP server is connected and tracks workflow state. For new features, follow:

```
vision → plan → acceptance tests → TDD (red → green → refactor) → review → ship
```

Use prevention tools (`avesta_dispatch`, `avesta_get_status`) to check current phase and gates.

## Commands

```bash
# Dev
npm run dev                          # Start all apps
docker compose up -d                 # Start Postgres, Redis, MinIO

# API
cd apps/api
npx prisma migrate dev --name <name> # Create migration
npx prisma studio                    # Browse DB at localhost:5555
npm test                             # Run tests

# Web
cd apps/web
npm run dev                          # Next.js dev server on :3000
```

## Infrastructure

- Docker Compose: Postgres (5432), Redis (6379), MinIO (9000/9001)
- API .env: `DATABASE_URL`, `REDIS_URL`, `API_PORT`
- Web: `NEXT_PUBLIC_API_URL` env var for API base URL
