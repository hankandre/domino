# syntax=docker/dockerfile:1.7
FROM docker.io/oven/bun:1.3.14-alpine AS build

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM docker.io/library/node:24-alpine AS runtime

RUN addgroup -S -g 10001 domino \
  && adduser -S -D -H -u 10001 -G domino domino \
  && mkdir -p /app /data/uploads \
  && chown -R 10001:10001 /app /data

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=55M

COPY --from=build --chown=10001:10001 /app/build ./build
COPY --from=build --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/drizzle ./drizzle
COPY --from=build --chown=10001:10001 /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build --chown=10001:10001 /app/src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY --from=build --chown=10001:10001 /app/scripts ./scripts

USER 10001:10001
EXPOSE 3000
VOLUME ["/data/uploads"]

ENTRYPOINT ["node"]
CMD ["build"]
