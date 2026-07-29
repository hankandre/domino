import { readFile } from "node:fs/promises";
import process from "node:process";
import { hash } from "@node-rs/argon2";
import pg from "pg";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = (argument("--email") ?? "").trim().toLowerCase();
const displayName = (argument("--name") ?? "").trim();
const passwordFile =
  argument("--password-file") ?? process.env.DOMINO_BOOTSTRAP_PASSWORD_FILE;
if (!email || !displayName || !passwordFile || !process.env.DATABASE_URL) {
  console.error(
    'Usage: npm run bootstrap-owner -- --email owner@example.test --name "Owner" --password-file /run/secrets/bootstrap-password',
  );
  process.exit(2);
}
const password = (await readFile(passwordFile, "utf8")).trimEnd();
if (password.length < 12) {
  console.error("The bootstrap password must contain at least 12 characters.");
  process.exit(2);
}

const ownerPermissions = [
  "warranties:read",
  "warranties:write",
  "claims:read",
  "claims:create",
  "claims:manage",
  "documents:read",
  "documents:attach",
  "notes:read",
  "notes:write",
  "household:manage",
  "integrations:manage",
  "service_accounts:manage",
  "audit:read",
];
const memberPermissions = ownerPermissions.filter(
  (permission) =>
    ![
      "household:manage",
      "integrations:manage",
      "service_accounts:manage",
      "audit:read",
    ].includes(permission),
);
const agentReaderPermissions = [
  "warranties:read",
  "claims:read",
  "documents:read",
  "notes:read",
];
const claimAssistantPermissions = [
  "warranties:read",
  "claims:read",
  "claims:create",
  "claims:manage",
  "documents:read",
  "documents:attach",
  "notes:read",
  "notes:write",
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
let paperlessToken = process.env.PAPERLESS_TOKEN?.trim() || "";
if (!paperlessToken && process.env.PAPERLESS_TOKEN_FILE) {
  paperlessToken = await readFile(process.env.PAPERLESS_TOKEN_FILE, "utf8")
    .then((value) => value.trim())
    .catch(() => "");
}
const defaultDocumentBackend =
  process.env.PAPERLESS_URL?.trim() && paperlessToken ? "paperless" : "local";
await client.connect();
try {
  await client.query("begin");
  const existing = await client.query(
    "select count(*)::int as count from actors where kind = 'user'",
  );
  if (existing.rows[0].count !== 0)
    throw new Error("A human account already exists; bootstrap is disabled.");
  const household = await client.query(
    `insert into households (name, slug, default_document_backend) values ($1, $2, $3) returning id`,
    [
      process.env.DOMINO_HOUSEHOLD_NAME?.trim() || "Home",
      process.env.DOMINO_HOUSEHOLD_SLUG?.trim() || "home",
      defaultDocumentBackend,
    ],
  );
  const householdId = household.rows[0].id;
  const roleRows = await client.query(
    `insert into roles (household_id, name, description, permissions, system)
     values ($1, 'Owner', 'Full control of the household and its integrations.', $2::jsonb, true),
            ($1, 'Member', 'Manage products, documents, notes, and claims.', $3::jsonb, true),
            ($1, 'Agent Reader', 'Find coverage and supporting material without changing records.', $4::jsonb, true),
            ($1, 'Claim Assistant', 'Find products and help prepare or manage claims.', $5::jsonb, true)
     returning id, name`,
    [
      householdId,
      JSON.stringify(ownerPermissions),
      JSON.stringify(memberPermissions),
      JSON.stringify(agentReaderPermissions),
      JSON.stringify(claimAssistantPermissions),
    ],
  );
  const ownerRoleId = roleRows.rows.find((row) => row.name === "Owner").id;
  const passwordHash = await hash(password, {
    algorithm: 2,
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
  const user = await client.query(
    `insert into users (email, display_name, password_hash) values ($1, $2, $3) returning id`,
    [email, displayName, passwordHash],
  );
  const actor = await client.query(
    `insert into actors (household_id, kind, user_id, name) values ($1, 'user', $2, $3) returning id`,
    [householdId, user.rows[0].id, displayName],
  );
  await client.query(
    `insert into actor_roles (actor_id, role_id) values ($1, $2)`,
    [actor.rows[0].id, ownerRoleId],
  );
  await client.query("commit");
  console.log(
    `Created the first Domino owner for ${email}. Delete the password file now.`,
  );
} catch (cause) {
  await client.query("rollback");
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
} finally {
  await client.end();
}
