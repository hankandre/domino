# Backup and restore

A recoverable Domino backup is a coordinated set: PostgreSQL, local uploads (when
used), session secret, credential-encryption key or its derivation secret, OIDC
client secret/configuration, and operator configuration. Paperless originals are
backed up by Paperless; Domino's database contains their associations.

## Back up

1. Record the app version, migration version, PostgreSQL major version, image
   digests, and configuration with secret values redacted.
2. Pause writes or use a PostgreSQL snapshot method that is consistent with the
   upload-volume snapshot. With Compose, a brief `docker compose stop app` is the
   simplest household-scale maintenance window.
3. Run `pg_dump --format=custom --no-owner` with a PostgreSQL 17 client and store
   the result encrypted.
4. Snapshot or archive the complete local upload volume while writes remain
   paused. Preserve ownership/mode metadata. Skip this only when no local-backed
   document or image exists.
5. Back up secret files and configuration separately in a secret manager. Never
   put them in the database archive or source repository.
6. Resume the app and test both archives periodically in an isolated environment.

## Restore

1. Provision the recorded PostgreSQL major version and an empty database. Restore
   the custom dump with `pg_restore --clean --if-exists --no-owner` only against
   the explicitly selected restore database.
2. Restore uploads to the mounted data path and make them writable by UID/GID
   10001 through storage policy or `fsGroup`, not a privileged app startup.
3. Restore the exact credential-encryption key. If Domino derived it from the
   session secret, restore that exact session secret before opening saved
   Paperless settings.
4. Deploy the recorded app and migration image versions. Run only migrations that
   belong to the intended target release.
5. Verify `/api/ready`, local and Paperless document access, an image, OIDC/local
   sign-in, an existing claim, and an audit entry. Confirm row and file counts.

## PostgreSQL major upgrades and rollback

Use `pg_dump`/`pg_restore` or a supported `pg_upgrade` procedure; never point a new
major server at an old data directory. Test the full path with a restored copy.
Application migrations are forward-only. A failed post-migration rollout may
require restoring both database and uploads to the coordinated pre-upgrade point;
an old container alone is not a rollback plan.
