FROM node:24-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @raceball/server build
ENV NODE_ENV=production TRACK_PATH=/app/packages/game-core/tracks/happy_valley_col.glb
# Railway sets PORT itself. The server listens on process.env.PORT (default 2567 locally)
CMD ["node", "apps/server/dist/index.js"]
