ALTER TABLE "agent_deployments" DROP CONSTRAINT IF EXISTS "agent_deployments_runtime_kind_check";--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_runtime_kind_check" CHECK ("runtime_kind" IN ('codex', 'claude-code', 'opencode', 'gemini-cli', 'custom'));--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "manifest_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "runtime_id" text DEFAULT 'custom' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "sandbox_image" text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "execution_mode" text DEFAULT 'oneshot' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "provider_mode" text DEFAULT 'legacy-env' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "gateway_id" text DEFAULT 'map' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "preflight_report" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "policy_revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "observed_phase" text;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD COLUMN IF NOT EXISTS "runtime_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "agent_deployments"
SET
  "manifest_version" = COALESCE("manifest_version", 1),
  "runtime_id" = CASE
    WHEN "runtime_id" IS NULL OR "runtime_id" = 'custom' THEN "runtime_kind"
    ELSE "runtime_id"
  END,
  "sandbox_image" = COALESCE(NULLIF("sandbox_image", ''), 'base'),
  "execution_mode" = COALESCE(NULLIF("execution_mode", ''), 'oneshot'),
  "provider_mode" = COALESCE(NULLIF("provider_mode", ''), 'legacy-env'),
  "gateway_id" = COALESCE(NULLIF("gateway_id", ''), 'map'),
  "policy_revision" = COALESCE("policy_revision", 1)
WHERE true;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_deployments_runtime_id_idx" ON "agent_deployments" USING btree ("runtime_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" text NOT NULL,
	"provider_name" text NOT NULL,
	"provider_type" text NOT NULL,
	"role" text DEFAULT 'llm' NOT NULL,
	"credential_keys" text[] DEFAULT '{}' NOT NULL,
	"attach_status" text DEFAULT 'pending' NOT NULL,
	"config_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" text NOT NULL,
	"event_type" text NOT NULL,
	"message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment_providers" ADD CONSTRAINT "deployment_providers_deployment_id_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."agent_deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployment_events" ADD CONSTRAINT "deployment_events_deployment_id_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."agent_deployments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
ALTER TABLE "deployment_providers" DROP CONSTRAINT IF EXISTS "deployment_providers_role_check";--> statement-breakpoint
ALTER TABLE "deployment_providers" ADD CONSTRAINT "deployment_providers_role_check" CHECK ("role" IN ('llm', 'tool', 'mcp', 'source-control', 'data', 'custom'));--> statement-breakpoint
ALTER TABLE "deployment_providers" DROP CONSTRAINT IF EXISTS "deployment_providers_attach_status_check";--> statement-breakpoint
ALTER TABLE "deployment_providers" ADD CONSTRAINT "deployment_providers_attach_status_check" CHECK ("attach_status" IN ('pending', 'attached', 'detached', 'error'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_providers_deployment_id_idx" ON "deployment_providers" USING btree ("deployment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_providers_name_idx" ON "deployment_providers" USING btree ("provider_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_events_deployment_id_idx" ON "deployment_events" USING btree ("deployment_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployment_events_type_idx" ON "deployment_events" USING btree ("event_type");--> statement-breakpoint
DO $$ BEGIN
  CREATE TRIGGER trg_deployment_providers_updated_at
    BEFORE UPDATE ON deployment_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
