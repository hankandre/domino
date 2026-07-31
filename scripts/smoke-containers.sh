#!/usr/bin/env bash
set -euo pipefail

run_id="${GITHUB_RUN_ID:-local}-$$"
prefix="domino-smoke-${run_id}"
network="${prefix}-network"
database="${prefix}-postgres"
application="${prefix}-app"
uploads="${prefix}-uploads"
database_password="container-smoke-password"
application_image="${DOMINO_APP_IMAGE:-domino:ci}"
migration_image="${DOMINO_MIGRATE_IMAGE:-domino-migrate:ci}"
platform_args=()
if [[ -n "${DOMINO_PLATFORM:-}" ]]; then
  platform_args+=(--platform "$DOMINO_PLATFORM")
fi

cleanup() {
  docker rm -f "$application" "$database" >/dev/null 2>&1 || true
  docker volume rm "$uploads" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker volume create "$uploads" >/dev/null
docker run -d --name "$database" --network "$network" \
  -e POSTGRES_DB=domino \
  -e POSTGRES_USER=domino \
  -e POSTGRES_PASSWORD="$database_password" \
  postgres:17-alpine@sha256:742f40ea20b9ff2ff31db5458d127452988a2164df9e17441e191f3b72252193 \
  >/dev/null

for _ in $(seq 1 40); do
  if docker exec "$database" pg_isready -U domino -d domino >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
docker exec "$database" pg_isready -U domino -d domino >/dev/null

database_url="postgres://domino:${database_password}@${database}:5432/domino"
migration_log="${RUNNER_TEMP:-/tmp}/${prefix}-migration.log"
migration_succeeded=false
for _ in $(seq 1 10); do
  if docker run --rm "${platform_args[@]}" --network "$network" \
    -e DATABASE_URL="$database_url" \
    "$migration_image" >"$migration_log" 2>&1; then
    migration_succeeded=true
    break
  fi
  sleep 1
done
if [[ "$migration_succeeded" != true ]]; then
  echo "Migration container failed after the database reported ready."
  cat "$migration_log"
  docker logs "$database"
  exit 1
fi

docker run -d "${platform_args[@]}" --name "$application" --network "$network" \
  --user 10001:10001 \
  --read-only \
  --tmpfs /tmp:size=64m,mode=1777 \
  --mount "type=volume,src=${uploads},dst=/data/uploads" \
  -p 127.0.0.1::3000 \
  -e DATABASE_URL="$database_url" \
  -e ORIGIN=http://127.0.0.1:3000 \
  -e DOMINO_DEMO_MODE=false \
  "$application_image" >/dev/null

port="$(docker port "$application" 3000/tcp | sed 's/.*://')"
for _ in $(seq 1 40); do
  if curl --fail --silent "http://127.0.0.1:${port}/api/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl --fail --silent "http://127.0.0.1:${port}/api/health" | grep -q '"ok":true'
curl --fail --silent "http://127.0.0.1:${port}/api/ready" | grep -q '"database":"ready"'
curl --fail --silent "http://127.0.0.1:${port}/api/docs" | grep -q 'swagger-ui-bundle.js'
curl --fail --silent "http://127.0.0.1:${port}/api/docs/swagger-ui.css" | grep -q '.swagger-ui'
curl --fail --silent "http://127.0.0.1:${port}/api/docs/swagger-ui-bundle.js" | grep -q 'SwaggerUIBundle'
curl --fail --silent "http://127.0.0.1:${port}/api/docs/swagger-ui-standalone-preset.js" | grep -q 'SwaggerUIStandalonePreset'
curl --fail --silent "http://127.0.0.1:${port}/api/openapi.json" | grep -q '"/v1/product-records"'
test "$(docker inspect "$application" --format '{{.HostConfig.ReadonlyRootfs}}')" = "true"
test "$(docker inspect "$application" --format '{{.Config.User}}')" = "10001:10001"

started="$(date +%s)"
docker stop --time 10 "$application" >/dev/null
elapsed="$(( $(date +%s) - started ))"
test "$elapsed" -lt 10

echo "Container migrations, storage readiness, read-only runtime, API, and graceful shutdown passed."
