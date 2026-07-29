import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema";
import { PaperlessClient } from "../paperless";

type Database = NodePgDatabase<typeof schema>;
type Environment = Record<string, string | undefined>;

const legacyEncryptedCredentialPrefix = "encrypted:v1:";
const encryptedCredentialPrefix = "encrypted:v2:";

function readSecret(path: string | undefined, value: string | undefined) {
  if (path) {
    try {
      return readFileSync(path, "utf8").trim();
    } catch {
      return "";
    }
  }
  return value?.trim() ?? "";
}

function deploymentToken(source: Environment = process.env) {
  return readSecret(source.PAPERLESS_TOKEN_FILE, source.PAPERLESS_TOKEN);
}

function credentialEncryptionSecret(source: Environment = process.env) {
  return (
    readSecret(
      source.DOMINO_CREDENTIAL_ENCRYPTION_KEY_FILE,
      source.DOMINO_CREDENTIAL_ENCRYPTION_KEY,
    ) ||
    readSecret(source.DOMINO_SESSION_SECRET_FILE, source.DOMINO_SESSION_SECRET)
  );
}

function credentialKey(source: Environment = process.env) {
  const secret = credentialEncryptionSecret(source);
  if (secret.length < 32) {
    throw new Error(
      "Set DOMINO_CREDENTIAL_ENCRYPTION_KEY or a session secret of at least 32 characters before saving integration credentials.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

export function normalizePaperlessUrl(value: string) {
  const url = new URL(value.trim());
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Paperless URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Paperless URL must not contain credentials.");
  }
  url.search = "";
  url.hash = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.toString();
}

export function encryptPaperlessToken(
  token: string,
  householdId: string,
  baseUrl: string,
  source: Environment = process.env,
) {
  const normalizedBaseUrl = normalizePaperlessUrl(baseUrl);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", credentialKey(source), iv);
  cipher.setAAD(
    Buffer.from(`${householdId}:paperless:v2:${normalizedBaseUrl}`),
  );
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${encryptedCredentialPrefix}${iv.toString("base64url")}.${tag.toString("base64url")}.${ciphertext.toString("base64url")}`;
}

export function decryptPaperlessToken(
  encrypted: string,
  householdId: string,
  baseUrl: string,
  source: Environment = process.env,
) {
  const isCurrent = encrypted.startsWith(encryptedCredentialPrefix);
  const isLegacy = encrypted.startsWith(legacyEncryptedCredentialPrefix);
  if (!isCurrent && !isLegacy) {
    throw new Error("Paperless credential has an unsupported storage format.");
  }
  const prefix = isCurrent
    ? encryptedCredentialPrefix
    : legacyEncryptedCredentialPrefix;
  const parts = encrypted.slice(prefix.length).split(".");
  if (parts.length !== 3) {
    throw new Error("Paperless credential is malformed.");
  }
  try {
    const [iv, tag, ciphertext] = parts.map((part) =>
      Buffer.from(part, "base64url"),
    );
    const decipher = createDecipheriv("aes-256-gcm", credentialKey(source), iv);
    decipher.setAAD(
      Buffer.from(
        isCurrent
          ? `${householdId}:paperless:v2:${normalizePaperlessUrl(baseUrl)}`
          : `${householdId}:paperless:v1`,
      ),
    );
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error(
      "Paperless credential could not be decrypted. Check the credential-encryption secret.",
    );
  }
}

function isEncryptedCredential(value: string | null | undefined) {
  return Boolean(
    value?.startsWith(encryptedCredentialPrefix) ||
    value?.startsWith(legacyEncryptedCredentialPrefix),
  );
}

export function deploymentPaperlessConfiguration(
  source: Environment = process.env,
) {
  const rawBaseUrl = source.PAPERLESS_URL?.trim();
  const token = deploymentToken(source);
  if (!rawBaseUrl || !token) return null;
  return {
    baseUrl: normalizePaperlessUrl(rawBaseUrl),
    token,
    source: "deployment" as const,
  };
}

async function integrationRecord(db: Database, householdId: string) {
  const [record] = await db
    .select()
    .from(schema.integrations)
    .where(
      and(
        eq(schema.integrations.householdId, householdId),
        eq(schema.integrations.kind, "paperless"),
      ),
    )
    .limit(1);
  return record ?? null;
}

export async function paperlessConfigurationForHousehold(
  db: Database,
  householdId: string,
) {
  const record = await integrationRecord(db, householdId);
  if (!record) return deploymentPaperlessConfiguration();
  if (!record.enabled) return null;

  if (record.baseUrl && isEncryptedCredential(record.credentialRef)) {
    const baseUrl = normalizePaperlessUrl(record.baseUrl);
    return {
      baseUrl,
      token: decryptPaperlessToken(record.credentialRef!, householdId, baseUrl),
      source: "database" as const,
    };
  }
  if (record.credentialRef !== "deployment") return null;
  const deployment = deploymentPaperlessConfiguration();
  if (!deployment) return null;
  const baseUrl = record.baseUrl
    ? normalizePaperlessUrl(record.baseUrl)
    : deployment.baseUrl;
  if (baseUrl !== deployment.baseUrl) {
    throw new Error(
      "The deployment Paperless token can only be used with the deployment Paperless URL.",
    );
  }
  return {
    baseUrl,
    token: deployment.token,
    source: "deployment" as const,
  };
}

export async function paperlessIntegrationStatus(
  db: Database,
  householdId: string,
) {
  const record = await integrationRecord(db, householdId);
  let deploymentBaseUrl = process.env.PAPERLESS_URL?.trim() ?? "";
  let deploymentConfigured = false;
  try {
    const deployment = deploymentPaperlessConfiguration();
    deploymentBaseUrl = deployment?.baseUrl ?? deploymentBaseUrl;
    deploymentConfigured = Boolean(deployment);
  } catch {
    // The resolution attempt below reports the actionable configuration error.
  }
  const enabled = record ? record.enabled : deploymentConfigured;
  let configured = false;
  let source: "database" | "deployment" | null = null;
  let configurationError: string | null = null;
  try {
    const resolved = await paperlessConfigurationForHousehold(db, householdId);
    configured = Boolean(resolved);
    source = resolved?.source ?? null;
  } catch (cause) {
    configurationError =
      cause instanceof Error
        ? cause.message
        : "Paperless configuration could not be read.";
  }
  return {
    enabled,
    configured,
    baseUrl: record?.baseUrl ?? deploymentBaseUrl,
    source,
    configurationError,
  };
}

export async function paperlessClientForHousehold(
  db: Database,
  householdId: string,
) {
  const configuration = await paperlessConfigurationForHousehold(
    db,
    householdId,
  );
  return configuration
    ? new PaperlessClient(configuration.baseUrl, configuration.token)
    : null;
}

export function deploymentPaperlessClient() {
  const configuration = deploymentPaperlessConfiguration();
  return configuration
    ? new PaperlessClient(configuration.baseUrl, configuration.token)
    : null;
}

export async function savePaperlessConfiguration(
  db: Database,
  householdId: string,
  input: { baseUrl: string; token?: string },
) {
  const baseUrl = normalizePaperlessUrl(input.baseUrl);
  const existing = await integrationRecord(db, householdId);
  const credentialRef = paperlessCredentialRefForSave({
    householdId,
    baseUrl,
    token: input.token,
    existingBaseUrl: existing?.baseUrl,
    existingCredentialRef: existing?.credentialRef,
  });

  const [saved] = await db
    .insert(schema.integrations)
    .values({
      householdId,
      kind: "paperless",
      enabled: true,
      baseUrl,
      credentialRef,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [schema.integrations.householdId, schema.integrations.kind],
      set: {
        enabled: true,
        baseUrl,
        credentialRef,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}

export function paperlessCredentialRefForSave(input: {
  householdId: string;
  baseUrl: string;
  token?: string;
  existingBaseUrl?: string | null;
  existingCredentialRef?: string | null;
  source?: Environment;
}) {
  const baseUrl = normalizePaperlessUrl(input.baseUrl);
  if (input.token) {
    return encryptPaperlessToken(
      input.token,
      input.householdId,
      baseUrl,
      input.source,
    );
  }

  const existingBaseUrl = input.existingBaseUrl
    ? normalizePaperlessUrl(input.existingBaseUrl)
    : null;
  if (isEncryptedCredential(input.existingCredentialRef)) {
    if (existingBaseUrl !== baseUrl) {
      throw new Error(
        "Enter a new Paperless API token when changing the Paperless URL.",
      );
    }
    return input.existingCredentialRef!;
  }

  const deployment = deploymentPaperlessConfiguration(input.source);
  if (
    (input.existingCredentialRef === "deployment" ||
      !input.existingCredentialRef) &&
    deployment?.baseUrl === baseUrl
  ) {
    return "deployment";
  }

  throw new Error(
    "Enter a Paperless API token. Domino never returns a saved token to the browser.",
  );
}

export async function disconnectPaperless(db: Database, householdId: string) {
  const [saved] = await db
    .insert(schema.integrations)
    .values({
      householdId,
      kind: "paperless",
      enabled: false,
      credentialRef: null,
      baseUrl: null,
    })
    .onConflictDoUpdate({
      target: [schema.integrations.householdId, schema.integrations.kind],
      set: {
        enabled: false,
        credentialRef: null,
        baseUrl: null,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return saved;
}
