FROM node:24-slim AS base

# Remotion needs Chromium for video rendering
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libcairo2 \
    libcups2 \
    libxss1 \
    libgtk-3-0 \
    openssl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# ── Install dependencies ──
FROM base AS deps
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
COPY apps/api/prisma ./apps/api/prisma/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN npm ci --workspace=@video-ai/api --workspace=@video-ai/shared --include-workspace-root

# ── Build ──
FROM deps AS build
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api

# Generate Prisma client BEFORE build (tsc needs the types)
RUN cd apps/api && npx prisma generate

RUN npx turbo build --filter=@video-ai/api

# ── Production ──
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules from build stage (includes generated Prisma client)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/package.json ./package.json

EXPOSE 4000

# Run migrations, generate Prisma client, seed themes, then start the server
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && npx prisma generate && npx tsx src/pipeline/infrastructure/seed/seed-themes.ts && node --import tsx/esm src/shared/presentation/http/server.ts"]
