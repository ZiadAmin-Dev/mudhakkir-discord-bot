# Build stage: TypeScript compilation and native module build.
FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY assets ./assets
RUN npm run build

# Runtime stage: single Node process, no build tools.
FROM node:22-bookworm-slim
WORKDIR /app

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets

RUN useradd -m -u 10001 mudhakkir \
  && mkdir -p /app/data \
  && chown -R mudhakkir:mudhakkir /app

ENV NODE_ENV=production
USER mudhakkir

CMD ["node", "dist/index.js"]
