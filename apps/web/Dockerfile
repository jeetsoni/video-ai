FROM node:24-slim AS base
WORKDIR /app

# ── Install dependencies ──
FROM base AS deps
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/

RUN npm ci --workspace=@video-ai/web --workspace=@video-ai/shared --include-workspace-root

# ── Build ──
FROM deps AS build

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY tsconfig.base.json ./

RUN npx turbo build --filter=@video-ai/web

# ── Production ──
FROM base AS runner

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/web/server.js"]
