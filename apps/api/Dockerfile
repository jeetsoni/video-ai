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

RUN npx turbo build --filter=@video-ai/api

# Generate Prisma client
RUN cd apps/api && npx prisma generate

# ── Production ──
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api ./apps/api
COPY --from=build /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=build /app/package.json ./package.json

EXPOSE 4000

# Run migrations then start the server
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && node --import tsx/esm src/shared/presentation/http/server.ts"]
