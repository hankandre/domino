CREATE INDEX "documents_purge_after_idx" ON "documents" USING btree ("purge_after","id") WHERE "documents"."backend" = 'local' and "documents"."purge_after" is not null;--> statement-breakpoint
CREATE INDEX "notes_claim_created_idx" ON "notes" USING btree ("claim_id","created_at","id");--> statement-breakpoint
CREATE INDEX "product_images_product_primary_created_idx" ON "product_images" USING btree ("product_id","primary","created_at","id");--> statement-breakpoint
CREATE INDEX "product_serials_product_created_idx" ON "product_serials" USING btree ("product_id","created_at","id");