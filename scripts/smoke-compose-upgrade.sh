#!/usr/bin/env bash
set -euo pipefail

run_id="${GITHUB_RUN_ID:-local}-$$"
export COMPOSE_PROJECT_NAME="domino-upgrade-${run_id}"
export POSTGRES_PASSWORD="compose-upgrade-password"
export DOMINO_IMAGE_TAG="ci"
secret_dir="$(mktemp -d)"
database_dump="$(mktemp)"
export PAPERLESS_TOKEN_PATH="${secret_dir}/paperless_token"
export DOMINO_OIDC_CLIENT_SECRET_PATH="${secret_dir}/oidc_client_secret"
export DOMINO_SESSION_SECRET_PATH="${secret_dir}/session_secret"
export DOMINO_CREDENTIAL_ENCRYPTION_KEY_PATH="${secret_dir}/credential_encryption_key"
printf '%s' 'compose-session-secret-that-is-longer-than-32-characters' >"$DOMINO_SESSION_SECRET_PATH"
printf '%s' 'compose-credential-key-that-is-longer-than-32-characters' >"$DOMINO_CREDENTIAL_ENCRYPTION_KEY_PATH"
touch "$PAPERLESS_TOKEN_PATH" "$DOMINO_OIDC_CLIENT_SECRET_PATH"

cleanup() {
  docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -f "$database_dump"
  rm -rf "$secret_dir"
}
trap cleanup EXIT

wait_for_app() {
  for _ in $(seq 1 60); do
    if docker compose exec -T app /nodejs/bin/node -e \
      "fetch('http://127.0.0.1:3000/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker compose logs app migrate postgres
  return 1
}
wait_for_postgres() {
  local last_start=""
  local stable_checks=0
  local start_time=""

  for _ in $(seq 1 60); do
    start_time="$(
      docker compose exec -T postgres psql -U domino -d domino -qAtc \
        "select pg_postmaster_start_time()" 2>/dev/null || true
    )"
    if [[ -n "$start_time" ]]; then
      if [[ "$start_time" == "$last_start" ]]; then
        ((stable_checks += 1))
      else
        last_start="$start_time"
        stable_checks=1
      fi
      if ((stable_checks >= 3)); then
        return 0
      fi
    else
      last_start=""
      stable_checks=0
    fi
    sleep 1
  done

  docker compose logs postgres
  return 1
}

docker compose config --quiet
docker compose up -d app
wait_for_app

docker compose exec -T postgres psql -U domino -d domino -v ON_ERROR_STOP=1 \
  -c "create table compose_restore_marker (value text primary key); insert into compose_restore_marker values ('preserved');" \
  >/dev/null
upload_volume="${COMPOSE_PROJECT_NAME}_domino-uploads"
docker run --rm --user 10001:10001 --mount "type=volume,src=${upload_volume},dst=/data/uploads" \
  domino:ci -e "require('node:fs').writeFileSync('/data/uploads/restore-marker','preserved')"

# Re-running the same release migration is the upgrade-path idempotency check.
docker compose run --rm migrate >/dev/null
docker compose exec -T postgres pg_dump -U domino -d domino --no-owner >"$database_dump"
upload_marker="$(docker run --rm --user 10001:10001 --mount "type=volume,src=${upload_volume},dst=/data/uploads,readonly" domino:ci -e "process.stdout.write(require('node:fs').readFileSync('/data/uploads/restore-marker','utf8'))")"

docker compose down --volumes
# PostgreSQL briefly accepts connections through its temporary initialization
# server before restarting into the final server. Require the same postmaster
# to answer several times so the restore cannot race that planned restart.
docker compose up -d postgres
wait_for_postgres
docker compose exec -T postgres psql -U domino -d domino -v ON_ERROR_STOP=1 <"$database_dump" >/dev/null
docker volume create "$upload_volume" >/dev/null
docker run --rm --user 10001:10001 --mount "type=volume,src=${upload_volume},dst=/data/uploads" \
  domino:ci -e "require('node:fs').writeFileSync('/data/uploads/restore-marker',process.argv[1])" "$upload_marker"

docker compose up -d app
wait_for_app
test "$(docker compose exec -T postgres psql -U domino -d domino -tAc "select value from compose_restore_marker")" = "preserved"
test "$(docker run --rm --user 10001:10001 --mount "type=volume,src=${upload_volume},dst=/data/uploads,readonly" domino:ci -e "process.stdout.write(require('node:fs').readFileSync('/data/uploads/restore-marker','utf8'))")" = "preserved"

echo "Compose migration rerun, named-volume persistence, backup, and restore passed."
