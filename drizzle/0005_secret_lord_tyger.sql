ALTER TABLE "claims" ADD COLUMN "noticed_at" date;--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "preferred_resolution" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "order_number" text;--> statement-breakpoint
ALTER TABLE "warranties" ADD COLUMN "eligibility_notes" text;--> statement-breakpoint
ALTER TABLE "warranties" ADD COLUMN "claim_deadline" date;