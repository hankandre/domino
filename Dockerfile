# syntax=docker/dockerfile:1.7
FROM docker.io/oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN bun run build

FROM docker.io/oven/bun:1.3.14-debian@sha256:9dba1a1b43ce28c9d7931bfc4eb00feb63b0114720a0277a8f939ae4dfc9db6f AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM dependencies AS filesystem
RUN mkdir -p /skeleton/data/uploads \
  && chown -R 10001:10001 /skeleton

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS application

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=55M

COPY --from=filesystem --chown=10001:10001 /skeleton/data /data
COPY --from=build --chown=10001:10001 /app/build ./build
COPY --from=production-dependencies --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/package.json ./package.json

USER 10001:10001
EXPOSE 3000
VOLUME ["/data/uploads"]
CMD ["build"]

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS migration

WORKDIR /app
ENV NODE_ENV=production
COPY --from=dependencies --chown=10001:10001 /app/node_modules ./node_modules
COPY --from=build --chown=10001:10001 /app/package.json ./package.json
COPY --from=build --chown=10001:10001 /app/drizzle ./drizzle
COPY --from=build --chown=10001:10001 /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build --chown=10001:10001 /app/src/lib/server/db/schema.ts ./src/lib/server/db/schema.ts
COPY --from=build --chown=10001:10001 /app/src/lib/server/auth/role-catalog.mjs ./src/lib/server/auth/role-catalog.mjs
COPY --from=build --chown=10001:10001 /app/scripts ./scripts
USER 10001:10001
CMD ["node_modules/drizzle-kit/bin.cjs", "migrate", "--config=drizzle.config.ts"]

FROM application AS runtime
