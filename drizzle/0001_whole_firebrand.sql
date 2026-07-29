CREATE TABLE "oidc_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"email_at_login" text,
	"claims" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "web_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oidc_identities" ADD CONSTRAINT "oidc_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "web_sessions" ADD CONSTRAINT "web_sessions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_identities_issuer_subject_unique" ON "oidc_identities" USING btree ("issuer","subject");--> statement-breakpoint
CREATE INDEX "oidc_identities_user_idx" ON "oidc_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "web_sessions_token_hash_unique" ON "web_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "web_sessions_actor_idx" ON "web_sessions" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "web_sessions_expires_idx" ON "web_sessions" USING btree ("expires_at");