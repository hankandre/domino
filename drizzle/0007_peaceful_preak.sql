CREATE TABLE "actor_claim_access" (
	"actor_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"granted_by_actor_id" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actor_claim_access_actor_id_claim_id_pk" PRIMARY KEY("actor_id","claim_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"request_hash" text NOT NULL,
	"status_code" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"url" text,
	"external_system" text,
	"external_id" text,
	"added_by_actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actors" ADD COLUMN "claim_access_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_images" ADD COLUMN "sha256" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_by_actor_id" uuid;--> statement-breakpoint
ALTER TABLE "actor_claim_access" ADD CONSTRAINT "actor_claim_access_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_claim_access" ADD CONSTRAINT "actor_claim_access_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_claim_access" ADD CONSTRAINT "actor_claim_access_granted_by_actor_id_actors_id_fk" FOREIGN KEY ("granted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sources" ADD CONSTRAINT "product_sources_added_by_actor_id_actors_id_fk" FOREIGN KEY ("added_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actor_claim_access_claim_idx" ON "actor_claim_access" USING btree ("claim_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_actor_scope_key_unique" ON "idempotency_keys" USING btree ("actor_id","scope","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_keys_household_idx" ON "idempotency_keys" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "product_sources_product_idx" ON "product_sources" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_sources_household_idx" ON "product_sources" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "product_sources_household_external_idx" ON "product_sources" USING btree ("household_id","external_system","external_id") WHERE "product_sources"."external_system" is not null and "product_sources"."external_id" is not null;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_actor_id_actors_id_fk" FOREIGN KEY ("created_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
UPDATE "roles"
SET "permissions" = "permissions" || '["products:read"]'::jsonb
WHERE "permissions" ? 'warranties:read'
  AND NOT "permissions" ? 'products:read';
--> statement-breakpoint
UPDATE "roles"
SET "permissions" = "permissions" || '["products:create","products:manage","warranties:create","warranties:manage","images:attach"]'::jsonb
WHERE "permissions" ? 'warranties:write';
--> statement-breakpoint
UPDATE "roles"
SET "permissions" = "permissions" || '["documents:manage"]'::jsonb
WHERE "permissions" ? 'documents:attach'
  AND NOT "permissions" ? 'documents:manage';
--> statement-breakpoint
INSERT INTO "roles" ("household_id", "name", "description", "permissions", "system")
SELECT
  "id",
  'Inventory Contributor',
  'Add household products and supporting material without changing existing records.',
  '["products:read","products:create","warranties:read","warranties:create","documents:read","documents:attach","images:attach","notes:read","notes:write"]'::jsonb,
  true
FROM "households"
ON CONFLICT ("household_id", "name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles" ("household_id", "name", "description", "permissions", "system")
SELECT
  "id",
  'Household Agent',
  'Manage household products, coverage, documents, notes, and claims without security administration.',
  '["products:read","products:create","products:manage","warranties:read","warranties:create","warranties:manage","claims:read","claims:create","claims:manage","documents:read","documents:attach","documents:manage","images:attach","notes:read","notes:write"]'::jsonb,
  true
FROM "households"
ON CONFLICT ("household_id", "name") DO NOTHING;
