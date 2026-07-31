import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl)
  throw new Error("DATABASE_URL is required for migration tests.");

const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const databaseNames = [
  `domino_migration_fresh_${suffix}`,
  `domino_migration_upgrade_${suffix}`,
];
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = "/postgres";

function identifier(value) {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error("Unsafe database name.");
  return `"${value}"`;
}

function databaseUrl(name) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function migrationFiles() {
  return (await readdir(new URL("../drizzle/", import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

async function applyMigration(client, name) {
  const sql = await readFile(
    new URL(`../drizzle/${name}`, import.meta.url),
    "utf8",
  );
  const statements = sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement);
    await client.query("COMMIT");
  } catch (cause) {
    await client.query("ROLLBACK");
    throw new Error(`Migration ${name} failed`, { cause });
  }
}

async function expectScalar(client, query, expected) {
  const result = await client.query(query);
  const actual = String(Object.values(result.rows[0] ?? {})[0]);
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}: ${query}`);
  }
}

async function seedLegacyInvitations(client) {
  const household = randomBytes(16).toString("hex");
  const role = randomBytes(16).toString("hex");
  await client.query(
    `INSERT INTO households (id, name, slug)
     VALUES ($1::uuid, 'Upgrade household', $2)`,
    [
      `${household.slice(0, 8)}-${household.slice(8, 12)}-${household.slice(12, 16)}-${household.slice(16, 20)}-${household.slice(20)}`,
      `upgrade-${suffix}`,
    ],
  );
  const householdId = `${household.slice(0, 8)}-${household.slice(8, 12)}-${household.slice(12, 16)}-${household.slice(16, 20)}-${household.slice(20)}`;
  const roleId = `${role.slice(0, 8)}-${role.slice(8, 12)}-${role.slice(12, 16)}-${role.slice(16, 20)}-${role.slice(20)}`;
  await client.query(
    `INSERT INTO roles (id, household_id, name, permissions, system)
     VALUES ($1, $2, 'Member fixture', '[]'::jsonb, false)`,
    [roleId, householdId],
  );
  await client.query(
    `INSERT INTO user_invitations
       (household_id, email, role_id, token_hash, expires_at, accepted_at)
     VALUES
       ($1, 'pending@example.test', $2, $3, now() + interval '1 day', null),
       ($1, 'accepted@example.test', $2, $4, now() + interval '1 day', now())`,
    [householdId, roleId, `pending-${suffix}`, `accepted-${suffix}`],
  );
}

async function verifyConstraints(client) {
  await expectScalar(
    client,
    "SELECT count(*) FROM pg_constraint WHERE conname IN ('actors_claim_access_scope_check', 'user_invitations_claim_access_scope_check')",
    "2",
  );
  await expectScalar(
    client,
    "SELECT count(*) FROM pg_constraint WHERE conname IN ('actors_claim_access_scope_check', 'user_invitations_claim_access_scope_check') AND pg_get_constraintdef(oid) LIKE '%all%selected%'",
    "2",
  );
  await expectScalar(
    client,
    "SELECT column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_invitations' AND column_name = 'claim_access_scope'",
    "'selected'::text",
  );
  await expectScalar(
    client,
    "SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'warranties' AND column_name IN ('submission_methods', 'required_evidence') AND is_nullable = 'NO' AND column_default = '''[]''::jsonb'",
    "2",
  );
}

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  for (const name of databaseNames) {
    await admin.query(`CREATE DATABASE ${identifier(name)}`);
  }
  const files = await migrationFiles();
  const claimScopeMigrationIndex = files.findIndex((file) =>
    file.startsWith("0008_"),
  );
  if (claimScopeMigrationIndex < 0)
    throw new Error("Expected the claim-scope migration to be 0008.");

  const fresh = new pg.Client({
    connectionString: databaseUrl(databaseNames[0]),
  });
  await fresh.connect();
  try {
    for (const file of files) await applyMigration(fresh, file);
    await fresh.query("BEGIN");
    await verifyConstraints(fresh);
    await fresh.query("ROLLBACK");
  } finally {
    await fresh.end();
  }

  const upgrade = new pg.Client({
    connectionString: databaseUrl(databaseNames[1]),
  });
  await upgrade.connect();
  try {
    for (const file of files.slice(0, claimScopeMigrationIndex))
      await applyMigration(upgrade, file);
    await seedLegacyInvitations(upgrade);
    for (const file of files.slice(claimScopeMigrationIndex))
      await applyMigration(upgrade, file);
    await expectScalar(
      upgrade,
      "SELECT count(*) FROM user_invitations WHERE accepted_at IS NULL AND revoked_at IS NOT NULL AND claim_access_scope = 'selected' AND claim_ids = '[]'::jsonb",
      "1",
    );
    await expectScalar(
      upgrade,
      "SELECT count(*) FROM user_invitations WHERE accepted_at IS NOT NULL AND revoked_at IS NULL",
      "1",
    );
    await upgrade.query("BEGIN");
    await verifyConstraints(upgrade);
    await upgrade.query("ROLLBACK");
  } finally {
    await upgrade.end();
  }
} finally {
  for (const name of databaseNames) {
    await admin.query(
      `DROP DATABASE IF EXISTS ${identifier(name)} WITH (FORCE)`,
    );
  }
  await admin.end();
}

console.log("Fresh and 0.1.1 upgrade migration paths passed.");
