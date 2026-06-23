ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "runtime_package" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD COLUMN IF NOT EXISTS "runtime_package" jsonb DEFAULT '{}'::jsonb NOT NULL;
