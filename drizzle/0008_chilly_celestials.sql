ALTER TABLE "user_invitations" ADD COLUMN "claim_access_scope" text DEFAULT 'selected' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD COLUMN "claim_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Invitations created before claim scoping did not capture the inviter's
-- authority. Revoking only pending legacy invitations is safer than silently
-- granting them all claims; administrators can issue a replacement with an
-- explicit scope after the upgrade.
UPDATE "user_invitations"
SET "revoked_at" = now()
WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_claim_access_scope_check" CHECK ("actors"."claim_access_scope" in ('all', 'selected'));--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_claim_access_scope_check" CHECK ("user_invitations"."claim_access_scope" in ('all', 'selected'));
