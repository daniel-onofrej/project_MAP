CREATE TABLE IF NOT EXISTS "runtime_gateways" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"mode" text DEFAULT 'custom' NOT NULL,
	"description" text,
	"auth_mode" text DEFAULT 'local' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runtime_gateways" ADD CONSTRAINT "runtime_gateways_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runtime_gateways" ADD CONSTRAINT "runtime_gateways_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "runtime_gateways" DROP CONSTRAINT IF EXISTS "runtime_gateways_mode_check";--> statement-breakpoint
ALTER TABLE "runtime_gateways" ADD CONSTRAINT "runtime_gateways_mode_check" CHECK ("mode" IN ('local-docker', 'remote-docker', 'kubernetes', 'custom'));--> statement-breakpoint
ALTER TABLE "runtime_gateways" DROP CONSTRAINT IF EXISTS "runtime_gateways_auth_mode_check";--> statement-breakpoint
ALTER TABLE "runtime_gateways" ADD CONSTRAINT "runtime_gateways_auth_mode_check" CHECK ("auth_mode" IN ('local', 'mtls', 'token', 'custom'));--> statement-breakpoint
ALTER TABLE "runtime_gateways" DROP CONSTRAINT IF EXISTS "runtime_gateways_status_check";--> statement-breakpoint
ALTER TABLE "runtime_gateways" ADD CONSTRAINT "runtime_gateways_status_check" CHECK ("status" IN ('unknown', 'ready', 'error'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_gateways_created_by_idx" ON "runtime_gateways" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_gateways_group_id_idx" ON "runtime_gateways" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runtime_gateways_status_idx" ON "runtime_gateways" USING btree ("status");--> statement-breakpoint
DO $$ BEGIN
  CREATE TRIGGER trg_runtime_gateways_updated_at
    BEFORE UPDATE ON runtime_gateways
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
