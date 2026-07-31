import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const actorKind = pgEnum("actor_kind", ["user", "service"]);
export const documentBackend = pgEnum("document_backend", [
  "local",
  "paperless",
]);
export const documentKind = pgEnum("document_kind", [
  "receipt",
  "manual",
  "warranty",
  "photo",
  "claim",
  "other",
]);
export const claimStatus = pgEnum("claim_status", [
  "draft",
  "needs_evidence",
  "submitted",
  "in_review",
  "approved",
  "denied",
  "resolved",
  "closed",
]);
export const integrationKind = pgEnum("integration_kind", [
  "paperless",
  "image_provider",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const households = pgTable("households", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  defaultDocumentBackend: documentBackend("default_document_backend")
    .notNull()
    .default("local"),
  expiryWindowDays: integer("expiry_window_days").notNull().default(60),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash"),
    authenticationVersion: integer("authentication_version")
      .notNull()
      .default(1),
    disabled: boolean("disabled").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
  ],
);

export const oidcIdentities = pgTable(
  "oidc_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    emailAtLogin: text("email_at_login"),
    claims: jsonb("claims")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("oidc_identities_issuer_subject_unique").on(
      table.issuer,
      table.subject,
    ),
    index("oidc_identities_user_idx").on(table.userId),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    system: boolean("system").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("roles_household_name_unique").on(
      table.householdId,
      table.name,
    ),
  ],
);

export const actors = pgTable("actors", {
  id: uuid("id").primaryKey().defaultRandom(),
  householdId: uuid("household_id")
    .notNull()
    .references(() => households.id, { onDelete: "cascade" }),
  kind: actorKind("kind").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  claimAccessScope: text("claim_access_scope")
    .$type<"all" | "selected">()
    .notNull()
    .default("all"),
  disabled: boolean("disabled").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...timestamps,
});

export const actorRoles = pgTable(
  "actor_roles",
  {
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    grantedByActorId: uuid("granted_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.actorId, table.roleId] })],
);

export const apiCredentials = pgTable(
  "api_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("api_credentials_hash_unique").on(table.tokenHash)],
);

export const webSessions = pgTable(
  "web_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    authenticationVersion: integer("authentication_version")
      .notNull()
      .default(1),
    userAgentHash: text("user_agent_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("web_sessions_token_hash_unique").on(table.tokenHash),
    index("web_sessions_actor_idx").on(table.actorId),
    index("web_sessions_expires_idx").on(table.expiresAt),
  ],
);

export const userInvitations = pgTable(
  "user_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    invitedByActorId: uuid("invited_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_invitations_token_hash_unique").on(table.tokenHash),
    index("user_invitations_household_email_idx").on(
      table.householdId,
      table.email,
    ),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    createdByActorId: uuid("created_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    model: text("model"),
    category: text("category"),
    retailer: text("retailer"),
    orderNumber: text("order_number"),
    productUrl: text("product_url"),
    purchaseDate: date("purchase_date"),
    purchasePriceMinor: integer("purchase_price_minor"),
    currency: text("currency").notNull().default("USD"),
    createdByActorId: uuid("created_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("products_household_idx").on(table.householdId),
    index("products_household_name_idx").on(table.householdId, table.name),
  ],
);

export const productSources = pgTable(
  "product_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label"),
    url: text("url"),
    externalSystem: text("external_system"),
    externalId: text("external_id"),
    addedByActorId: uuid("added_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_sources_product_idx").on(table.productId),
    index("product_sources_household_idx").on(table.householdId),
    index("product_sources_household_external_idx")
      .on(table.householdId, table.externalSystem, table.externalId)
      .where(
        sql`${table.externalSystem} is not null and ${table.externalId} is not null`,
      ),
  ],
);

export const productSerials = pgTable(
  "product_serials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("product_serials_value_idx").on(table.value)],
);

export const warranties = pgTable(
  "warranties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    provider: text("provider"),
    kind: text("kind").notNull().default("manufacturer"),
    startsAt: date("starts_at"),
    endsAt: date("ends_at"),
    lifetime: boolean("lifetime").notNull().default(false),
    terms: text("terms"),
    claimUrl: text("claim_url"),
    claimPhone: text("claim_phone"),
    claimEmail: text("claim_email"),
    eligibilityNotes: text("eligibility_notes"),
    claimDeadline: date("claim_deadline"),
    claimInstructions: jsonb("claim_instructions")
      .$type<Array<{ title: string; detail?: string; required: boolean }>>()
      .notNull()
      .default([]),
    ...timestamps,
  },
  (table) => [index("warranties_product_idx").on(table.productId)],
);

export const productImages = pgTable("product_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  sourceUrl: text("source_url"),
  storageKey: text("storage_key"),
  sha256: text("sha256"),
  altText: text("alt_text"),
  primary: boolean("primary").notNull().default(false),
  confirmedByActorId: uuid("confirmed_by_actor_id").references(
    () => actors.id,
    { onDelete: "set null" },
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "cascade",
    }),
    authorActorId: uuid("author_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    ...timestamps,
  },
  (table) => [index("notes_product_idx").on(table.productId)],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    warrantyId: uuid("warranty_id").references(() => warranties.id, {
      onDelete: "set null",
    }),
    reference: text("reference").notNull(),
    status: claimStatus("status").notNull().default("draft"),
    issue: text("issue").notNull(),
    noticedAt: date("noticed_at"),
    preferredResolution: text("preferred_resolution"),
    resolution: text("resolution"),
    nextAction: text("next_action"),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    openedByActorId: uuid("opened_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("claims_household_reference_unique").on(
      table.householdId,
      table.reference,
    ),
    index("claims_product_idx").on(table.productId),
  ],
);

export const actorClaimAccess = pgTable(
  "actor_claim_access",
  {
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    grantedByActorId: uuid("granted_by_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.actorId, table.claimId] }),
    index("actor_claim_access_claim_idx").on(table.claimId),
  ],
);

export const claimEvents = pgTable(
  "claim_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("claim_events_claim_idx").on(table.claimId, table.occurredAt),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    claimId: uuid("claim_id").references(() => claims.id, {
      onDelete: "cascade",
    }),
    kind: documentKind("kind").notNull().default("other"),
    backend: documentBackend("backend").notNull(),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    localStorageKey: text("local_storage_key"),
    paperlessDocumentId: integer("paperless_document_id"),
    paperlessUrl: text("paperless_url"),
    paperlessTaskId: text("paperless_task_id"),
    processingStatus: text("processing_status").notNull().default("ready"),
    uploadedByActorId: uuid("uploaded_by_actor_id").references(
      () => actors.id,
      { onDelete: "set null" },
    ),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("documents_product_idx").on(table.productId),
    index("documents_claim_idx").on(table.claimId),
  ],
);

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    kind: integrationKind("kind").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    baseUrl: text("base_url"),
    credentialRef: text("credential_ref"),
    settings: jsonb("settings")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("integrations_household_kind_unique").on(
      table.householdId,
      table.kind,
    ),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_events_household_idx").on(table.householdId, table.createdAt),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    statusCode: integer("status_code").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_actor_scope_key_unique").on(
      table.actorId,
      table.scope,
      table.keyHash,
    ),
    index("idempotency_keys_household_idx").on(
      table.householdId,
      table.createdAt,
    ),
  ],
);

export const cliDeviceCodes = pgTable(
  "cli_device_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "cascade",
    }),
    requestedName: text("requested_name").notNull(),
    deviceCodeHash: text("device_code_hash").notNull(),
    userCode: text("user_code").notNull(),
    approvedActorId: uuid("approved_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    serviceActorId: uuid("service_actor_id").references(() => actors.id, {
      onDelete: "set null",
    }),
    credentialId: uuid("credential_id").references(() => apiCredentials.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("cli_device_codes_hash_unique").on(table.deviceCodeHash),
    uniqueIndex("cli_device_codes_user_code_unique").on(table.userCode),
  ],
);
