CREATE TABLE "agent_deployments" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"agent_version_id" uuid,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"openshell_sandbox_name" text NOT NULL,
	"runtime_kind" text DEFAULT 'custom' NOT NULL,
	"runtime_command" text NOT NULL,
	"runtime_package" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"policy_yaml" text NOT NULL,
	"pinned_snapshot" jsonb NOT NULL,
	"pinned_prompt" text NOT NULL,
	"created_by" uuid NOT NULL,
	"group_id" uuid,
	"last_error" text,
	"last_log" text,
	"deployed_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployment_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deployment_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployment_messages" ADD CONSTRAINT "deployment_messages_deployment_id_agent_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."agent_deployments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_status_check" CHECK ("status" IN ('pending', 'provisioning', 'ready', 'stopped', 'error', 'deleting'));--> statement-breakpoint
ALTER TABLE "agent_deployments" ADD CONSTRAINT "agent_deployments_runtime_kind_check" CHECK ("runtime_kind" IN ('codex', 'claude-code', 'opencode', 'custom'));--> statement-breakpoint
ALTER TABLE "deployment_messages" ADD CONSTRAINT "deployment_messages_role_check" CHECK ("role" IN ('user', 'assistant', 'system', 'tool'));--> statement-breakpoint
ALTER TABLE "deployment_messages" ADD CONSTRAINT "deployment_messages_status_check" CHECK ("status" IN ('pending', 'success', 'error'));--> statement-breakpoint
CREATE INDEX "agent_deployments_agent_id_idx" ON "agent_deployments" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_deployments_created_by_idx" ON "agent_deployments" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "agent_deployments_group_id_idx" ON "agent_deployments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "agent_deployments_status_idx" ON "agent_deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "deployment_messages_deployment_id_idx" ON "deployment_messages" USING btree ("deployment_id","created_at");
