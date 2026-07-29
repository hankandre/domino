ALTER TABLE "users" ADD COLUMN "authentication_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD COLUMN "authentication_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "roles"
SET "permissions" = "permissions" || '["paperless:discover"]'::jsonb,
    "updated_at" = now()
WHERE lower("name") IN ('owner', 'member')
  AND NOT ("permissions" ? 'paperless:discover');--> statement-breakpoint
UPDATE "products"
SET "product_url" = NULL, "updated_at" = now()
WHERE "product_url" IS NOT NULL
  AND "product_url" !~* '^https?://';--> statement-breakpoint
UPDATE "warranties"
SET "claim_url" = NULL, "updated_at" = now()
WHERE "claim_url" IS NOT NULL
  AND "claim_url" !~* '^https?://';
